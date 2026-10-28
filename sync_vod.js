// ======================================================
// مكان الملف: في GitHub داخل المستودع الرئيسي
// اسم الملف: sync_vod.js
// ======================================================
const fs = require('fs');
const path = require('path');

const HOST = "http://raha66.xyz:80";

// حسابات لسحب القوائم تلقائياً
const ACCOUNTS = [
  { u: "MAGPX8RWE6",      p: "MAG91PFESJ", exp: "2027-04-13" },
  { u: "MAGCZ4NTYA",      p: "MAGHU4H4BY", exp: "2027-05-06" },
  { u: "EHYAJE9B27DPLVS", p: "s0zGIayIPG", exp: "2027-01-16" },
  { u: "MAGAY1SBCD",      p: "MAGC8B97CZ", exp: "2027-07-06" },
  { u: "MAGL4EZGLR",      p: "MAGV5M77LT", exp: "2027-05-30" },
  { u: "PW451B965322PX8", p: "g2ZiHclbLD", exp: "2027-02-15" },
  { u: "966737562799446", p: "mYWdatfZ4I", exp: "2027-02-26" },
  { u: "F03693317D21",    p: "Ht24TMVifV", exp: "2026-11-13" },
  { u: "R3ZVDZN8KTB8H5U", p: "nn07zp51JV", exp: "2027-03-03" },
  { u: "VTUE3527R5345W2", p: "IlrJGp2CTk", exp: "2027-09-29" },
  { u: "C8660D71F88FD3A", p: "DiMdw4asEn", exp: "2027-01-22" },
  { u: "6C1ZMUK472YY1NF", p: "1mHM8nRIW9", exp: "2027-10-16" },
  { u: "0C9AC46FF415F45", p: "FEZWpyZLsv", exp: "2027-01-04" },
  { u: "MAG4CJ6CER",      p: "MAGVGJ4T71", exp: "2027-05-30" },
  { u: "MAGKMA7H7Y",      p: "MAG3LBYFXR", exp: "2027-08-05" },
  { u: "MAG82MQVWG",      p: "MAGE56JF4S", exp: "2027-05-16" },
  { u: "MAG8FRBX31",      p: "MAG3BZ4JZM", exp: "2027-10-16" },
  { u: "071D25239A3802C", p: "JhqMjPc53v", exp: "2027-01-24" },
  { u: "MAG7BSGFBB",      p: "MAGWCY9XHC", exp: "2027-07-30" },
  { u: "1MH9BBK8F9M4937", p: "yGreKtLEmk", exp: "2026-12-24" },
  { u: "MAG1E3UZV9",      p: "MAG591LJVE", exp: "2027-07-06" },
  { u: "A263C009AC3F757", p: "4InSJJjkjM", exp: "2027-02-16" },
  { u: "QE5RHBT5TJJ3PU1", p: "kr0t9fSRpc", exp: "2027-06-30" }
];

function isAllowedCategory(name) {
  if (!name) return false;
  const clean = String(name).trim();
  if (/[\u0600-\u06FF]/.test(clean)) return true;
  if (/(?<![a-zA-Z])(AR|FR|ARAB|ARABIC|FRANCE|FRENCH|RAMADAN)(?![a-zA-Z])/i.test(clean)) return true;
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
