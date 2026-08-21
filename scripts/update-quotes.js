/* 每日行情更新：抓 TWSE OpenAPI → 產出 data/quotes.json
   用法：node scripts/update-quotes.js（在 stock-alerts 目錄下執行）
   資料授權：政府資料開放授權條款（標示來源、非官方背書） */
const fs = require("fs");
const path = require("path");

async function main() {
  const res = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL");
  if (!res.ok) throw new Error("TWSE API HTTP " + res.status);
  const raw = await res.json();
  const stocks = {};
  for (const r of raw) {
    const p = parseFloat(r.ClosingPrice);
    if (!r.Code || Number.isNaN(p) || !r.Name) continue;
    stocks[r.Code] = [r.Name, r.ClosingPrice];
  }
  const roc = String(raw[0].Date || "");
  const date = roc.length >= 7 ? `${parseInt(roc.slice(0, 3), 10) + 1911}/${roc.slice(3, 5)}/${roc.slice(5, 7)}` : "";
  const out = {
    updated: date,
    rocDate: roc,
    source: "臺灣證券交易所 OpenAPI（STOCK_DAY_AVG_ALL）",
    license: "政府資料開放授權條款",
    stocks,
  };
  const file = path.join(__dirname, "..", "data", "quotes.json");
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`OK ${date} — ${Object.keys(stocks).length} 檔 — ${(fs.statSync(file).size / 1024).toFixed(0)}KB`);
}

main().catch((e) => {
  console.error("UPDATE FAILED:", e.message);
  process.exit(1);
});
