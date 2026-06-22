// SmartMonitor standalone dashboard (Home Assistant 不要)
// - 時計: クライアントで毎秒更新
// - 時間割 / カレンダー: config.json から描画
// - 天気 / ニュース: fetch_data.py が生成する data.json から描画

const TZ = "Asia/Tokyo";
const LOCALE = "ja-JP";

// ---- 時計 (秒まで表示) ----
function tickClock() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: TZ,
  }).formatToParts(now);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || "00";
  document.getElementById("time").textContent = `${get("hour")}:${get("minute")}`;
  document.getElementById("seconds").textContent = get("second");
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
