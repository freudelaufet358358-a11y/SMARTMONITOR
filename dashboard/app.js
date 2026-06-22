// SmartMonitor standalone dashboard (Home Assistant 不要)
// - 時計: クライアントで毎秒更新
// - 時間割 / カレンダー: config.json から描画
// - 天気 / ニュース: fetch_data.py が生成する data.json から描画

const TZ = "Asia/Tokyo";
const LOCALE = "ja-JP";

// ---- フリップクロック ----
// 1桁ぶんのフリップカードを生成
function makeFlipUnit() {
  const el = document.createElement("div");
  el.className = "flip-unit";
  el.innerHTML =
    '<div class="half top"><div class="n">0</div></div>' +
    '<div class="half bottom"><div class="n">0</div></div>' +
    '<div class="leaf lt"><div class="n">0</div></div>' +
    '<div class="leaf lb"><div class="n">0</div></div>';
  const topN = el.querySelector(".half.top .n");
  const botN = el.querySelector(".half.bottom .n");
  const ltN = el.querySelector(".leaf.lt .n");
  const lbN = el.querySelector(".leaf.lb .n");
  el.dataset.val = "0";
  // 下のリーフが起き上がり切ったら静的な下半分を新値に確定
  el.querySelector(".leaf.lb").addEventListener("animationend", () => {
    botN.textContent = el.dataset.val;
    el.classList.remove("go");
  });
  return {
    el,
    set(v) {
      v = String(v);
      if (el.dataset.val === v) return;          // 変化なし → フリップしない
      const old = el.dataset.val;
      topN.textContent = v;    // 静的・上: 新値（倒れるリーフの裏に現れる）
      botN.textContent = old;  // 静的・下: 旧値（起きるリーフが覆うまで）
      ltN.textContent = old;   // 倒れるリーフ: 旧値の上半分
      lbN.textContent = v;     // 起きるリーフ: 新値の下半分
      el.dataset.val = v;
      el.classList.remove("go");
      void el.offsetWidth;     // アニメ再始動のためリフロー
      el.classList.add("go");
    },
  };
}

let FLIP = null;
function buildClock() {
  const clock = document.getElementById("clock");
  clock.innerHTML = "";
  const units = {};
  [["h0", "h1"], ["m0", "m1"], ["s0", "s1"]].forEach((pair, gi) => {
    const grp = document.createElement("div");
    grp.className = "flip-group";
    pair.forEach((id) => {
      const u = makeFlipUnit();
      units[id] = u;
      grp.appendChild(u.el);
    });
    clock.appendChild(grp);
    if (gi < 2) {
      const sep = document.createElement("div");
      sep.className = "flip-sep";
      sep.textContent = ":";
      clock.appendChild(sep);
    }
  });
  return units;
}

function tickClock() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: TZ,
  }).formatToParts(now);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "00";
  const hh = get("hour"), mm = get("minute"), ss = get("second");

  if (!FLIP) FLIP = buildClock();
  FLIP.h0.set(hh[0]); FLIP.h1.set(hh[1]);
  FLIP.m0.set(mm[0]); FLIP.m1.set(mm[1]);
  FLIP.s0.set(ss[0]); FLIP.s1.set(ss[1]);

  document.getElementById("date").textContent =
    new Intl.DateTimeFormat(LOCALE, {
      year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: TZ,
    }).format(now);
}

// 月=1..金=5 を時間割の列インデックス(0..4)へ。土日は -1 (強調なし)。
function todayColumn() {
  const dow = new Date().getDay(); // 0=日,1=月,...
  return dow >= 1 && dow <= 5 ? dow - 1 : -1;
}

// ---- 時間割 ----
function renderTimetable(cfg) {
  const tt = cfg.timetable || {};
  const days = tt.days || [];
  const periods = tt.periods || [];
  const cells = tt.cells || {};
  const todayCol = todayColumn();

  let html = "<tr><th></th>";
  days.forEach((d, i) => {
    html += `<th class="${i === todayCol ? "today" : ""}">${d}</th>`;
  });
  html += "</tr>";

  periods.forEach((p) => {
    html += `<tr><td class="period">${p}</td>`;
    const row = cells[p] || [];
    days.forEach((_, i) => {
      html += `<td class="${i === todayCol ? "today" : ""}">${row[i] || ""}</td>`;
    });
    html += "</tr>";
  });

  document.getElementById("timetable").innerHTML = html;
}

