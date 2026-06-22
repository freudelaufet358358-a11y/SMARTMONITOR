#!/usr/bin/env python3
"""SmartMonitor データ取得 (Home Assistant 不要)。

config.json を読み、天気 (Open-Meteo / APIキー不要) と RSS ニュースを取得して
data.json を生成する。Python 標準ライブラリのみ。pip 依存なし。

  読み込み: <WWW>/config.json
  書き出し: <WWW>/data.json
  WWW は環境変数 SMARTMONITOR_WWW、無ければスクリプト隣の www/。
"""
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WWW = os.environ.get("SMARTMONITOR_WWW") or os.path.join(SCRIPT_DIR, "www")
CONFIG = os.path.join(WWW, "config.json")
OUT = os.path.join(WWW, "data.json")
HEADERS = {"User-Agent": "SmartMonitor/1.0 (+local dashboard)"}

# WMO weather code -> (emoji, 日本語)
WMO = {
    0: ("☀️", "快晴"), 1: ("🌤️", "晴れ"), 2: ("⛅", "薄曇り"), 3: ("☁️", "曇り"),
    45: ("🌫️", "霧"), 48: ("🌫️", "霧氷"),
    51: ("🌦️", "霧雨"), 53: ("🌦️", "霧雨"), 55: ("🌦️", "霧雨"),
    56: ("🌧️", "着氷性霧雨"), 57: ("🌧️", "着氷性霧雨"),
    61: ("🌧️", "雨"), 63: ("🌧️", "雨"), 65: ("🌧️", "強い雨"),
    66: ("🌧️", "着氷性の雨"), 67: ("🌧️", "着氷性の雨"),
    71: ("🌨️", "雪"), 73: ("🌨️", "雪"), 75: ("❄️", "強い雪"), 77: ("❄️", "霧雪"),
    80: ("🌦️", "にわか雨"), 81: ("🌦️", "にわか雨"), 82: ("⛈️", "激しいにわか雨"),
    85: ("🌨️", "にわか雪"), 86: ("🌨️", "にわか雪"),
    95: ("⛈️", "雷雨"), 96: ("⛈️", "雷雨"), 99: ("⛈️", "激しい雷雨"),
}


def wmo(code):
    return WMO.get(code, ("🌡️", ""))


def fetch(url, timeout=10):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_config():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)


def fetch_weather(cfg):
    w = cfg.get("weather") or {}
    if "latitude" not in w or "longitude" not in w:
        return None
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={w['latitude']}&longitude={w['longitude']}"
        "&current=temperature_2m,relative_humidity_2m,weather_code"
        "&daily=temperature_2m_max,temperature_2m_min,weather_code"
        f"&timezone={w.get('timezone', 'auto')}&forecast_days=3"
    )
    try:
        data = json.loads(fetch(url))
        cur = data.get("current", {})
        emoji, text = wmo(cur.get("weather_code"))
        daily = data.get("daily", {})
        times = daily.get("time", [])
        forecast = []
        for i in range(min(3, len(times))):
            e, t = wmo(daily["weather_code"][i])
            forecast.append({
                "date": times[i], "emoji": e, "text": t,
                "max": daily["temperature_2m_max"][i],
                "min": daily["temperature_2m_min"][i],
            })
        return {
            "name": w.get("name", ""),
            "temp": cur.get("temperature_2m"),
            "humidity": cur.get("relative_humidity_2m"),
            "emoji": emoji, "text": text, "forecast": forecast,
        }
    except Exception as e:
        print(f"weather error: {e}", file=sys.stderr)
        return None


def _tag(el):
    return el.tag.split("}")[-1]


def parse_feed(raw):
    """RSS 2.0 / Atom の両方から {title, link, published} を抽出。"""
    items = []
    root = ET.fromstring(raw)
    for node in root.iter():
        kind = _tag(node)
        if kind == "item":  # RSS
            title = link = pub = ""
            for c in node:
                t = _tag(c)
                if t == "title":
                    title = (c.text or "").strip()
                elif t == "link":
                    link = (c.text or "").strip()
                elif t == "pubDate":
                    pub = (c.text or "").strip()
            if title:
                items.append({"title": title, "link": link, "published": pub})
        elif kind == "entry":  # Atom
            title = link = pub = ""
            for c in node:
                t = _tag(c)
                if t == "title":
                    title = (c.text or "").strip()
                elif t == "link":
                    link = c.get("href", link) or link
                elif t in ("published", "updated"):
                    pub = (c.text or "").strip()
            if title:
                items.append({"title": title, "link": link, "published": pub})
    return items


def fetch_news(cfg):
    news = []
    per_feed = max(1, cfg.get("news_max", 10) // max(1, len(cfg.get("feeds", []) or [1])))
    for feed in cfg.get("feeds", []):
        try:
            raw = fetch(feed["url"])
            got = 0
            for it in parse_feed(raw):
                it["feed"] = feed.get("name", "")
                news.append(it)
                got += 1
                if got >= per_feed + 3:  # 各フィード少し多めに拾い、最後に総数で切る
                    break
        except Exception as e:
            print(f"feed error {feed.get('url')}: {e}", file=sys.stderr)
    return news[: cfg.get("news_max", 10)]


def main():
    cfg = load_config()
    out = {
        "updated": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "weather": fetch_weather(cfg),
        "news": fetch_news(cfg),
    }
    os.makedirs(WWW, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"wrote {OUT}: news={len(out['news'])} "
          f"weather={'ok' if out['weather'] else 'none'}")


if __name__ == "__main__":
    main()
