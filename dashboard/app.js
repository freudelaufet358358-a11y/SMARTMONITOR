// SmartMonitor standalone dashboard (Home Assistant 不要)
const TZ = "Asia/Tokyo";
const LOCALE = "ja-JP";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===== アナログ時計 =====
function buildAnalog() {
  const svg = document.getElementById("analog");
  let m = "";
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i * 6) * Math.PI / 180;
    const r1 = 94, r2 = major ? 82 : 88;
    const x1 = 100 + r1 * Math.sin(a), y1 = 100 - r1 * Math.cos(a);
    const x2 = 100 + r2 * Math.sin(a), y2 = 100 - r2 * Math.cos(a);
    m += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ` +
         `stroke="${major ? '#c9cdd6' : '#3a3f4a'}" stroke-width="${major ? 2.6 : 1.4}" stroke-linecap="round"/>`;
  }
  [[12, 100, 28], [3, 172, 105], [6, 100, 180], [9, 28, 105]].forEach(([n, x, y]) => {
    m += `<text x="${x}" y="${y}" fill="#aeb4bd" font-size="17" text-anchor="middle" ` +
         `dominant-baseline="central" font-family="inherit">${n}</text>`;
  });
  m += '<line id="h-hour" x1="100" y1="112" x2="100" y2="56" stroke="#f1f3f7" stroke-width="5" stroke-linecap="round"/>';
  m += '<line id="h-min"  x1="100" y1="114" x2="100" y2="34" stroke="#f1f3f7" stroke-width="3.4" stroke-linecap="round"/>';
  m += '<line id="h-sec"  x1="100" y1="118" x2="100" y2="26" stroke="#7aa2f7" stroke-width="1.6" stroke-linecap="round"/>';
  m += '<circle cx="100" cy="100" r="4.5" fill="#f1f3f7"/>';
  svg.innerHTML = m;
}
function setHand(id, deg) {
  const el = document.getElementById(id);
  if (el) el.setAttribute("transform", `rotate(${deg} 100 100)`);
}

// ===== 時計 / 日付 / 挨拶 =====
function partsIn(opts) {
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: TZ }).formatToParts(new Date());
}
function tickClock() {
  // 24時間の数値（アナログ用）
  const p24 = partsIn({ hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const g = (t, src) => +(src.find((x) => x.type === t) || {}).value;
  const H = g("hour", p24), M = g("minute", p24), S = g("second", p24);
  setHand("h-sec", S * 6);
  setHand("h-min", (M + S / 60) * 6);
  setHand("h-hour", ((H % 12) + M / 60) * 30);

  // 12時間表示（デジタル用）
  const p12 = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ,
  }).formatToParts(new Date());
  const gv = (t) => (p12.find((x) => x.type === t) || {}).value || "";
  document.getElementById("d-hm").textContent = `${gv("hour")}:${gv("minute")}`;
  document.getElementById("d-ampm").textContent = (gv("dayPeriod") || "").toUpperCase();
  document.getElementById("d-sec").textContent = String(S).padStart(2, "0");

  document.getElementById("d-date").textContent =
    new Intl.DateTimeFormat(LOCALE, { month: "long", day: "numeric", weekday: "short", timeZone: TZ })
      .format(new Date());

  let icon = "☀", text = "おはようございます！";
  if (H < 5) { icon = "🌙"; text = "こんばんは！"; }
  else if (H < 11) { icon = "☀"; text = "おはようございます！"; }
  else if (H < 18) { icon = "☀"; text = "こんにちは！"; }
  else { icon = "🌙"; text = "こんばんは！"; }
  document.getElementById("greet-icon").textContent = icon;
  document.getElementById("greet").textContent = text;
}

// ===== 時間割（今週の日付つき）=====
function weekDates(n) {
  const now = new Date();
  const dow = now.getDay();               // 0=日..6=土
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((dow + 6) % 7));  // 今週の月曜
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(d);
  }
  return out;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function renderTimetable(cfg) {
  const tt = cfg.timetable || {};
  const days = tt.days || [];
  const periods = tt.periods || [];
  const times = tt.times || [];
  const cells = tt.cells || {};
  const dates = weekDates(days.length);
  const today = new Date();
  const todayCol = dates.findIndex((d) => sameDay(d, today));

  if (dates.length) {
    const f = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    document.getElementById("tt-range").textContent =
      `（${f(dates[0])}〜${f(dates[dates.length - 1])}）`;
  }

  let h = '<thead><tr><th class="corner"></th>';
  days.forEach((d, i) => {
    const dd = dates[i];
    const label = dd ? `${dd.getMonth() + 1}/${dd.getDate()} (${d})` : d;
    h += `<th class="${i === todayCol ? "today" : ""}">${esc(label)}</th>`;
  });
  h += "</tr></thead><tbody>";

  periods.forEach((p, r) => {
    h += `<tr><td class="pcell"><span class="pno">${esc(p)}</span>` +
         `<span class="ptime">${esc(times[r] || "")}</span></td>`;
    const row = cells[p] || [];
    days.forEach((_, i) => {
      h += `<td class="${i === todayCol ? "today" : ""}">${esc(row[i] || "")}</td>`;
    });
    h += "</tr>";
  });
  h += "</tbody>";

  document.getElementById("timetable").innerHTML = h;
  document.getElementById("tt-note").textContent = tt.note || "";
}

// ===== 天気アイコン (code -> SVG) =====
function weatherIcon(code) {
  const c = +code;
  const sun = '<circle cx="32" cy="32" r="13" fill="#eef1f6"/>' +
    '<g stroke="#eef1f6" stroke-width="3" stroke-linecap="round">' +
    '<line x1="32" y1="3" x2="32" y2="12"/><line x1="32" y1="52" x2="32" y2="61"/>' +
    '<line x1="3" y1="32" x2="12" y2="32"/><line x1="52" y1="32" x2="61" y2="32"/>' +
    '<line x1="11" y1="11" x2="17" y2="17"/><line x1="47" y1="47" x2="53" y2="53"/>' +
    '<line x1="53" y1="11" x2="47" y2="17"/><line x1="17" y1="47" x2="11" y2="53"/></g>';
  const cloud = '<path d="M18 46h26a11 11 0 0 0 1-22 15 15 0 0 0-29 3 9 9 0 0 0 2 19z" fill="#dfe4ec"/>';
  const cloudSun = '<circle cx="23" cy="20" r="8" fill="#eef1f6"/>' +
    '<g stroke="#eef1f6" stroke-width="2.4" stroke-linecap="round">' +
    '<line x1="23" y1="5" x2="23" y2="10"/><line x1="8" y1="20" x2="13" y2="20"/>' +
    '<line x1="12" y1="9" x2="15" y2="12"/><line x1="34" y1="9" x2="31" y2="12"/></g>' +
    '<path d="M22 50h24a10 10 0 0 0 1-20 13 13 0 0 0-25 2 8 8 0 0 0 0 18z" fill="#dfe4ec"/>';
  const rain = cloud.replace("46h26", "40h26").replace("M18 40", "M18 40") +
    '<g stroke="#7aa2f7" stroke-width="3" stroke-linecap="round">' +
    '<line x1="23" y1="48" x2="20" y2="57"/><line x1="34" y1="48" x2="31" y2="57"/>' +
    '<line x1="45" y1="48" x2="42" y2="57"/></g>';
  const snow = '<path d="M18 40h26a11 11 0 0 0 1-22 15 15 0 0 0-29 3 9 9 0 0 0 2 19z" fill="#dfe4ec"/>' +
    '<g fill="#dfe4ec"><circle cx="23" cy="52" r="2.6"/><circle cx="34" cy="52" r="2.6"/>' +
    '<circle cx="45" cy="52" r="2.6"/></g>';
  const thunder = '<path d="M18 40h26a11 11 0 0 0 1-22 15 15 0 0 0-29 3 9 9 0 0 0 2 19z" fill="#dfe4ec"/>' +
    '<path d="M34 44l-9 11h6l-3 8 10-12h-6z" fill="#e6c84f"/>';
  const fog = cloud +
    '<g stroke="#aeb4bd" stroke-width="3" stroke-linecap="round">' +
    '<line x1="16" y1="52" x2="46" y2="52"/><line x1="20" y1="58" x2="42" y2="58"/></g>';

  let g = cloud;
  if (c === 0 || c === 1) g = sun;
  else if (c === 2) g = cloudSun;
  else if (c === 3) g = cloud;
  else if (c === 45 || c === 48) g = fog;
  else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) g = rain;
  else if ((c >= 71 && c <= 77) || c === 85 || c === 86) g = snow;
  else if (c >= 95) g = thunder;
  return `<svg class="wi" viewBox="0 0 64 64">${g}</svg>`;
}

// ===== 天気 =====
function renderWeather(w) {
  const el = document.getElementById("weather");
  if (!w) { el.innerHTML = '<div class="muted">天気データなし</div>'; return; }
  const fc = (w.forecast || []).map((d) => {
    const wd = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: TZ })
      .format(new Date(d.date + "T00:00:00"));
    const pp = d.precip != null ? `<div class="pp">${d.precip}%</div>` : "";
    return `<div class="d"><div class="wd">${wd}</div>${weatherIcon(d.code)}` +
      `<div class="ht">${Math.round(d.max)}°<span class="lo">/${Math.round(d.min)}°</span></div>${pp}</div>`;
  }).join("");

  el.innerHTML =
    `<div class="w-loc">${esc(w.name || "")}</div>` +
    `<div class="w-now"><div class="w-temp">${w.temp != null ? Math.round(w.temp) : "--"}<span class="u">°c</span></div>` +
    `${weatherIcon(w.code)}</div>` +
    `<div class="w-cond">${esc(w.text || "")}</div>` +
    `<div class="w-sub">` +
      `${w.humidity != null ? `<span>湿度 ${w.humidity}%</span>` : ""}` +
      `${w.precip != null ? `<span>降水確率 ${w.precip}%</span>` : ""}` +
    `</div>` +
    `<div class="w-fc">${fc}</div>`;
}

// ===== ニュース =====
function newsMeta(published, feed) {
  let when = "";
  if (published) {
    const dt = new Date(published);
    if (!isNaN(dt)) {
      when = new Intl.DateTimeFormat(LOCALE, {
        month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ,
      }).format(dt);
    }
  }
  const src = feed ? `<span class="src">${esc(feed)}</span>` : "";
  return `${esc(when)}${src}`;
}
function renderNews(items) {
  const ul = document.getElementById("news");
  if (!items || !items.length) { ul.innerHTML = '<li class="muted">ニュースなし</li>'; return; }
  ul.innerHTML = items.slice(0, 3).map((n) => {
    const thumb = n.image
      ? `<a class="nthumb" href="${esc(n.link)}" target="_blank" rel="noreferrer" style="background-image:url('${esc(n.image)}')"></a>`
      : `<span class="nthumb ph"></span>`;
    return `<li class="nitem">${thumb}<div class="nbody">` +
      `<div class="ntitle"><a href="${esc(n.link)}" target="_blank" rel="noreferrer" style="color:inherit;text-decoration:none">${esc(n.title)}</a></div>` +
      `<div class="nsum">${esc(n.summary || "")}</div>` +
      `<div class="nmeta">${newsMeta(n.published, n.feed)}</div></div></li>`;
  }).join("");
}

// ===== 設定 (localStorage 退避つき) =====
const OVERRIDE_KEY = "smartmonitor.config";
let CONFIG = {};
function applyLocalOverride(cfg) {
  let raw;
  try { raw = localStorage.getItem(OVERRIDE_KEY); } catch (e) { return cfg; }
  if (!raw) return cfg;
  try { return Object.assign({}, cfg, JSON.parse(raw)); } catch (e) { return cfg; }
}
async function loadConfig() {
  let cfg = {};
  try { cfg = await (await fetch("config.json", { cache: "no-store" })).json(); }
  catch (e) { console.error("config.json load failed", e); }
  CONFIG = applyLocalOverride(cfg);
  document.title = CONFIG.title || "SmartMonitor";
  renderTimetable(CONFIG);
}
async function loadData() {
  try {
    const data = await (await fetch("data.json", { cache: "no-store" })).json();
    renderWeather(data.weather);
    renderNews(data.news);
  } catch (e) { console.error("data.json load failed", e); }
}

// ===== 設定パネル =====
const WEATHER_PRESETS = [
  { name: "東京都 渋谷区", latitude: 35.66, longitude: 139.70 },
  { name: "札幌", latitude: 43.06, longitude: 141.35 },
  { name: "仙台", latitude: 38.27, longitude: 140.87 },
  { name: "名古屋", latitude: 35.18, longitude: 136.91 },
  { name: "大阪", latitude: 34.69, longitude: 135.50 },
  { name: "京都", latitude: 35.01, longitude: 135.77 },
  { name: "広島", latitude: 34.39, longitude: 132.46 },
  { name: "福岡", latitude: 33.59, longitude: 130.40 },
  { name: "那覇", latitude: 26.21, longitude: 127.68 },
];
let EDIT = null;

function openSettings() {
  const w = Object.assign({ name: "", latitude: "", longitude: "", timezone: "Asia/Tokyo" }, CONFIG.weather || {});
  const tt = CONFIG.timetable || {};
  const days = (tt.days && tt.days.length ? tt.days : ["月", "火", "水", "木", "金"]).slice();
  const periods = (tt.periods && tt.periods.length ? tt.periods : ["1", "2", "3", "4", "5"]).slice();
  const times = (tt.times || []).slice();
  const cells = tt.cells || {};
  EDIT = {
    days, periods, times,
    note: tt.note || "",
    grid: periods.map((p) => days.map((_, c) => (cells[p] || [])[c] || "")),
  };
  const opts = WEATHER_PRESETS.map((p) => `<option value="${p.latitude},${p.longitude}">${esc(p.name)}</option>`).join("");

  const panel = document.querySelector(".settings-panel");
  panel.innerHTML = `
    <h2>設定</h2>
    <section class="set-block">
      <h3>天気の地域</h3>
      <div class="set-row"><label>プリセット</label>
        <select id="set-preset"><option value="">— 選択 —</option>${opts}</select></div>
      <div class="set-row"><label>地名</label><input id="set-w-name" type="text" value="${esc(w.name)}"></div>
      <div class="set-row"><label>緯度</label><input id="set-w-lat" type="number" step="0.0001" value="${esc(w.latitude)}"></div>
      <div class="set-row"><label>経度</label><input id="set-w-lon" type="number" step="0.0001" value="${esc(w.longitude)}"></div>
      <div class="set-row"><label>タイムゾーン</label><input id="set-w-tz" type="text" value="${esc(w.timezone || "Asia/Tokyo")}"></div>
    </section>
    <section class="set-block">
      <h3>時間割</h3>
      <div id="set-tt"></div>
      <div class="set-tt-controls">
        <button type="button" id="tt-addcol">＋ 曜日を追加</button>
        <button type="button" id="tt-addrow">＋ 時限を追加</button>
      </div>
      <div class="set-row" style="margin-top:14px"><label>注記</label>
        <input id="set-tt-note" type="text" value="${esc(EDIT.note)}"></div>
    </section>
    <div class="set-note" id="set-note"></div>
    <div class="set-actions">
      <button type="button" id="set-cancel" class="btn-ghost">キャンセル</button>
      <button type="button" id="set-save" class="btn-primary">保存</button>
    </div>`;

  panel.querySelector("#set-preset").addEventListener("change", (e) => {
    const p = WEATHER_PRESETS.find((x) => `${x.latitude},${x.longitude}` === e.target.value);
    if (!p) return;
    panel.querySelector("#set-w-name").value = p.name;
    panel.querySelector("#set-w-lat").value = p.latitude;
    panel.querySelector("#set-w-lon").value = p.longitude;
    panel.querySelector("#set-w-tz").value = "Asia/Tokyo";
  });
  panel.querySelector("#tt-addcol").addEventListener("click", () => {
    syncEdit(); EDIT.days.push(""); EDIT.grid.forEach((r) => r.push("")); renderTtEditor();
  });
  panel.querySelector("#tt-addrow").addEventListener("click", () => {
    syncEdit(); EDIT.periods.push(String(EDIT.periods.length + 1)); EDIT.times.push("");
    EDIT.grid.push(EDIT.days.map(() => "")); renderTtEditor();
  });
  panel.querySelector("#set-cancel").addEventListener("click", closeSettings);
  panel.querySelector("#set-save").addEventListener("click", saveSettings);

  renderTtEditor();
  document.getElementById("settings").hidden = false;
}
function closeSettings() { document.getElementById("settings").hidden = true; EDIT = null; }

function syncEdit() {
  const panel = document.querySelector(".settings-panel");
  EDIT.days = [...panel.querySelectorAll("[data-day]")].map((i) => i.value);
  EDIT.periods = [...panel.querySelectorAll("[data-period]")].map((i) => i.value);
  EDIT.times = [...panel.querySelectorAll("[data-time]")].map((i) => i.value);
  EDIT.grid = EDIT.periods.map((_, r) =>
    EDIT.days.map((__, c) => {
      const el = panel.querySelector(`[data-cell="${r}-${c}"]`);
      return el ? el.value : "";
    }));
}
function renderTtEditor() {
  let h = '<table class="tt-editor"><tr><th></th>';
  EDIT.days.forEach((d, c) => {
    h += `<th><input data-day type="text" value="${esc(d)}">` +
      `<button type="button" class="tt-del" data-delcol="${c}" title="この曜日を削除">✕</button></th>`;
  });
  h += "</tr>";
  EDIT.periods.forEach((p, r) => {
    h += `<tr><td class="tt-period"><input data-period type="text" value="${esc(p)}">` +
      `<button type="button" class="tt-del" data-delrow="${r}" title="この時限を削除">✕</button>` +
      `<div class="tt-time"><input data-time type="text" placeholder="08:45 - 09:35" value="${esc(EDIT.times[r] || "")}"></div></td>`;
    EDIT.days.forEach((_, c) => {
      h += `<td><input data-cell="${r}-${c}" type="text" value="${esc((EDIT.grid[r] || [])[c] || "")}"></td>`;
    });
    h += "</tr>";
  });
  h += "</table>";
  const host = document.querySelector("#set-tt");
  host.innerHTML = h;
  host.querySelectorAll("[data-delcol]").forEach((b) => b.addEventListener("click", () => {
    syncEdit(); const c = +b.dataset.delcol; EDIT.days.splice(c, 1);
    EDIT.grid.forEach((r) => r.splice(c, 1)); renderTtEditor();
  }));
  host.querySelectorAll("[data-delrow]").forEach((b) => b.addEventListener("click", () => {
    syncEdit(); const r = +b.dataset.delrow; EDIT.periods.splice(r, 1);
    EDIT.times.splice(r, 1); EDIT.grid.splice(r, 1); renderTtEditor();
  }));
}
async function saveSettings() {
  const panel = document.querySelector(".settings-panel");
  const note = panel.querySelector("#set-note");
  syncEdit();
  const lat = parseFloat(panel.querySelector("#set-w-lat").value);
  const lon = parseFloat(panel.querySelector("#set-w-lon").value);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    note.textContent = "緯度・経度を数値で入力してください。"; note.className = "set-note err"; return;
  }
  const cells = {};
  EDIT.periods.forEach((p, r) => { cells[p] = (EDIT.grid[r] || []).slice(); });
  const cfg = Object.assign({}, CONFIG, {
    weather: {
      name: panel.querySelector("#set-w-name").value.trim(),
      latitude: lat, longitude: lon,
      timezone: panel.querySelector("#set-w-tz").value.trim() || "Asia/Tokyo",
    },
    timetable: {
      days: EDIT.days, periods: EDIT.periods, times: EDIT.times, cells,
      note: panel.querySelector("#set-tt-note").value,
    },
  });

  note.textContent = "保存中…"; note.className = "set-note";
  let backend = false;
  try {
    const r = await fetch("api/config", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg),
    });
    backend = r.ok;
  } catch (e) { backend = false; }

  if (backend) { try { localStorage.removeItem(OVERRIDE_KEY); } catch (e) { /* */ } }
  else { try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(cfg)); } catch (e) { /* */ } }

  CONFIG = cfg;
  renderTimetable(CONFIG);
  if (backend) { closeSettings(); setTimeout(loadData, 4000); }
  else {
    note.textContent = "保存しました（時間割を反映）。天気の再取得には server.py が必要です。";
    note.className = "set-note warn";
  }
}

// ===== 自動更新（version.txt 監視で強制リロード）=====
let __version = null;
async function checkVersion() {
  try {
    const r = await fetch("version.txt", { cache: "no-store" });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (!v) return;
    if (__version === null) { __version = v; return; }
    if (v !== __version) location.reload();
  } catch (e) { /* */ }
}

// ===== 起動 =====
document.getElementById("settings-btn").addEventListener("click", openSettings);
document.getElementById("settings").addEventListener("click", (e) => {
  if (e.target.id === "settings") closeSettings();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("settings").hidden) closeSettings();
});

buildAnalog();
tickClock();
setInterval(tickClock, 1000);

loadConfig();
loadData();
setInterval(loadData, 5 * 60 * 1000);
setInterval(loadConfig, 60 * 60 * 1000);

checkVersion();
setInterval(checkVersion, 7 * 1000);

setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
