# 05. スタンドアロンダッシュボード（Home Assistant 不要・採用中）

Home Assistant を使わず、時計・天気・時間割・ニュースを表示する
軽量ダッシュボード。**追加の pip 依存ゼロ**（Python 標準ライブラリ + ブラウザのみ）。

- 配信: `python3 -m http.server`（systemd で常駐）
- データ: `fetch_data.py` が 15 分ごとに天気(Open-Meteo)と RSS を取得 → `data.json`
- 画面構成: 左=アナログ時計＋デジタル時刻＋挨拶 / 中央上=日付つき時間割 /
  右上=天気（現在＋5日間予報・降水確率）/ 下=サムネ付きニュース
- 時計・時間割描画: ブラウザ側 `app.js`（天気アイコンも code から SVG 生成）

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
- `serve/fetch_data.py` を `~/smartmonitor-dashboard/` へ配置
- systemd: `smartmonitor-dashboard.service`（:8080 配信）と
  `smartmonitor-fetch.timer`（15 分毎取得）を有効化
- 初回データ取得
- キオスク（Chrome）の表示先を `http://localhost:8080` に切替

最後に再起動して確認:

```bash
sudo systemctl reboot
```

## 2. 画面から編集（⚙ 設定パネル）★おすすめ

ファイルを触らずに、**画面右下の ⚙ ボタン**から以下を編集して「保存」できる。

- **天気の地域** … 主要都市プリセット（東京/札幌/大阪…）から選ぶか、地名・緯度経度を直接入力
- **時間割** … 曜日・時限・各コマを表形式で編集（＋で曜日/時限の追加、✕で削除）

保存すると配信サーバ(`server.py`)が `config.json` を更新し、天気を取り直して、
**表示中の全ダッシュボードを自動でリロード**する（`version.txt` 監視による）。

> この機能は配信を `server.py`（`setup-dashboard.sh` が導入）で行っている前提。
> `server.py` が無い静的配信のときは、設定はブラウザの localStorage に退避されて
> その画面にだけ反映される（時間割は反映、天気の再取得には `server.py` が必要）。

## 3. 設定ファイル `config.json`（直接編集する場合）

`~/smartmonitor-dashboard/www/config.json` を編集する。

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
  "news_max": 8,
  "timetable": {                    // ↓ §4 参照（UNIPA は手動）
    "days": ["月","火","水","木","金"],
    "periods": ["1","2","3","4","5"],
    "times": ["08:45 - 09:35","09:45 - 10:35","10:45 - 11:35","11:45 - 12:35","13:25 - 14:15"],
    "note": "※時間割は変更される場合があります",
    "cells": {
      "1": ["数学Ⅰ","英語コミュⅠ","現代文","化学基礎","数学Ⅰ"],
      "2": ["英語コミュⅠ","数学Ⅰ","古典B","英語コミュⅠ","現代文"],
      "3": ["現代文","化学基礎","数学Ⅰ","体育","現代文"],
      "4": ["化学基礎","現代文","英語コミュⅠ","情報Ⅰ","化学基礎"],
      "5": ["体育","情報Ⅰ","家庭基礎","数学Ⅰ","体育館"]
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
