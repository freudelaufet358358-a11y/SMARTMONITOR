# SMARTMONITOR

Proxmox 上の Ubuntu VM に内蔵 GPU（Intel UHD 630）をパススルーし、物理 HDMI から
ダッシュボードを「スマートモニター」として常時表示するプロジェクト。

> **方針変更（採用中の構成）**: Home Assistant は**使わない**。
> 当初 HA で実装予定だった機能のうち、HA が必須な **SwitchBot 室温/湿度/消費電力/電気代は取りやめ**。
> 残り（時計・天気・時間割・ニュース）は **HA 不要の軽量スタンドアロン
> ダッシュボード**（静的 HTML + `python3 -m http.server` + 標準ライブラリの取得スクリプト）
> で実装する。AirPlay/Cast 受信は元から HA 非依存でそのまま使用。詳細 → [`docs/05-standalone-dashboard.md`](docs/05-standalone-dashboard.md)。
> （`docs/02`・`docs/04` の HA 版手順は参考として残置）

## 進捗状況 / ゴール

- [x] Proxmox IOMMU 有効化（`intel_iommu=on iommu=pt`）
- [x] ホスト側 GPU 分離（`i915` ブラックリスト + `update-initramfs -u`）
- [x] NEC BIOS で VT-d 有効化・IOMMU グループ確認
- [x] VM 301（q35 / UEFI）へ PCI デバイス追加（All Functions / Primary GPU / PCI-Express）
- [x] 物理 HDMI に Ubuntu 起動ロゴ出力を確認（**GPU パススルー成功**）
- [x] 自動ログイン + キオスク表示（→ `docs/01-setup-vm.md`） … `install.sh` 実行済み
- [x] AirPlay / Cast 受信（→ `docs/03-casting.md`） … `install.sh` 実行済み
- [ ] スタンドアロンダッシュボード（→ `docs/05-standalone-dashboard.md`）… `setup-dashboard.sh`
- [~] ~~Home Assistant（Docker）+ 各統合~~ … **不採用**（SwitchBot/電気代は取りやめ）

## 構成（採用中）

1 台の VM に「スタンドアロンダッシュボード表示」「キャスト受信」を載せる。Home Assistant は使わない。

```
┌─ Proxmox VE (host) ───────────────────────────────────────────┐
│  ┌─ Ubuntu Desktop VM 301 (GPU passthrough → 物理HDMI) ─────┐  │
│  │                                                          │  │
│  │   X11 セッション (Wayland は無効化)                       │  │
│  │   └ Openbox (軽量WM)                                      │  │
│  │       ├ Chrome --kiosk  → http://localhost:8080          │  │
│  │       │     （スタンドアロンダッシュボードを全画面表示）   │  │
│  │       ├ UxPlay        … AirPlay 受信（iPhone/Mac）        │  │
│  │       └ shanocast     … Google Cast 受信（PC Chrome）     │  │
│  │                                                          │  │
│  │   systemd                                                │  │
│  │   ├ smartmonitor-dashboard … python http.server :8080    │  │
│  │   └ smartmonitor-fetch.timer … 15分毎に天気+RSS取得       │  │
│  │       → data.json (時計はブラウザ側 JS で生成)            │  │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## 実装可否サマリ（更新後）

| 機能 | 可否 | 実装方法 |
|------|:---:|----------|
| 時計・日付 | ◎ | ブラウザ側 JS（`app.js`）、フリップクロック表示 |
| 天気 | ◎ | Open-Meteo（APIキー不要）を `fetch_data.py` が取得 |
| 大学の時間割 (UNIPA) | ○ | **UNIPA は ICS 出力なし** → `config.json` に手書き → 表で表示 |
| 最新ニュース (RSS) | ◎ | `fetch_data.py`（標準ライブラリ）が定期取得 |
| AirPlay 受信 | ◎ | UxPlay（UHD 630 を VA-API でハード支援デコード） |
| Google Cast 受信 | ○ | shanocast（PC Chrome から）。スマホ純正Castボタンは対象外 → AirPlay で代替 |
| ~~SwitchBot 室温/湿度/電力/電気代~~ | ✕ | **取りやめ**（Home Assistant 必須のため） |

> SwitchBot 系を後で復活させたい場合は HA を導入し `docs/02`・`docs/04` の手順に戻ればよい
> （`config/homeassistant/` の compose・設定例は残してある）。

## クイックスタート（押すだけインストール）

GPU パススルー済みの Ubuntu Desktop VM に、**キオスク用ユーザでログインした状態**で
`install.sh` を実行すると、依存関係（Openbox / Chrome / UxPlay / Docker / shanocast /
※Home Assistant も導入されるが現構成では不使用）の導入・配置・自動ログイン設定を一括で行う。
**ダッシュボードは `install.sh` の後に `setup-dashboard.sh` を実行**して有効化する。

> 現在の開発コードはブランチ `claude/quirky-albattani-qe4lkd` 上にある（main 未マージ）。
> **必ず `-b` でブランチを指定**して取得すること。

### Ubuntu でコードを取得する

```bash
# git が無ければ入れる
sudo apt update && sudo apt install -y git

