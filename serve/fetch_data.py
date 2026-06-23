#!/usr/bin/env python3
"""SmartMonitor データ取得 (Home Assistant 不要)。

config.json を読み、天気 (Open-Meteo / APIキー不要) と RSS ニュースを取得して
data.json を生成する。Python 標準ライブラリのみ。pip 依存なし。

  読み込み: <WWW>/config.json
  書き出し: <WWW>/data.json
  WWW は環境変数 SMARTMONITOR_WWW、無ければスクリプト隣の www/。
"""
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WWW = os.environ.get("SMARTMONITOR_WWW") or os.path.join(SCRIPT_DIR, "www")
CONFIG = os.path.join(WWW, "config.json")
OUT = os.path.join(WWW, "data.json")
HEADERS = {"User-Agent": "SmartMonitor/1.0 (+local dashboard)"}

# WMO weather code -> 日本語 (アイコンはブラウザ側が code から描画)
WMO_TEXT = {
    0: "快晴", 1: "晴れ", 2: "晴れ時々くもり", 3: "くもり",
    45: "霧", 48: "霧氷",
    51: "霧雨", 53: "霧雨", 55: "霧雨", 56: "着氷性の霧雨", 57: "着氷性の霧雨",
    61: "雨", 63: "雨", 65: "強い雨", 66: "着氷性の雨", 67: "着氷性の雨",
    71: "雪", 73: "雪", 75: "大雪", 77: "霧雪",
    80: "にわか雨", 81: "にわか雨", 82: "激しいにわか雨",
    85: "にわか雪", 86: "にわか雪",
    95: "雷雨", 96: "雷雨", 99: "激しい雷雨",
}


def wmo_text(code):
    return WMO_TEXT.get(code, "")


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
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,"
        "precipitation_probability_max"
        f"&timezone={w.get('timezone', 'auto')}&forecast_days=5"
    )
    try:
        data = json.loads(fetch(url))
        cur = data.get("current", {})
        daily = data.get("daily", {})
        times = daily.get("time", [])
        pop = daily.get("precipitation_probability_max") or [None] * len(times)
        forecast = []
        for i in range(min(5, len(times))):
            forecast.append({
                "date": times[i],
                "code": daily["weather_code"][i],
                "max": daily["temperature_2m_max"][i],
                "min": daily["temperature_2m_min"][i],
                "precip": pop[i] if i < len(pop) else None,
            })
        code = cur.get("weather_code")
        return {
            "name": w.get("name", ""),
            "temp": cur.get("temperature_2m"),
            "humidity": cur.get("relative_humidity_2m"),
            "code": code,
            "text": wmo_text(code),
            "precip": forecast[0]["precip"] if forecast else None,
            "forecast": forecast,
        }
    except Exception as e:
        print(f"weather error: {e}", file=sys.stderr)
        return None


def _tag(el):
    return el.tag.split("}")[-1]


def _clean(s):
    """HTML を除去して要約用の短い文に整える。"""
    if not s:
        return ""
    s = re.sub(r"(?s)<[^>]+>", " ", s)   # タグ除去
    s = html.unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:80]


def _first_img(s):
    if not s:
        return ""
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', s)
    return m.group(1) if m else ""


def parse_feed(raw):
    """RSS 2.0 / Atom から {title, link, published, summary, image} を抽出。"""
    items = []
    root = ET.fromstring(raw)
    for node in root.iter():
        kind = _tag(node)
        if kind == "item":  # RSS
            title = link = pub = desc = body = img = ""
            for c in node:
                t = _tag(c)
                if t == "title":
                    title = (c.text or "").strip()
                elif t == "link":
                    link = (c.text or "").strip()
                elif t == "pubDate":
                    pub = (c.text or "").strip()
                elif t == "description":
                    desc = c.text or ""
                elif t == "encoded":           # content:encoded
                    body = c.text or ""
                elif t == "thumbnail" and c.get("url"):    # media:thumbnail
                    img = img or c.get("url")
                elif t == "content" and c.get("url"):      # media:content
                    img = img or c.get("url")
                elif t == "enclosure" and c.get("type", "").startswith("image"):
                    img = img or c.get("url", "")
            if not img:
                img = _first_img(desc) or _first_img(body)
            if title:
                items.append({"title": title, "link": link, "published": pub,
                              "summary": _clean(desc or body), "image": img})
        elif kind == "entry":  # Atom
            title = link = pub = summary = img = ""
            for c in node:
                t = _tag(c)
                if t == "title":
                    title = (c.text or "").strip()
                elif t == "link":
                    rel = c.get("rel", "alternate")
                    if rel in ("alternate", "") and c.get("href"):
                        link = c.get("href")
                    elif rel == "enclosure" and c.get("href"):
                        img = img or c.get("href")
                elif t in ("published", "updated") and not pub:
                    pub = (c.text or "").strip()
                elif t in ("summary", "content"):
                    summary = summary or (c.text or "")
            if not img:
                img = _first_img(summary)
            if title:
                items.append({"title": title, "link": link, "published": pub,
                              "summary": _clean(summary), "image": img})
    return items


def fetch_news(cfg):
    news = []
    feeds = cfg.get("feeds", []) or []
    per_feed = max(1, cfg.get("news_max", 8) // max(1, len(feeds)))
    for feed in feeds:
        try:
            raw = fetch(feed["url"])
            got = 0
            for it in parse_feed(raw):
                it["feed"] = feed.get("name", "")
                news.append(it)
                got += 1
                if got >= per_feed + 3:
                    break
        except Exception as e:
            print(f"feed error {feed.get('url')}: {e}", file=sys.stderr)
    return news[: cfg.get("news_max", 8)]


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
