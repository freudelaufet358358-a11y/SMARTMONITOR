// SmartMonitor standalone dashboard (Home Assistant 不要)
// - 時計: クライアントで毎秒更新
// - 時間割: config.json から描画（UNIPA_CLAWL のコマ式モデルを参考）
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

// ---- 時間割 ----
// 曜日ラベル（config.json の days は短縮形「月」「火」… を想定）
const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// 時限→開始/終了時刻の既定値（山口県立大学 授業時間割。config.json の
// timetable.period_times で上書き可能）。UNIPA_CLAWL から移植。
const DEFAULT_PERIOD_TIMES = {
  1: ["08:50", "10:20"],
  2: ["10:30", "12:00"],
  3: ["13:00", "14:30"],
  4: ["14:40", "16:10"],
  5: ["16:20", "17:50"],
  6: ["18:00", "19:30"],
  7: ["19:40", "21:10"],
};

// 今日の曜日ラベル（"月"〜"日"）
function todayLabel() {
  return DOW_LABELS[new Date().getDay()];
}

// 現在「授業時間内」のコマ {day, period} を返す（休憩中・時間外は null）。
function currentSlotKey(periodTimes) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
  }).formatToParts(now);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "00";
  const hm = `${get("hour")}:${get("minute")}`;
  const day = todayLabel();
  for (const p of Object.keys(periodTimes)) {
    const pt = periodTimes[p];
    if (pt && pt[0] <= hm && hm <= pt[1]) return { day, period: Number(p) };
  }
  return null;
}

function renderTimetable(cfg) {
  const tt = cfg.timetable || {};
  const baseDays = tt.days || ["月", "火", "水", "木", "金"];
  const periodTimes = { ...DEFAULT_PERIOD_TIMES, ...(tt.period_times || {}) };
  // 旧形式（cells グリッド）も読めるよう slots へ正規化する。
  const slots = normalizeSlots(tt, baseDays);

  // 土曜開講のコマがあるときだけ土曜列を出す（データを握りつぶさない）。
  const days = slots.some((s) => s.day === "土") && !baseDays.includes("土")
    ? [...baseDays, "土"]
    : baseDays;

  const todayCol = days.indexOf(todayLabel());
  const cur = currentSlotKey(periodTimes);
  const maxPeriod = slots.length
    ? Math.max(...slots.map((s) => s.period))
    : Math.max(...Object.keys(periodTimes).map(Number).filter((n) => n <= 5));

  let html = "<tr><th></th>";
  days.forEach((d, i) => {
    html += `<th class="${i === todayCol ? "today" : ""}">${d}</th>`;
  });
  html += "</tr>";

  for (let p = 1; p <= maxPeriod; p++) {
    const pt = periodTimes[p];
    const time = pt ? `<span class="tt-time">${pt[0]}〜${pt[1]}</span>` : "";
    html += `<tr><td class="period">${p}<br>${time}</td>`;
    days.forEach((day, i) => {
      const cell = slots.find((s) => s.day === day && s.period === p);
      const isToday = i === todayCol;
      // 「いま開講中」は実際に授業があるコマだけ強調（空き時間は強調しない）。
      const isNow = cell && cur && cur.day === day && cur.period === p;
      const cls = [isToday ? "today" : "", isNow ? "now" : ""]
        .filter(Boolean).join(" ");
      if (!cell) { html += `<td class="${cls}"></td>`; return; }
      html += `<td class="${cls}">
        <div class="tt-title">${cell.title}</div>
        ${cell.room ? `<div class="tt-room">${cell.room}</div>` : ""}
        ${cell.code ? `<div class="tt-code">${cell.code}</div>` : ""}
      </td>`;
    });
    html += "</tr>";
  }

  document.getElementById("timetable").innerHTML = html;
}

// 新形式 slots[{day,period,title,room,code}] をそのまま、旧形式
// {days, periods, cells} はコマ式へ変換して返す（後方互換）。
function normalizeSlots(tt, days) {
  if (Array.isArray(tt.slots)) {
    return tt.slots
      .filter((s) => s && s.title)
      .map((s) => ({ ...s, period: Number(s.period) }));
  }
  const cells = tt.cells || {};
  const out = [];
  Object.keys(cells).forEach((p) => {
    (cells[p] || []).forEach((title, i) => {
      if (title) out.push({ day: days[i], period: Number(p), title });
    });
  });
  return out;
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
let _cfg = null;
async function loadConfig() {
  try {
    _cfg = await (await fetch("config.json", { cache: "no-store" })).json();
    document.title = _cfg.title || "SmartMonitor";
    renderTimetable(_cfg);
  } catch (e) {
    console.error("config.json load failed", e);
  }
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

// ---- 起動 ----
tickClock();
setInterval(tickClock, 1000);

loadConfig();
loadData();
setInterval(loadData, 5 * 60 * 1000);    // 5分ごとにデータ更新
setInterval(loadConfig, 60 * 60 * 1000); // 1時間ごとに設定を取り直す
// 1分ごとに時間割を再描画（今日列・授業中コマのハイライトを最新化）
setInterval(() => { if (_cfg) renderTimetable(_cfg); }, 60 * 1000);

// 焼き付き/メモリ対策で6時間ごとに再読み込み
setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
