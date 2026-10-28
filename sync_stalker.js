// ======================================================
// مكان الملف: في GitHub داخل المستودع الرئيسي
// اسم الملف: sync_stalker.js (النسخة المضادة للحظر)
// ======================================================
const fs = require('fs');
const path = require('path');

const HOST = "http://line.hey-ott.net:80";
// إذا كان السيرفر يحظر GitHub، ضع رابط الـ Worker الخاص بك هنا بين علامتي التنصيص (مثال: "https://my-worker.workers.dev")
const WORKER_PROXY_URL = ""; 

const ENDPOINTS = [
  `${HOST}/portal/server/load.php`,
  `${HOST}/server/load.php`,
  `${HOST}/c/server/load.php`
];

const MACS = [
  "00:1A:79:B5:D0:3A", "00:1A:79:3A:9B:02", "00:1A:79:19:88:F9",
  "00:1A:79:01:77:9C", "00:1A:79:AF:8F:4F", "00:1A:79:F7:52:AF",
  "00:1A:79:DD:80:A4", "00:1A:79:B8:90:0F", "00:1A:79:56:29:68",
  "00:1A:79:6E:21:0A", "00:1A:79:7A:A6:CB", "00:1A:79:BB:40:C6",
  "00:1A:79:A2:B7:07", "00:1A:79:C7:0D:CE", "00:1A:79:6E:3E:67",
  "00:1A:79:65:3B:4D", "00:1A:79:F5:18:3E"
];

function isAllowedCategory(name) {
  if (!name) return false;
  const clean = String(name).trim();
  return /[┃|丨｜]\s*(AR|FR)\s*[┃|丨｜]/i.test(clean) ||
         /^(\s*G\s*)?[┃|丨｜]?\s*(AR|FR)\b/i.test(clean) ||
         /[\u0600-\u06FF]/.test(clean) ||
         /(?<![a-zA-Z])(AR|FR|ARAB|ARABIC|FRANCE|FRENCH)(?![a-zA-Z])/i.test(clean);
}

function formatTitle(name) {
  if (!name) return "";
  return String(name)
    .replace(/[┃|丨｜]\s*AR\s*[┃|丨｜]/gi, "✪AR✪")
    .replace(/[┃|丨｜]\s*FR\s*[┃|丨｜]/gi, "✪FR✪");
}

function buildUrl(targetUrl) {
  if (WORKER_PROXY_URL) {
    return `${WORKER_PROXY_URL.replace(/\/$/, "")}/stalker_proxy?url=${encodeURIComponent(targetUrl)}`;
  }
  return targetUrl;
}

