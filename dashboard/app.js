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

// ---- カレンダー (任意) ----
function renderCalendar(cfg) {
  const url = (cfg.calendar_embed_url || "").trim();
  if (!url) return;
  document.getElementById("calendar-card").hidden = false;
  document.getElementById("calendar-frame").src = url;
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
async function loadConfig() {
  try {
    const cfg = await (await fetch("config.json", { cache: "no-store" })).json();
    document.title = cfg.title || "SmartMonitor";
    renderTimetable(cfg);
    renderCalendar(cfg);
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
setInterval(loadData, 5 * 60 * 1000);   // 5分ごとにデータ更新
setInterval(loadConfig, 60 * 60 * 1000); // 1時間ごとに設定/時間割の今日強調を更新

// 焼き付き/メモリ対策で6時間ごとに再読み込み
setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