// ---- 天気 ----
function renderWeather(w) {
  const el = document.getElementById("weather");
  if (!w) {
    el.innerHTML = '<div class="muted">天気データなし</div>';
    return;
  }
  const fc = (w.forecast || []).map((d) => {
    const wd = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: TZ })
      .format(new Date(d.date + "T00:00:00"));
    return `<div class="day"><div>${wd}</div><div class="e">${d.emoji}</div>
            <div class="t">${Math.round(d.max)}° / ${Math.round(d.min)}°</div></div>`;
  }).join("");

  el.innerHTML = `
    <div class="now">
      <span class="emoji">${w.emoji || ""}</span>
      <div>
        <div class="temp">${w.temp != null ? Math.round(w.temp) + "°" : "--"}</div>
        <div class="meta">${w.name || ""} ${w.text || ""}
          ${w.humidity != null ? "湿度" + w.humidity + "%" : ""}</div>
      </div>
    </div>
    <div class="forecast">${fc}</div>`;
}

// ---- ニュース ----
function renderNews(items, updated) {
  const ul = document.getElementById("news");
  if (!items || !items.length) {
    ul.innerHTML = '<li class="muted">ニュースなし</li>';
  } else {
    ul.innerHTML = items.map((n) => `
      <li><span class="tag">${n.feed || ""}</span>
      <a href="${n.link}" target="_blank" rel="noreferrer">${n.title}</a></li>`).join("");
  }
  if (updated) {
    const t = new Intl.DateTimeFormat(LOCALE, {
      hour: "2-digit", minute: "2-digit", timeZone: TZ,
    }).format(new Date(updated));
    document.getElementById("updated").textContent = `(${t} 更新)`;
  }
}

// ---- データ読み込み ----
const OVERRIDE_KEY = "smartmonitor.config";  // server.py が無い環境向けのローカル退避先
let CONFIG = {};

// 書き込み可能な server.py が無い静的配信でも設定を反映できるよう、
// localStorage に退避された設定を config.json に重ねる。
function applyLocalOverride(cfg) {
  let raw;
  try {
    raw = localStorage.getItem(OVERRIDE_KEY);
  } catch (e) {
    return cfg;
  }
  if (!raw) return cfg;
  try {
    return Object.assign({}, cfg, JSON.parse(raw));
  } catch (e) {
    return cfg;
  }
}

async function loadConfig() {
  let cfg = {};
  try {
    cfg = await (await fetch("config.json", { cache: "no-store" })).json();
  } catch (e) {
    console.error("config.json load failed", e);
  }
  CONFIG = applyLocalOverride(cfg);
  document.title = CONFIG.title || "SmartMonitor";
  renderTimetable(CONFIG);
}

async function loadData() {
  try {
    const data = await (await fetch("data.json", { cache: "no-store" })).json();
    renderWeather(data.weather);
    renderNews(data.news, data.updated);
  } catch (e) {
    console.error("data.json load failed", e);
  }
}

// ---- 設定パネル（天気の地域 / 時間割をカスタマイズ） ----
// よく使う地点プリセット（Open-Meteo, APIキー不要）。timezone は全て Asia/Tokyo。
const WEATHER_PRESETS = [
  { name: "東京", latitude: 35.68, longitude: 139.76 },
  { name: "札幌", latitude: 43.06, longitude: 141.35 },
  { name: "仙台", latitude: 38.27, longitude: 140.87 },
  { name: "名古屋", latitude: 35.18, longitude: 136.91 },
  { name: "大阪", latitude: 34.69, longitude: 135.50 },
  { name: "京都", latitude: 35.01, longitude: 135.77 },
  { name: "広島", latitude: 34.39, longitude: 132.46 },
  { name: "福岡", latitude: 33.59, longitude: 130.40 },
  { name: "那覇", latitude: 26.21, longitude: 127.68 },
];

