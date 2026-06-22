#!/usr/bin/env bash
# =============================================================================
# SMARTMONITOR ワンショット・インストーラ
#   押すだけで以下を導入・設定する:
#     - キオスク基盤 (Openbox / wmctrl / xdotool / unclutter / Google Chrome)
#     - AirPlay 受信 (UxPlay) + VA-API ハード支援デコード用ドライバ
#     - Google Cast 受信 (shanocast / Docker)
#     - Home Assistant (Docker) + 起動
#     - 自動ログイン + X11 強制 + Openbox セッション
#     - 各種起動スクリプト/設定ファイルの配置
#
#   使い方 (キオスク用ユーザでログインした状態で):
#     bash scripts/install.sh
#
#   ※ sudo はスクリプト内部で必要箇所のみ呼ぶ。途中でパスワードを聞かれる。
# =============================================================================
set -euo pipefail

# ---- 設定（必要なら環境変数で上書き可）-------------------------------------
KIOSK_USER="${KIOSK_USER:-$(id -un)}"
KIOSK_HOME="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
HA_DIR="${HA_DIR:-$KIOSK_HOME/homeassistant}"
CAST_DIR="${CAST_DIR:-$KIOSK_HOME/casting}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:8123}"
SHANOCAST_IMAGE="${SHANOCAST_IMAGE:-ghcr.io/rgerganov/shanocast:latest}"
SETUP_AUTOLOGIN="${SETUP_AUTOLOGIN:-yes}"   # no にすると自動ログイン設定をスキップ

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ---- ログ -------------------------------------------------------------------
log()  { printf '\033[1;32m[INSTALL]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

# ---- 0. 事前チェック --------------------------------------------------------
if [ "$(id -u)" -eq 0 ]; then
  err "root では実行しないこと。キオスク用ユーザでログインして 'bash scripts/install.sh' を実行する。"
  exit 1
fi
if ! command -v sudo >/dev/null 2>&1; then
  err "sudo が必要です。"
  exit 1
fi
if ! grep -qiE 'ubuntu|debian' /etc/os-release 2>/dev/null; then
  warn "Ubuntu/Debian 以外の可能性があります。apt 前提で続行します。"
fi
log "対象ユーザ: $KIOSK_USER  ホーム: $KIOSK_HOME"

# =============================================================================
# 1. APT パッケージ
# =============================================================================
log "APT を更新中..."
sudo apt-get update -y

log "キオスク/受信/基盤パッケージを導入中..."
sudo apt-get install -y \
  ca-certificates curl wget gnupg lsb-release \
  openbox xterm wmctrl xdotool x11-xserver-utils unclutter \
  avahi-daemon \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-libav gstreamer1.0-tools \
  gstreamer1.0-vaapi \
  vainfo

# Intel ハード支援デコード用ドライバ (UHD 630)
log "Intel VA-API ドライバを導入中..."
sudo apt-get install -y intel-media-va-driver-non-free || \
  sudo apt-get install -y intel-media-va-driver || \
  warn "intel-media-va-driver の導入に失敗。ソフトデコードにフォールバックします。"

# =============================================================================
# 2. UxPlay (apt に無ければソースビルド)
# =============================================================================
if ! command -v uxplay >/dev/null 2>&1; then
  log "UxPlay を apt から導入を試行..."
  if ! sudo apt-get install -y uxplay; then
    warn "apt に uxplay が無いためソースからビルドします。"
    sudo apt-get install -y \
      cmake build-essential \
      libssl-dev libplist-dev libavahi-compat-libdnssd-dev \
      libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev
    tmp="$(mktemp -d)"
    git clone --depth 1 https://github.com/FDH2/UxPlay "$tmp/UxPlay" || \
      git clone --depth 1 https://github.com/antimof/UxPlay "$tmp/UxPlay"
    ( cd "$tmp/UxPlay" && cmake . && make -j"$(nproc)" && sudo make install )
    rm -rf "$tmp"
  fi
fi
command -v uxplay >/dev/null 2>&1 && log "UxPlay: $(command -v uxplay)" || warn "UxPlay 未導入。"
# 1.45 未満だとミラーリング停止時にウィンドウが残る。古ければ案内。
if command -v uxplay >/dev/null 2>&1; then
  uxver="$(uxplay -v 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)"
  if [ -n "$uxver" ] && [ "$(printf '%s\n1.45\n' "$uxver" | sort -V | head -1)" != "1.45" ]; then
    warn "UxPlay $uxver は古く、ミラーリング停止後も窓が残ります。"
    warn "  -> bash scripts/update-uxplay.sh で 1.45+ に更新してください。"
  fi
fi

# =============================================================================
# 3. Google Chrome (deb)
# =============================================================================
if ! command -v google-chrome >/dev/null 2>&1; then
  log "Google Chrome を導入中..."
  wget -qO /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt-get install -y /tmp/chrome.deb
  rm -f /tmp/chrome.deb
fi
log "Chrome: $(command -v google-chrome)"

# =============================================================================
# 4. Docker
# =============================================================================
if ! command -v docker >/dev/null 2>&1; then
  log "Docker を導入中..."
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
# キオスクユーザが sudo なしで docker を使えるように (shanocast.sh 用)
sudo usermod -aG docker "$KIOSK_USER" || true
log "Docker: $(docker --version)"

# =============================================================================
# 5. 設定ファイル/スクリプトの配置
# =============================================================================
log "起動スクリプトを配置中..."
mkdir -p "$CAST_DIR"
install -m 0755 "$REPO_ROOT/scripts/kiosk.sh"         "$KIOSK_HOME/kiosk.sh"
install -m 0755 "$REPO_ROOT/scripts/uxplay.sh"        "$CAST_DIR/uxplay.sh"
install -m 0755 "$REPO_ROOT/scripts/shanocast.sh"     "$CAST_DIR/shanocast.sh"
install -m 0755 "$REPO_ROOT/scripts/raise-on-cast.sh" "$CAST_DIR/raise-on-cast.sh"

log "Openbox autostart / rc.xml / menu.xml を配置中..."
mkdir -p "$KIOSK_HOME/.config/openbox"
install -m 0644 "$REPO_ROOT/config/openbox/autostart" "$KIOSK_HOME/.config/openbox/autostart"
install -m 0644 "$REPO_ROOT/config/openbox/rc.xml"     "$KIOSK_HOME/.config/openbox/rc.xml"
install -m 0644 "$REPO_ROOT/config/openbox/menu.xml"   "$KIOSK_HOME/.config/openbox/menu.xml"

log "Home Assistant の compose / 設定例を配置中..."
mkdir -p "$HA_DIR/config"
install -m 0644 "$REPO_ROOT/config/homeassistant/docker-compose.yml" "$HA_DIR/docker-compose.yml"
# ※ 実 configuration.yaml は HA が初回生成するため上書きしない。例として併置:
install -m 0644 "$REPO_ROOT/config/homeassistant/configuration.example.yaml" \
  "$HA_DIR/configuration.example.yaml"

# Lovelace のサンプルも参照用に配置
mkdir -p "$HA_DIR/lovelace-samples"
install -m 0644 "$REPO_ROOT/config/lovelace/dashboard.yaml" "$HA_DIR/lovelace-samples/dashboard.yaml"
install -m 0644 "$REPO_ROOT/config/lovelace/timetable.md"   "$HA_DIR/lovelace-samples/timetable.md"

# kiosk.sh の URL を差し込み
sed -i "s|@DASHBOARD_URL@|$DASHBOARD_URL|g" "$KIOSK_HOME/kiosk.sh"
# shanocast.sh のイメージ名を差し込み
sed -i "s|@SHANOCAST_IMAGE@|$SHANOCAST_IMAGE|g" "$CAST_DIR/shanocast.sh"

# =============================================================================
# 6. サービス有効化 / イメージ取得
# =============================================================================
log "avahi-daemon (mDNS) を有効化中..."
sudo systemctl enable --now avahi-daemon

log "Home Assistant イメージを取得して起動中..."
( cd "$HA_DIR" && sudo docker compose pull && sudo docker compose up -d )

log "shanocast イメージを取得中 (best-effort)..."
if ! sudo docker pull "$SHANOCAST_IMAGE"; then
  warn "shanocast イメージの取得に失敗しました。"
  warn "  -> https://github.com/rgerganov/shanocast の最新 README で"
  warn "     正しいイメージ名/タグを確認し、SHANOCAST_IMAGE を指定して再実行してください。"
fi

# =============================================================================
# 7. 自動ログイン + X11 強制 + Openbox セッション
# =============================================================================
if [ "$SETUP_AUTOLOGIN" = "yes" ] && [ -d /etc/gdm3 ]; then
  log "GDM3 の自動ログイン + Wayland 無効化を設定中..."
  sudo cp -n /etc/gdm3/custom.conf "/etc/gdm3/custom.conf.bak.$(date +%s)" 2>/dev/null || true
  sudo tee /etc/gdm3/custom.conf > /dev/null <<EOF
[daemon]
WaylandEnable=false
AutomaticLoginEnable=true
AutomaticLogin=$KIOSK_USER
EOF

  log "ログインセッションを Openbox に固定中..."
  sudo install -d /var/lib/AccountsService/users
  sudo tee "/var/lib/AccountsService/users/$KIOSK_USER" > /dev/null <<EOF
[User]
Session=openbox
XSession=openbox
SystemAccount=false
EOF
else
  warn "自動ログイン設定をスキップ (GDM3 未検出 または SETUP_AUTOLOGIN=no)。"
  warn "ログイン画面の歯車から手動で 'Openbox' セッションを選んでください。"
fi

# 所有権の最終調整
sudo chown -R "$KIOSK_USER:$KIOSK_USER" \
  "$KIOSK_HOME/.config" "$CAST_DIR" "$KIOSK_HOME/kiosk.sh" "$HA_DIR" 2>/dev/null || true

# =============================================================================
# 完了
# =============================================================================
cat <<EOF

==================== インストール完了 ====================
次の手順:

  1) Home Assistant を初期設定:
       ブラウザ (別PCでも可) で  $DASHBOARD_URL  を開き管理ユーザを作成。

  2) HACS / 統合を追加 (docs/02-home-assistant.md):
       - HACS 導入後、feedparser / clock-weather-card / atomic-calendar-revive
       - SwitchBot Cloud (token/secret) / カレンダー
       - configuration.yaml に $HA_DIR/configuration.example.yaml の必要部分を反映
         反映後:  sudo docker restart homeassistant

  3) ダッシュボード作成 (docs/04-dashboard.md):
       $HA_DIR/lovelace-samples/dashboard.yaml を「生の構成エディタ」に貼り付け。

  4) 再起動して自動ログイン + キオスク表示を確認:
       sudo systemctl reboot

  ※ docker をパスワードなしで使うためのグループ反映には再ログインが必要です
    (この再起動で反映されます)。
=========================================================
EOF
