// ======================================================
// مكان الملف: في GitHub داخل المستودع الرئيسي
// اسم الملف: sync_stalker.js (خاص بسيرفر hey-ott)
// ======================================================
const fs = require('fs');
const path = require('path');

const HOST = "http://line.hey-ott.net:80";
const STALKER = "http://line.hey-ott.net:80/portal/server/load.php";

const MACS = [
  "00:1A:79:B5:D0:3A", "00:1A:79:3A:9B:02", "00:1A:79:19:88:F9",
  "00:1A:79:01:77:9C", "00:1A:79:AF:8F:4F", "00:1A:79:F7:52:AF",
  "00:1A:79:DD:80:A4", "00:1A:79:B8:90:0F", "00:1A:79:56:29:68"
];

// فلترة الباقات التي تحتوي على ┃AR┃ أو ┃FR┃ (أو |AR| و |FR| بجميع أشكال الخطوط العمودية)
function isAllowedCategory(name) {
  if (!name) return false;
  const clean = String(name).trim();
  return /[┃|丨｜]\s*(AR|FR)\s*[┃|丨｜]/i.test(clean) ||
         /^(\s*G\s*)?[┃|丨｜]?\s*(AR|FR)\b/i.test(clean);
}

// تحويل ┃AR┃ إلى ✪AR✪ و ┃FR┃ إلى ✪FR✪
function formatTitle(name) {
  if (!name) return "";
  return String(name)
    .replace(/[┃|丨｜]\s*AR\s*[┃|丨｜]/gi, "✪AR✪")
    .replace(/[┃|丨｜]\s*FR\s*[┃|丨｜]/gi, "✪FR✪");
}

async function getStalkerToken(mac) {
  const url = `${STALKER}?type=stb&action=handshake&mac=${encodeURIComponent(mac)}&JsHttpRequest=1-xml`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
      "Cookie": `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe/Paris;`
    },
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json();
  return data?.js?.token || null;
}

async function fetchStalkerCategories(mac, token, type = "vod") {
  const url = `${STALKER}?type=${type}&action=get_categories&mac=${encodeURIComponent(mac)}&JsHttpRequest=1-xml`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
      "Authorization": `Bearer ${token}`,
      "Cookie": `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe/Paris;`
    },
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json();
  return Array.isArray(data?.js) ? data.js : [];
}

async function fetchStalkerItemsByCategory(mac, token, type, categoryId, maxPages = 15) {
  const items = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `${STALKER}?type=${type}&action=get_ordered_list&category=${categoryId}&p=${page}&sortby=added&mac=${encodeURIComponent(mac)}&JsHttpRequest=1-xml`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3",
          "Authorization": `Bearer ${token}`,
          "Cookie": `mac=${encodeURIComponent(mac)}; stb_lang=en; timezone=Europe/Paris;`
        },
        signal: AbortSignal.timeout(15000)
      });
      const json = await res.json();
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

async function getWorkingSession() {
  for (const mac of MACS) {
    try {
      const token = await getStalkerToken(mac);
      if (token) {
        const testCats = await fetchStalkerCategories(mac, token, "vod");
        if (testCats.length > 0) {
          console.log(`Connected successfully with MAC: ${mac}`);
          return { mac, token };
        }
      }
    } catch (e) {
      console.log(`MAC ${mac} failed, trying next...`);
    }
  }
  throw new Error("Could not connect to Stalker portal with any MAC");
}

async function main() {
  // مجلد خاص بهذا السيرفر حتى لا يتصادم مع السكريبت الأول
  const dir = path.join(__dirname, 'cache_stalker');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { mac, token } = await getWorkingSession();

  // 1. سحب وفلترة باقات الأفلام
  console.log("1. جاري سحب باقات الأفلام...");
  const rawVodCats = await fetchStalkerCategories(mac, token, "vod");
  const vodCats = rawVodCats
    .filter(c => c.id !== "*" && isAllowedCategory(c.title))
    .map(c => ({
      category_id: String(c.id),
      category_name: formatTitle(c.title),
      parent_id: 0
    }));
  fs.writeFileSync(path.join(dir, 'get_vod_categories.json'), JSON.stringify(vodCats));

  // 2. سحب الأفلام التابعة للباقات المفلترة
  console.log(`2. جاري سحب الأفلام من ${vodCats.length} باقة...`);
  const allVodStreams = [];
  let vodCounter = 1;
  for (const cat of vodCats) {
    const rows = await fetchStalkerItemsByCategory(mac, token, "vod", cat.category_id, 12);
    for (const item of rows) {
      allVodStreams.push({
        num: vodCounter++,
        name: formatTitle(item.name || item.o_name || "Movie"),
        stream_type: "movie",
        stream_id: Number(item.id) || String(item.id),
        stream_icon: item.screenshot_uri || "",
        rating: item.rating_imdb || "0",
        rating_5based: 0,
        added: item.added ? String(Math.floor(new Date(item.added).getTime() / 1000) || "1600000000") : "1600000000",
        category_id: String(cat.category_id),
        container_extension: "mp4",
        custom_sid: "",
        direct_source: ""
      });
    }
  }
  fs.writeFileSync(path.join(dir, 'get_vod_streams.json'), JSON.stringify(allVodStreams));

  // 3. سحب وفلترة باقات المسلسلات
  console.log("3. جاري سحب باقات المسلسلات...");
  const rawSeriesCats = await fetchStalkerCategories(mac, token, "series");
  const seriesCats = rawSeriesCats
    .filter(c => c.id !== "*" && isAllowedCategory(c.title))
    .map(c => ({
      category_id: String(c.id),
      category_name: formatTitle(c.title),
      parent_id: 0
    }));
  fs.writeFileSync(path.join(dir, 'get_series_categories.json'), JSON.stringify(seriesCats));

  // 4. سحب المسلسلات التابعة للباقات المفلترة
  console.log(`4. جاري سحب المسلسلات من ${seriesCats.length} باقة...`);
  const allSeries = [];
  let serCounter = 1;
  for (const cat of seriesCats) {
    const rows = await fetchStalkerItemsByCategory(mac, token, "series", cat.category_id, 10);
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

  console.log("تم حفظ القوائم بنجاح في مجلد cache_stalker!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
