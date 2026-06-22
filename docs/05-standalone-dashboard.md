# 05. スタンドアロンダッシュボード（Home Assistant 不要・採用中）

Home Assistant を使わず、時計・天気・時間割・ニュースを表示する
軽量ダッシュボード。**追加の pip 依存ゼロ**（Python 標準ライブラリ + ブラウザのみ）。

- 配信: `server.py`（静的配信 + 設定保存API、systemd で常駐）
- データ: `fetch_data.py` が 15 分ごとに天気(Open-Meteo)と RSS を取得 → `data.json`
- 時計（フリップ）・時間割描画: ブラウザ側 `app.js`
- 設定: 画面右下の **⚙ ボタン**から「天気の地域」「時間割」を編集して保存できる

> SwitchBot の室温/湿度/消費電力/電気代は HA 必須のため**取りやめ**。
> 復活させたくなったら `docs/02`・`docs/04`（HA 版）に戻る。

## 1. セットアップ（押すだけ）

`scripts/install.sh` 実行後のマシンで:

```bash
cd smartmonitor
git pull origin claude/quirky-albattani-qe4lkd   # 既にクローン済みなら最新化
bash scripts/setup-dashboard.sh
```

これで以下が行われる:

- `dashboard/` を `~/smartmonitor-dashboard/www/` へ配置
- `serve/fetch_data.py` と `serve/server.py` を `~/smartmonitor-dashboard/` へ配置
- systemd: `smartmonitor-dashboard.service`（:8080 配信 + 設定保存API）と
  `smartmonitor-fetch.timer`（15 分毎取得）を有効化
- 初回データ取得
- キオスク（Chrome）の表示先を `http://localhost:8080` に切替

最後に再起動して確認:

```bash
sudo systemctl reboot
```

## 2. 画面から設定する（⚙ ボタン）

ダッシュボード右下の **⚙** を押すと設定パネルが開く。

- **天気の地域** … プリセット（東京・大阪・札幌…）から選ぶか、地名・緯度・経度・
  タイムゾーンを直接入力する。保存すると `server.py` が `config.json` を更新し、
  その場で天気を取り直す（数秒で新しい地域に切り替わる）。
- **時間割** … 曜日（列）・時限（行）・各コマを表で編集する。`＋ 曜日を追加` /
  `＋ 時限を追加` で増やし、各見出しの `✕` で削除できる。保存すると即反映される。

> `server.py` ではなく素の `python3 -m http.server` で配信している場合は、保存内容を
> ブラウザの localStorage に退避して時間割だけは反映する（天気の地域を実際に取得し直す
> には `server.py` が必要）。本セットアップ手順なら `server.py` で配信されるため気にしなくてよい。

## 3. 設定ファイル `config.json`（直接編集）

⚙ を使わず `~/smartmonitor-dashboard/www/config.json` を手で編集してもよい。

```jsonc
{
  "title": "SmartMonitor",
  "weather": {                      // 天気の地点（Open-Meteo, APIキー不要）
    "name": "東京",
    "latitude": 35.68,
    "longitude": 139.76,
    "timezone": "Asia/Tokyo"
  },
  "feeds": [                        // RSS フィード（複数可）
    { "name": "NHK主要", "url": "https://www.nhk.or.jp/rss/news/cat0.xml" },
    { "name": "NHK科学", "url": "https://www.nhk.or.jp/rss/news/cat3.xml" }
  ],
  "news_max": 10,
  "timetable": {                    // ↓ §4 参照（UNIPA は手動）
    "days": ["月","火","水","木","金"],
    "periods": ["1","2","3","4","5"],
    "cells": {
      "1": ["線形代数","","英語","物理",""],
      "2": ["プログラミング","微積分","","物理演習","体育"],
      "3": ["","情報倫理","実験","","ゼミ"],
      "4": ["第二外国語","","実験","統計",""],
      "5": ["","","","",""]
    }
  }
}
```

編集後の反映:

```bash
# 時計/時間割(config.json)は次回ブラウザ更新で反映（最大1時間 or 再起動で即時）
# 天気/RSS(feeds)を今すぐ取り直す:
SMARTMONITOR_WWW=~/smartmonitor-dashboard/www \
  python3 ~/smartmonitor-dashboard/fetch_data.py
```

## 4. 大学の時間割（UNIPA は手動）

UNIPA は ICS/iCal 出力が無いため、`config.json` の `timetable.cells` に手書きする。

- `days` … 表示する曜日（左→右）
- `periods` … 時限（上→下）
- `cells["時限"]` … その時限の各曜日の授業名（`days` と同じ並び、空きは `""`）

ダッシュボードは**今日の曜日の列を自動ハイライト**する（月〜金）。

## 5. 運用 / トラブルシュート

| 操作 | コマンド |
|------|----------|
| 配信状態 | `systemctl status smartmonitor-dashboard` |
| 取得タイマー状態 | `systemctl status smartmonitor-fetch.timer` |
| 手動で今すぐ取得 | `SMARTMONITOR_WWW=~/smartmonitor-dashboard/www python3 ~/smartmonitor-dashboard/fetch_data.py` |
| 配信再起動 | `sudo systemctl restart smartmonitor-dashboard` |
| ブラウザで直接確認 | `http://localhost:8080` |

| 症状 | 対処 |
|------|------|
| ニュースが空 | フィード URL を確認。`fetch_data.py` を手動実行しエラー出力を見る |
| 天気が「データなし」 | `weather.latitude/longitude` を確認。ネット接続/タイマー稼働を確認 |
| 時間割の今日強調がずれる | 端末のタイムゾーン（`Asia/Tokyo`）を確認 |
| 変更が反映されない | キャッシュ無効化のため配信再起動 + キオスク再読込（再起動が確実） |

## 6. （任意）Home Assistant を停止する

HA はもう使わないので、リソースを空けたい場合は停止してよい（データは消えない）:

```bash
cd ~/homeassistant && sudo docker compose down
# 再開する場合: sudo docker compose up -d
```