// 時間割エディタの作業用モデル（保存時にだけ config 形式へ変換する）
let EDIT = null;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openSettings() {
  const w = Object.assign(
    { name: "", latitude: "", longitude: "", timezone: "Asia/Tokyo" },
    CONFIG.weather || {});
  const tt = CONFIG.timetable || {};
  const days = (tt.days && tt.days.length ? tt.days : ["月", "火", "水", "木", "金"]).slice();
  const periods = (tt.periods && tt.periods.length ? tt.periods : ["1", "2", "3", "4", "5"]).slice();
  const cells = tt.cells || {};
  EDIT = {
    days,
    periods,
    grid: periods.map((p) => days.map((_, c) => (cells[p] || [])[c] || "")),
  };

  const opts = WEATHER_PRESETS
    .map((p) => `<option value="${p.latitude},${p.longitude}">${esc(p.name)}</option>`)
    .join("");

  const panel = document.querySelector(".settings-panel");
  panel.innerHTML = `
    <h2>設定</h2>
    <section class="set-block">
      <h3>天気の地域</h3>
      <div class="set-row">
        <label>プリセット</label>
        <select id="set-preset"><option value="">— 選択 —</option>${opts}</select>
      </div>
      <div class="set-row">
        <label>地名</label>
        <input id="set-w-name" type="text" value="${esc(w.name)}">
      </div>
      <div class="set-row">
        <label>緯度</label>
        <input id="set-w-lat" type="number" step="0.0001" value="${esc(w.latitude)}">
      </div>
      <div class="set-row">
        <label>経度</label>
        <input id="set-w-lon" type="number" step="0.0001" value="${esc(w.longitude)}">
      </div>
      <div class="set-row">
        <label>タイムゾーン</label>
        <input id="set-w-tz" type="text" value="${esc(w.timezone || "Asia/Tokyo")}">
      </div>
    </section>
    <section class="set-block">
      <h3>時間割</h3>
      <div id="set-tt"></div>
      <div class="set-tt-controls">
        <button type="button" id="tt-addcol">＋ 曜日を追加</button>
        <button type="button" id="tt-addrow">＋ 時限を追加</button>
      </div>
    </section>
    <div class="set-note" id="set-note"></div>
    <div class="set-actions">
      <button type="button" id="set-cancel" class="btn-ghost">キャンセル</button>
      <button type="button" id="set-save" class="btn-primary">保存</button>
    </div>`;

  panel.querySelector("#set-preset").addEventListener("change", (e) => {
    const v = e.target.value;
    if (!v) return;
    const p = WEATHER_PRESETS.find((x) => `${x.latitude},${x.longitude}` === v);
    if (!p) return;
    panel.querySelector("#set-w-name").value = p.name;
    panel.querySelector("#set-w-lat").value = p.latitude;
    panel.querySelector("#set-w-lon").value = p.longitude;
    panel.querySelector("#set-w-tz").value = "Asia/Tokyo";
  });
  panel.querySelector("#tt-addcol").addEventListener("click", () => {
    syncEdit();
    EDIT.days.push("");
    EDIT.grid.forEach((row) => row.push(""));
    renderTtEditor();
  });
  panel.querySelector("#tt-addrow").addEventListener("click", () => {
    syncEdit();
    EDIT.periods.push(String(EDIT.periods.length + 1));
    EDIT.grid.push(EDIT.days.map(() => ""));
    renderTtEditor();
  });
  panel.querySelector("#set-cancel").addEventListener("click", closeSettings);
  panel.querySelector("#set-save").addEventListener("click", saveSettings);

  renderTtEditor();
  document.getElementById("settings").hidden = false;
}

function closeSettings() {
  document.getElementById("settings").hidden = true;
  EDIT = null;
}

// DOM 上の入力値を作業モデル EDIT に取り込む（行/列の追加削除の前に呼ぶ）
function syncEdit() {
  const panel = document.querySelector(".settings-panel");
  EDIT.days = [...panel.querySelectorAll("[data-day]")].map((i) => i.value);
  EDIT.periods = [...panel.querySelectorAll("[data-period]")].map((i) => i.value);
  EDIT.grid = EDIT.periods.map((_, r) =>
    EDIT.days.map((__, c) => {
      const el = panel.querySelector(`[data-cell="${r}-${c}"]`);
      return el ? el.value : "";
    }));
}