# 作業ブランチを指定してクローン
git clone -b claude/quirky-albattani-qe4lkd \
  https://github.com/freudelaufet358358-a11y/smartmonitor.git

cd smartmonitor

# 1) 依存関係インストール（キオスク用ユーザでログインした状態で）
bash scripts/install.sh

# 2) スタンドアロンダッシュボードを有効化（HA 不要・現構成の本命）
bash scripts/setup-dashboard.sh
```

> **インストール済みの場合**は最新を取り込んで `setup-dashboard.sh` だけ実行すればよい:
> ```bash
> git pull origin claude/quirky-albattani-qe4lkd
> bash scripts/setup-dashboard.sh
> ```

最新を取り込む（クローン済みの場合、リポジトリ内で実行）:

```bash
git pull origin claude/quirky-albattani-qe4lkd
```

> プライベートリポジトリで認証を求められたら、HTTPS はパスワード欄に GitHub の
> Personal Access Token (PAT) を入れる。SSH 鍵を使う場合は
> `git@github.com:freudelaufet358358-a11y/smartmonitor.git` を `-b` 付きでクローンする。

### インストール後の流れ

1. `setup-dashboard.sh` 実行で `http://localhost:8080` にダッシュボードが立つ
2. `~/smartmonitor-dashboard/www/config.json` を編集（時間割・RSS・地名）→ `docs/05`
3. `sudo systemctl reboot` で自動ログイン + キオスク表示を確認
4. AirPlay/Cast は `install.sh` で導入済み。使い方/前面化調整は `docs/03`

環境変数で挙動を変えられる（例）:

```bash
# install.sh
KIOSK_USER=kiosk SETUP_AUTOLOGIN=no bash scripts/install.sh
# setup-dashboard.sh
KIOSK_USER=kiosk bash scripts/setup-dashboard.sh
```

| 変数 | 既定 | 対象 | 説明 |
|------|------|------|------|
| `KIOSK_USER` | 実行ユーザ | 両方 | キオスク/自動ログイン対象ユーザ |
| `DASHBOARD_URL` | `http://localhost:8080` | setup-dashboard | Chrome が開く URL |
| `SHANOCAST_IMAGE` | `ghcr.io/rgerganov/shanocast:latest` | install | Cast 受信の Docker イメージ |
| `SETUP_AUTOLOGIN` | `yes` | install | `no` で GDM 自動ログイン設定をスキップ |

## リポジトリ構成

```
README.md
docs/                         手順書（背景説明つき）
  01-setup-vm.md              VM キオスク化
  03-casting.md               AirPlay / Cast
  05-standalone-dashboard.md  ★HA不要ダッシュボード（採用中）
  02-home-assistant.md        （参考）HA + 統合
  04-dashboard.md             （参考）Lovelace ダッシュボード
scripts/
  install.sh                  ★依存関係 押すだけインストーラ
  setup-dashboard.sh          ★HA不要ダッシュボード セットアップ
  kiosk.sh                    Chrome キオスク起動
  uxplay.sh / shanocast.sh / raise-on-cast.sh   キャスト受信
dashboard/                    スタンドアロンダッシュボード本体（採用中）
  index.html / style.css / app.js
  config.json                 時間割・RSS・天気（編集して使う）
serve/
  fetch_data.py               天気+RSS を取得し data.json を生成（標準ライブラリのみ）
  smartmonitor-dashboard.service   配信(:8080) systemd ユニット
  smartmonitor-fetch.service/.timer 15分毎の取得
config/                       （参考）HA 用 compose / Lovelace 雛形
```

## ドキュメント

1. [`docs/01-setup-vm.md`](docs/01-setup-vm.md) — Ubuntu VM の自動ログイン・キオスク・WM
2. [`docs/03-casting.md`](docs/03-casting.md) — UxPlay + shanocast 導入と前面化
3. [`docs/05-standalone-dashboard.md`](docs/05-standalone-dashboard.md) — **HA 不要ダッシュボード（採用中）**
4. [`docs/06-desktop-kiosk.md`](docs/06-desktop-kiosk.md) — **GNOMEデスクトップ土台のキオスク（採用中・脱出可）**
5. [`docs/07-webhook-autoupdate.md`](docs/07-webhook-autoupdate.md) — **Webhook 自動更新 + 強制リロード**
6. （参考）[`docs/02-home-assistant.md`](docs/02-home-assistant.md) / [`docs/04-dashboard.md`](docs/04-dashboard.md) — HA 版（不採用だが残置）

## 前提・注意

- 本手順は **X11 セッション前提**（ウィンドウ前面化に wmctrl/xdotool を使うため Wayland を無効化）。
- 実際のエンティティ名（`sensor.xxx`）は SwitchBot 機種・登録名で変わるため、各手順内ではプレースホルダで記載。HA の「開発者ツール → 状態」で実名を確認して置き換えること。
- 設定値（電気料金単価・RSS の URL・大学の時間割）は各自の環境に合わせて編集する。
