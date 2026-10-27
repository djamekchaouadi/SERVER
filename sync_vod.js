// ======================================================
// مكان الملف: في GitHub داخل المستودع الرئيسي
// اسم الملف: sync_vod.js
// ======================================================
const fs = require('fs');
const path = require('path');

const HOST = "http://new-kids.xyz:80";

// حسابات لسحب القوائم تلقائياً
const ACCOUNTS = [
  { u: "8W5KX2H91S4323Z", p: "g4KdE3BKdn" },
  { u: "6WG9V8SNURYS25F", p: "r4m0vcwwfZ" },
  { u: "649040128000902", p: "0cYUKKV8wF" },
  { u: "630343888081164", p: "1IkWgPBSzG" },
  { u: "81D9TA348FP2SW3", p: "v7RQdjWc3y" }
];

function isAllowedCategory(name) {
  if (!name) return false;
  const clean = String(name).trim();
  if (/[\u0600-\u06FF]/.test(clean)) return true;
  if (/(?<![a-zA-Z])(AR|FR|ARAB|ARABIC|FRANCE|FRENCH)(?![a-zA-Z])/i.test(clean)) return true;
  return false;
}

async function fetchXtream(action) {
  for (const acc of ACCOUNTS) {
    try {
      const url = `${HOST}/player_api.php?username=${acc.u}&password=${acc.p}&action=${action}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "IBOPlayer/1.4 (Linux; Android 11)" },
        signal: AbortSignal.timeout(30000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`Success fetching ${action} using ${acc.u}`);
        return data;
      }
    } catch (e) {
      console.log(`Failed with ${acc.u} for ${action}, trying next...`);
    }
  }
  throw new Error(`Could not fetch ${action} from any account`);
}

async function main() {
  const dir = path.join(__dirname, 'cache');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log("1. جاري سحب باقات الأفلام...");
  const vodCatsRaw = await fetchXtream("get_vod_categories");
  const vodCats = vodCatsRaw.filter(c => isAllowedCategory(c.category_name));
  const allowedVodIds = new Set(vodCats.map(c => String(c.category_id)));
  fs.writeFileSync(path.join(dir, 'get_vod_categories.json'), JSON.stringify(vodCats));

  console.log("2. جاري سحب قائمة الأفلام...");
  const vodStreamsRaw = await fetchXtream("get_vod_streams");
  const vodStreams = vodStreamsRaw
    .filter(item => allowedVodIds.has(String(item.category_id)))
    .map(item => ({ ...item, direct_source: "" }));
  fs.writeFileSync(path.join(dir, 'get_vod_streams.json'), JSON.stringify(vodStreams));

  console.log("3. جاري سحب باقات المسلسلات...");
  const seriesCatsRaw = await fetchXtream("get_series_categories");
  const seriesCats = seriesCatsRaw.filter(c => isAllowedCategory(c.category_name));
  const allowedSeriesIds = new Set(seriesCats.map(c => String(c.category_id)));
  fs.writeFileSync(path.join(dir, 'get_series_categories.json'), JSON.stringify(seriesCats));

  console.log("4. جاري سحب قائمة المسلسلات...");
  const seriesRaw = await fetchXtream("get_series");
  const seriesList = seriesRaw.filter(item => allowedSeriesIds.has(String(item.category_id)));
  fs.writeFileSync(path.join(dir, 'get_series.json'), JSON.stringify(seriesList));

  console.log("تم حفظ جميع الملفات بنجاح في مجلد cache!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