function getStalkerHeaders(mac, token = "") {
  const headers = {
    "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
    "X-User-Agent": "Model: MAG250; Link: WiFi",
    "Referer": `${HOST}/c/`,
    "Cookie": `mac=${mac}; stb_lang=en; timezone=Europe/Paris;`
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function fetchJsonSafe(url, headers) {
  const res = await fetch(buildUrl(url), {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 80)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 80)}`);
  }
}

async function tryConnectMac(endpoint, mac) {
  // 1. Handshake (بدون encodeURIComponent للـ MAC كما يفضل السيرفر)
  const hsUrl = `${endpoint}?type=stb&action=handshake&mac=${mac}&token=&JsHttpRequest=1-xml`;
  const hsData = await fetchJsonSafe(hsUrl, getStalkerHeaders(mac));
  const token = hsData?.js?.token;
  if (!token) throw new Error("No token returned");

  // 2. تفعيل الجلسة عبر get_profile (إجباري في كثير من سيرفرات Stalker قبل جلب الأفلام)
  const profUrl = `${endpoint}?type=stb&action=get_profile&hd=1&sn=012019N001918&stb_type=MAG250&mac=${mac}&JsHttpRequest=1-xml`;
  await fetch(buildUrl(profUrl), {
    headers: getStalkerHeaders(mac, token),
    signal: AbortSignal.timeout(10000)
  }).catch(() => {});

  // 3. فحص جلب باقات الأفلام
  const catUrl = `${endpoint}?type=vod&action=get_categories&mac=${mac}&JsHttpRequest=1-xml`;
  const catData = await fetchJsonSafe(catUrl, getStalkerHeaders(mac, token));
  if (Array.isArray(catData?.js) && catData.js.length > 0) {
    return { endpoint, mac, token, vodCatsRaw: catData.js };
  }
  throw new Error("Empty VOD categories");
}

async function getWorkingSession() {
  for (const endpoint of ENDPOINTS) {
    for (const mac of MACS) {
      try {
        const session = await tryConnectMac(endpoint, mac);
        console.log(`✅ Connected with MAC ${mac} on ${endpoint}`);
        return session;
      } catch (e) {
        console.log(`❌ [${mac}] ${e.message}`);
      }
    }
  }
  throw new Error("Could not connect to Stalker portal. If you see HTTP 403/Cloudflare/Timeout above, set WORKER_PROXY_URL.");
}

async function fetchStalkerCategories(endpoint, mac, token, type = "series") {
  const url = `${endpoint}?type=${type}&action=get_categories&mac=${mac}&JsHttpRequest=1-xml`;
  const data = await fetchJsonSafe(url, getStalkerHeaders(mac, token));
  return Array.isArray(data?.js) ? data.js : [];
}

async function fetchStalkerItemsByCategory(endpoint, mac, token, type, categoryId, maxPages = 10) {
  const items = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `${endpoint}?type=${type}&action=get_ordered_list&category=${categoryId}&p=${page}&sortby=added&mac=${mac}&JsHttpRequest=1-xml`;
      const json = await fetchJsonSafe(url, getStalkerHeaders(mac, token));
      const rows = json?.js?.data;
      if (!Array.isArray(rows) || rows.length === 0) break;
      items.push(...rows);
      const totalItems = parseInt(json?.js?.total_items || "0", 10);
      if (items.length >= totalItems) break;
    } catch {
      break;
    }
  }
  return items;
}

async function main() {
  const dir = path.join(__dirname, 'cache_stalker');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { endpoint, mac, token, vodCatsRaw } = await getWorkingSession();

  console.log("1. جاري فلترة باقات الأفلام...");
  const vodCats = vodCatsRaw
    .filter(c => c.id !== "*" && isAllowedCategory(c.title))
    .map(c => ({
      category_id: String(c.id),
      category_name: formatTitle(c.title),
      parent_id: 0
    }));
  fs.writeFileSync(path.join(dir, 'get_vod_categories.json'), JSON.stringify(vodCats));

  console.log(`2. جاري سحب الأفلام من ${vodCats.length} باقة...`);
  const allVodStreams = [];
  let vodCounter = 1;
  for (const cat of vodCats) {
    const rows = await fetchStalkerItemsByCategory(endpoint, mac, token, "vod", cat.category_id, 10);
    for (const item of rows) {
      allVodStreams.push({
        num: vodCounter++,
        name: formatTitle(item.name || item.o_name || "Movie"),
        stream_type: "movie",
        stream_id: Number(item.id) || String(item.id),
        stream_icon: item.screenshot_uri || "",
        rating: item.rating_imdb || "0",
        rating_5based: 0,
        added: "1600000000",
        category_id: String(cat.category_id),
        container_extension: "mp4",
        custom_sid: "",
        direct_source: ""
      });
    }
  }
  fs.writeFileSync(path.join(dir, 'get_vod_streams.json'), JSON.stringify(allVodStreams));

  console.log("3. جاري سحب باقات المسلسلات...");
  const rawSeriesCats = await fetchStalkerCategories(endpoint, mac, token, "series");
  const seriesCats = rawSeriesCats
    .filter(c => c.id !== "*" && isAllowedCategory(c.title))
    .map(c => ({
      category_id: String(c.id),
      category_name: formatTitle(c.title),
      parent_id: 0
    }));
  fs.writeFileSync(path.join(dir, 'get_series_categories.json'), JSON.stringify(seriesCats));

  console.log(`4. جاري سحب المسلسلات من ${seriesCats.length} باقة...`);
  const allSeries = [];
  let serCounter = 1;
  for (const cat of seriesCats) {
    const rows = await fetchStalkerItemsByCategory(endpoint, mac, token, "series", cat.category_id, 8);
    for (const item of rows) {
      allSeries.push({
        num: serCounter++,
        name: formatTitle(item.name || item.o_name || "Series"),
        series_id: Number(item.id) || String(item.id),
        cover: item.screenshot_uri || "",
        plot: item.description || "",
        cast: item.actors || "",
        director: item.director || "",
        genre: item.genres_str || "",
        releaseDate: item.year || "",
        last_modified: "1600000000",
        rating: item.rating_imdb || "0",
        rating_5based: 0,
        backdrop_path: [],
        youtube_trailer: "",
        episode_run_time: "0",
        category_id: String(cat.category_id)
      });
    }
  }
  fs.writeFileSync(path.join(dir, 'get_series.json'), JSON.stringify(allSeries));

  console.log("✅ تم حفظ جميع الملفات بنجاح في مجلد cache_stalker!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
