"use strict";

/* 到價哨兵 — 純前端，資料只在瀏覽器 localStorage。
   行情來源：同源 data/quotes.json（每日收盤後由更新腳本產生）。 */

const WATCH_KEY = "ps-watchlist";
const HIST_KEY = "ps-history";

const $ = (id) => document.getElementById(id);

let QUOTES = null; /* { updated, rocDate, stocks: { code: [name, close] } } */

function loadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function saveJson(key, v) {
  localStorage.setItem(key, JSON.stringify(v));
}

async function loadQuotes(force) {
  const status = $("data-status");
  if (QUOTES && !force) return QUOTES;
  status.textContent = "正在載入行情資料…";
  try {
    const res = await fetch("data/quotes.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    QUOTES = await res.json();
    status.innerHTML = `<span>📅 行情日期：<strong>${QUOTES.updated}</strong>（每日收盤後更新）</span><span>📦 收錄 <strong>${Object.keys(QUOTES.stocks).length.toLocaleString()}</strong> 檔上市證券</span><span>🏛️ 來源：${QUOTES.source}｜${QUOTES.license}</span>`;
  } catch (e) {
    status.innerHTML = `<span style="color:var(--up)">❌ 行情資料載入失敗（${String(e.message || e)}）——請稍後再試，或以交易所官方網站為準。</span>`;
    QUOTES = null;
  }
  return QUOTES;
}

function addItem() {
  const code = $("in-code").value.trim();
  const target = parseFloat($("in-target").value);
  const dir = $("in-dir").value;
  const note = $("in-note").value.trim();
  if (!/^\d{3,6}[A-Z]?$/.test(code)) {
    alert("請輸入正確的股票代號（數字 3-6 碼，權證請自行確認代號）");
    return;
  }
  if (Number.isNaN(target) || target <= 0) {
    alert("請輸入有效的目標價");
    return;
  }
  if (QUOTES && !QUOTES.stocks[code] && !confirm(`資料中找不到代號 ${code}（可能為上櫃或新商品，目前僅支援上市）。仍要加入嗎？`)) {
    return;
  }
  const list = loadJson(WATCH_KEY);
  if (list.some((x) => x.code === code && x.target === target && x.dir === dir)) {
    alert("這個條件已經在清單裡了。");
    return;
  }
  list.unshift({ code, target, dir, note, added: new Date().toISOString().slice(0, 10) });
  saveJson(WATCH_KEY, list);
  $("in-code").value = "";
  $("in-target").value = "";
  $("in-note").value = "";
  renderWatch();
}

function removeItem(code, target, dir) {
  saveJson(WATCH_KEY, loadJson(WATCH_KEY).filter((x) => !(x.code === code && x.target === target && x.dir === dir)));
  renderWatch();
}

function judge(item, price) {
  if (price == null) return "err";
  return item.dir === "lte" ? (price <= item.target ? "hit" : "wait") : price >= item.target ? "hit" : "wait";
}

function recordHits(rows) {
  const hist = loadJson(HIST_KEY);
  const today = QUOTES ? QUOTES.updated : "";
  let added = 0;
  for (const r of rows) {
    if (r.status !== "hit") continue;
    const dup = hist.some((h) => h.code === r.code && h.date === today && r.item.target === h.target);
    if (dup) continue;
    hist.unshift({ code: r.code, name: r.name, price: r.price, target: r.item.target, dir: r.item.dir, date: today });
    added++;
  }
  if (added) saveJson(HIST_KEY, hist.slice(0, 100));
  return added;
}

function renderWatch() {
  const body = $("watch-body");
  const list = loadJson(WATCH_KEY);
  $("watch-empty").hidden = list.length > 0;
  const rows = [];
  body.innerHTML = "";
  for (const item of list) {
    const meta = QUOTES ? QUOTES.stocks[item.code] : null;
    const name = meta ? meta[0] : "—";
    const price = meta ? parseFloat(meta[1]) : null;
    const status = QUOTES ? judge(item, price) : "unknown";
    rows.push({ code: item.code, name, price, item, status });
  }
  const order = { hit: 0, err: 1, wait: 2, unknown: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status]);
  for (const r of rows) {
    const tr = document.createElement("tr");
    const tag =
      r.status === "hit" ? '<span class="tag tag-hit">✅ 已觸發</span>'
      : r.status === "wait" ? '<span class="tag tag-wait">未觸發</span>'
      : r.status === "err" ? '<span class="tag tag-err">查無資料</span>'
      : "—";
    const cond = `${r.item.dir === "lte" ? "≤" : "≥"} ${r.item.target}${r.item.note ? `<br><span style="color:var(--muted);font-size:.78rem">${r.item.note}</span>` : ""}`;
    tr.innerHTML = `
      <td class="code">${r.code}</td>
      <td>${r.name}</td>
      <td class="num">${cond}</td>
      <td class="num">${r.price != null ? r.price.toFixed(2) : "—"}</td>
      <td>${tag}</td>
      <td><button class="del" title="刪除">✕</button></td>`;
    tr.querySelector(".del").addEventListener("click", () => removeItem(r.code, r.item.target, r.item.dir));
    body.appendChild(tr);
  }
  return rows;
}

function renderHist() {
  const box = $("hist-list");
  const hist = loadJson(HIST_KEY);
  $("hist-empty").hidden = hist.length > 0;
  box.innerHTML = "";
  for (const h of hist) {
    const div = document.createElement("div");
    div.className = "hist-item";
    div.innerHTML = `<strong>${h.code}</strong> ${h.name} <span>收盤 <span class="num">${Number(h.price).toFixed(2)}</span> 觸發 ${h.dir === "lte" ? "≤" : "≥"} ${h.target}</span><span class="d">${h.date}</span>`;
    box.appendChild(div);
  }
}

async function check() {
  const btn = $("btn-check");
  const st = $("check-status");
  btn.disabled = true;
  st.textContent = "檢查中…";
  await loadQuotes(true);
  const rows = renderWatch();
  const hits = rows.filter((r) => r.status === "hit").length;
  const added = recordHits(rows);
  renderHist();
  st.textContent = QUOTES
    ? `${QUOTES.updated} 收盤資料：${hits} 檔觸發${added ? `（新增記錄 ${added} 筆）` : ""}`
    : "檢查失敗，請稍後再試";
  btn.disabled = false;
}

$("btn-add").addEventListener("click", addItem);
$("btn-check").addEventListener("click", check);
$("in-code").addEventListener("keydown", (e) => { if (e.key === "Enter") addItem(); });
$("in-target").addEventListener("keydown", (e) => { if (e.key === "Enter") addItem(); });

(async () => {
  renderWatch();
  renderHist();
  await loadQuotes();
  renderWatch();
  const rows = renderWatch();
  recordHits(rows);
  renderHist();
})();
