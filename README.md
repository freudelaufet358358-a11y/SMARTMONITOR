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

## ドキュメント

1. [`docs/01-setup-vm.md`](docs/01-setup-vm.md) — Ubuntu VM の自動ログイン・キオスク・WM
2. [`docs/02-home-assistant.md`](docs/02-home-assistant.md) — Docker 版 HA 導入 + SwitchBot / カレンダー / RSS
3. [`docs/03-casting.md`](docs/03-casting.md) — UxPlay + shanocast 導入と前面化
4. [`docs/04-dashboard.md`](docs/04-dashboard.md) — Lovelace ダッシュボード（時計 / 時間割 / SwitchBot）

## 前提・注意

- 本手順は **X11 セッション前提**（ウィンドウ前面化に wmctrl/xdotool を使うため Wayland を無効化）。
- 実際のエンティティ名（`sensor.xxx`）は SwitchBot 機種・登録名で変わるため、各手順内ではプレースホルダで記載。HA の「開発者ツール → 状態」で実名を確認して置き換えること。
- 設定値（電気料金単価・RSS の URL・大学の時間割）は各自の環境に合わせて編集する。
