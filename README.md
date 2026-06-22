# SMARTMONITOR

Proxmox 上の Ubuntu VM に内蔵 GPU（Intel UHD 630）をパススルーし、物理 HDMI から
Home Assistant ダッシュボードを「スマートモニター」として常時表示するプロジェクト。

## 進捗状況 / ゴール

- [x] Proxmox IOMMU 有効化（`intel_iommu=on iommu=pt`）
- [x] ホスト側 GPU 分離（`i915` ブラックリスト + `update-initramfs -u`）
- [x] NEC BIOS で VT-d 有効化・IOMMU グループ確認
- [x] VM 301（q35 / UEFI）へ PCI デバイス追加（All Functions / Primary GPU / PCI-Express）
- [x] 物理 HDMI に Ubuntu 起動ロゴ出力を確認（**GPU パススルー成功**）
- [ ] 自動ログイン + キオスク表示（→ `docs/01-setup-vm.md`）
- [ ] Home Assistant（Docker）導入 + 各統合（→ `docs/02-home-assistant.md`）
- [ ] AirPlay / Cast 受信（→ `docs/03-casting.md`）
- [ ] ダッシュボード作成（→ `docs/04-dashboard.md`）

## 構成（このプロジェクトの決定事項）

Home Assistant は **今の Ubuntu VM 内に Docker で同居**させる。
1 台の VM に「ダッシュボード表示」「HA 本体」「キャスト受信」をすべて載せる。

```
┌─ Proxmox VE (host) ───────────────────────────────────────────┐
│                                                                │
│  ┌─ Ubuntu Desktop VM 301 (GPU passthrough → 物理HDMI) ─────┐  │
│  │                                                          │  │
│  │   X11 セッション (Wayland は無効化)                       │  │
│  │   └ Openbox (軽量WM)                                      │  │
│  │       ├ Chromium --kiosk  → http://localhost:8123        │  │
│  │       │     （Home Assistant ダッシュボードを全画面表示） │  │
│  │       ├ UxPlay        … AirPlay 受信（iPhone/Mac）        │  │
│  │       └ shanocast     … Google Cast 受信（PC Chrome）     │  │
│  │                                                          │  │
│  │   Docker                                                 │  │
│  │   └ Home Assistant Container (network_mode: host)        │  │
│  │       ├ SwitchBot Cloud 統合（温湿度 / 電力 / エアコン）  │  │
│  │       ├ Calendar 統合（Google Calendar 等）              │  │
│  │       └ feedparser（RSS ニュース）                       │  │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## 実装可否サマリ

| 機能 | 可否 | 実装方法 |
|------|:---:|----------|
| 時計 | ◎ | HACS clock-weather-card 等 |
| カレンダー | ◎ | Calendar 統合（Google / CalDAV / ローカル） |
| 大学の時間割 (UNIPA) | ○ | **UNIPA は ICS 出力なし** → 手動の週間割カード（`docs/04`） |
| SwitchBot 室温・湿度 | ◎ | SwitchBot Cloud 統合（温湿度計） |
| SwitchBot エアコン温度 | ◎ | SwitchBot Hub 経由の climate エンティティ |
| SwitchBot プラグ 消費電力 | ◎ | Plug Mini の power(W)/energy(kWh) |
| 電気代 | ◎ | kWh × 単価をテンプレート / エネルギーダッシュボード |
| 最新ニュース (RSS) | ◎ | feedparser（HACS）+ Markdown カード |
| AirPlay 受信 | ◎ | UxPlay（UHD 630 を VA-API でハード支援デコード） |
| Google Cast 受信 | ○ | shanocast（PC Chrome から）。スマホ純正Castボタンは対象外 → AirPlay で代替 |

> △困難なのは「スマホの純正 Cast ボタンによる直接受信」だけ。実用上は AirPlay と
> shanocast、YouTube の TV コードリンクで埋められる。

## クイックスタート（押すだけインストール）

GPU パススルー済みの Ubuntu Desktop VM に、**キオスク用ユーザでログインした状態**で
以下を実行すると、依存関係（Openbox / Chrome / UxPlay / Docker / Home Assistant /
shanocast）の導入・配置・自動ログイン設定・HA 起動までを一括で行う。

```bash
git clone https://github.com/freudelaufet358358-a11y/smartmonitor.git
cd smartmonitor
bash scripts/install.sh
```

実行後の流れ（インストーラ末尾にも表示される）:

1. ブラウザで `http://localhost:8123` を開き HA 管理ユーザを作成
2. HACS / 統合（SwitchBot Cloud・カレンダー・feedparser）を追加 → `docs/02`
3. `lovelace-samples/dashboard.yaml` をダッシュボードに貼り付け → `docs/04`
4. `sudo systemctl reboot` で自動ログイン + キオスク表示を確認

環境変数で挙動を変えられる（例）:

```bash
KIOSK_USER=kiosk \
DASHBOARD_URL=http://localhost:8123/lovelace/home \
SETUP_AUTOLOGIN=no \
bash scripts/install.sh
```

| 変数 | 既定 | 説明 |
|------|------|------|
| `KIOSK_USER` | 実行ユーザ | キオスク/自動ログイン対象ユーザ |
| `DASHBOARD_URL` | `http://localhost:8123` | Chrome が開く URL |
| `SHANOCAST_IMAGE` | `ghcr.io/rgerganov/shanocast:latest` | Cast 受信の Docker イメージ |
| `SETUP_AUTOLOGIN` | `yes` | `no` で GDM 自動ログイン設定をスキップ |

## リポジトリ構成

```
README.md
docs/                         手順書（背景説明つき）
  01-setup-vm.md              VM キオスク化
  02-home-assistant.md        HA + 統合
  03-casting.md               AirPlay / Cast
  04-dashboard.md             ダッシュボード
scripts/                      install.sh が配置する実スクリプト
  install.sh                  ★押すだけインストーラ
  kiosk.sh                    Chrome キオスク起動
  uxplay.sh                   AirPlay 受信
  shanocast.sh                Cast 受信(Docker)
  raise-on-cast.sh            受信ウィンドウ前面化
config/
  homeassistant/
    docker-compose.yml        HA コンテナ定義
    configuration.example.yaml SwitchBot/RSS/電気代の反映例
  openbox/autostart           Openbox 起動項目
  lovelace/
    dashboard.yaml            ダッシュボード雛形
    timetable.md              時間割（手動）HTML
```

## ドキュメント

1. [`docs/01-setup-vm.md`](docs/01-setup-vm.md) — Ubuntu VM の自動ログイン・キオスク・WM
2. [`docs/02-home-assistant.md`](docs/02-home-assistant.md) — Docker 版 HA 導入 + SwitchBot / カレンダー / RSS
3. [`docs/03-casting.md`](docs/03-casting.md) — UxPlay + shanocast 導入と前面化
4. [`docs/04-dashboard.md`](docs/04-dashboard.md) — Lovelace ダッシュボード（時計 / 時間割 / SwitchBot）

> 手動で 1 ステップずつ進めたい場合は `docs/` を順に読む。`install.sh` は
> これらの手順のうち「依存導入・ファイル配置・自動ログイン設定・HA 起動」を自動化したもの。

## 前提・注意

- 本手順は **X11 セッション前提**（ウィンドウ前面化に wmctrl/xdotool を使うため Wayland を無効化）。
- 実際のエンティティ名（`sensor.xxx`）は SwitchBot 機種・登録名で変わるため、各手順内ではプレースホルダで記載。HA の「開発者ツール → 状態」で実名を確認して置き換えること。
- 設定値（電気料金単価・RSS の URL・大学の時間割）は各自の環境に合わせて編集する。