function renderTtEditor() {
  let html = '<table class="tt-editor"><tr><th></th>';
  EDIT.days.forEach((d, c) => {
    html += `<th><input data-day type="text" value="${esc(d)}">` +
      `<button type="button" class="tt-del" data-delcol="${c}" title="この曜日を削除">✕</button></th>`;
  });
  html += "</tr>";
  EDIT.periods.forEach((p, r) => {
    html += `<tr><td class="tt-period"><input data-period type="text" value="${esc(p)}">` +
      `<button type="button" class="tt-del" data-delrow="${r}" title="この時限を削除">✕</button></td>`;
    EDIT.days.forEach((_, c) => {
      const v = (EDIT.grid[r] || [])[c] || "";
      html += `<td><input data-cell="${r}-${c}" type="text" value="${esc(v)}"></td>`;
    });
    html += "</tr>";
  });
  html += "</table>";

  const host = document.querySelector("#set-tt");
  host.innerHTML = html;
  host.querySelectorAll("[data-delcol]").forEach((b) =>
    b.addEventListener("click", () => {
      syncEdit();
      const c = +b.dataset.delcol;
      EDIT.days.splice(c, 1);
      EDIT.grid.forEach((row) => row.splice(c, 1));
      renderTtEditor();
    }));
  host.querySelectorAll("[data-delrow]").forEach((b) =>
    b.addEventListener("click", () => {
      syncEdit();
      const r = +b.dataset.delrow;
      EDIT.periods.splice(r, 1);
      EDIT.grid.splice(r, 1);
      renderTtEditor();
    }));
}

async function saveSettings() {
  const panel = document.querySelector(".settings-panel");
  const note = panel.querySelector("#set-note");
  syncEdit();

  const lat = parseFloat(panel.querySelector("#set-w-lat").value);
  const lon = parseFloat(panel.querySelector("#set-w-lon").value);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    note.textContent = "緯度・経度を数値で入力してください。";
    note.className = "set-note err";
    return;
  }

  const cells = {};
  EDIT.periods.forEach((p, r) => { cells[p] = (EDIT.grid[r] || []).slice(); });

  const cfg = Object.assign({}, CONFIG, {
    weather: {
      name: panel.querySelector("#set-w-name").value.trim(),
      latitude: lat,
      longitude: lon,
      timezone: panel.querySelector("#set-w-tz").value.trim() || "Asia/Tokyo",
    },
    timetable: { days: EDIT.days, periods: EDIT.periods, cells },
  });

  note.textContent = "保存中…";
  note.className = "set-note";

  let backend = false;
  try {
    const r = await fetch("api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    backend = r.ok;
  } catch (e) {
    backend = false;
  }

  if (backend) {
    try { localStorage.removeItem(OVERRIDE_KEY); } catch (e) { /* noop */ }
  } else {
    // server.py が無い静的配信。設定をローカルに退避して反映する。
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(cfg)); } catch (e) { /* noop */ }
  }

  CONFIG = cfg;
  renderTimetable(CONFIG);

  if (backend) {
    closeSettings();
    setTimeout(loadData, 4000);   // server.py が天気を取り直すまで少し待つ
  } else {
    note.textContent =
      "保存しました（時間割を反映）。天気の地域を実際に取得し直すには server.py が必要です。";
    note.className = "set-note warn";
  }
}

document.getElementById("settings-btn").addEventListener("click", openSettings);
document.getElementById("settings").addEventListener("click", (e) => {
  if (e.target.id === "settings") closeSettings();   // 背景クリックで閉じる
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("settings").hidden) closeSettings();
});

// ---- 自動更新（version.txt を監視して強制再読込）----
// Webhook/定期pull の update.sh や、設定保存(server.py)が version.txt を書き換えると、
// ここが検知してブラウザを location.reload() で強制再読み込みする。
let __version = null;
async function checkVersion() {
  try {
    const r = await fetch("version.txt", { cache: "no-store" });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (!v) return;
    if (__version === null) { __version = v; return; }   // 初回は基準値を記録
    if (v !== __version) {
      console.log("[smartmonitor] new version detected -> reload");
      location.reload();
    }
  } catch (e) { /* ネット瞬断などは無視 */ }
}

// ---- 起動 ----
tickClock();
setInterval(tickClock, 1000);

loadConfig();
loadData();
setInterval(loadData, 5 * 60 * 1000);   // 5分ごとにデータ更新
setInterval(loadConfig, 60 * 60 * 1000); // 1時間ごとに設定/時間割の今日強調を更新

checkVersion();
setInterval(checkVersion, 7 * 1000);    // 7秒ごとに更新チェック → 検知で強制リロード

// 焼き付き/メモリ対策で6時間ごとに再読み込み
setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
