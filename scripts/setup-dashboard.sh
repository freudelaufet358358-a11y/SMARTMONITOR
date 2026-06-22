#!/usr/bin/env bash
# =============================================================================
# SMARTMONITOR スタンドアロン・ダッシュボード セットアップ (Home Assistant 不要)
#   - dashboard/ を ~/smartmonitor-dashboard/www/ へ配置
#   - serve/fetch_data.py を ~/smartmonitor-dashboard/ へ配置
#   - systemd: HTTP配信(:8080) と 天気/RSS の定期取得(15分) を有効化
#   - キオスク(Chrome)の表示先を :8080 に切替
#
#   使い方 (キオスク用ユーザでログインした状態で):
#     bash scripts/setup-dashboard.sh
#
#   既に scripts/install.sh は実行済みである前提 (Chrome/Openbox/キオスク導入済み)。
#   Home Assistant を停止したい場合は最後の案内を参照。
# =============================================================================
set -euo pipefail

KIOSK_USER="${KIOSK_USER:-$(id -un)}"
KIOSK_HOME="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
DASH_DIR="${DASH_DIR:-$KIOSK_HOME/smartmonitor-dashboard}"
WWW_DIR="$DASH_DIR/www"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:8080}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

log()  { printf '\033[1;32m[DASHBOARD]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

if [ "$(id -u)" -eq 0 ]; then
  err "root では実行しないこと。キオスク用ユーザで 'bash scripts/setup-dashboard.sh' を実行する。"
  exit 1
fi
command -v python3 >/dev/null 2>&1 || { err "python3 が必要です。"; exit 1; }

# ---- 1. ファイル配置 --------------------------------------------------------
log "ダッシュボードを $WWW_DIR へ配置中..."
mkdir -p "$WWW_DIR"
install -m 0644 "$REPO_ROOT/dashboard/index.html"  "$WWW_DIR/index.html"
install -m 0644 "$REPO_ROOT/dashboard/style.css"   "$WWW_DIR/style.css"
install -m 0644 "$REPO_ROOT/dashboard/app.js"      "$WWW_DIR/app.js"
# config.json は既存があれば上書きしない (利用者の編集を保護)
if [ -f "$WWW_DIR/config.json" ]; then
  install -m 0644 "$REPO_ROOT/dashboard/config.json" "$WWW_DIR/config.json.new"
  warn "config.json は既存を保持。新版は config.json.new として配置した。"
else
  install -m 0644 "$REPO_ROOT/dashboard/config.json" "$WWW_DIR/config.json"
fi
install -m 0755 "$REPO_ROOT/serve/fetch_data.py" "$DASH_DIR/fetch_data.py"

# ---- 2. 初回データ取得 ------------------------------------------------------
log "初回データ取得 (天気 + RSS)..."
SMARTMONITOR_WWW="$WWW_DIR" python3 "$DASH_DIR/fetch_data.py" || \
  warn "初回取得に失敗 (ネット未接続など)。タイマーで後ほど再取得される。"

# ---- 3. systemd ユニット導入 ------------------------------------------------
log "systemd ユニットを導入中..."
render_unit() {
  sed -e "s|@USER@|$KIOSK_USER|g" \
      -e "s|@WWW@|$WWW_DIR|g" \
      -e "s|@DIR@|$DASH_DIR|g" "$1"
}
render_unit "$REPO_ROOT/serve/smartmonitor-dashboard.service" \
  | sudo tee /etc/systemd/system/smartmonitor-dashboard.service >/dev/null
render_unit "$REPO_ROOT/serve/smartmonitor-fetch.service" \
  | sudo tee /etc/systemd/system/smartmonitor-fetch.service >/dev/null
sudo install -m 0644 "$REPO_ROOT/serve/smartmonitor-fetch.timer" \
  /etc/systemd/system/smartmonitor-fetch.timer

sudo systemctl daemon-reload
sudo systemctl enable --now smartmonitor-dashboard.service
sudo systemctl enable --now smartmonitor-fetch.timer
log "配信: http://localhost:8080  / 取得タイマー: 15分間隔"

# ---- 4. キオスクの表示先を :8080 に切替 ------------------------------------
log "キオスク(Chrome)の表示先を $DASHBOARD_URL に切替中..."
install -m 0755 "$REPO_ROOT/scripts/kiosk.sh" "$KIOSK_HOME/kiosk.sh"
sed -i "s|@DASHBOARD_URL@|$DASHBOARD_URL|g" "$KIOSK_HOME/kiosk.sh"
sudo chown "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/kiosk.sh"

cat <<EOF

==================== ダッシュボード設定完了 ====================
配信中:  http://localhost:8080   (systemd: smartmonitor-dashboard)
データ:  $WWW_DIR/data.json は 15 分ごとに更新 (smartmonitor-fetch.timer)
編集:    $WWW_DIR/config.json
           - timetable ... 時間割 (slots にコマを記述。UNIPA は手動)
           - feeds ......... RSS フィード
           - weather ....... 緯度経度/地名
         編集後の反映:  systemctl restart smartmonitor-dashboard  (HTML側は再読込)
                        手動取得:  SMARTMONITOR_WWW=$WWW_DIR python3 $DASH_DIR/fetch_data.py

確認:    sudo systemctl reboot   で自動ログイン -> キオスクに新ダッシュボードが出る

(任意) Home Assistant を止めてリソースを解放する場合:
         cd ~/homeassistant && sudo docker compose down
         ※ データ削除はされない。再開は docker compose up -d。
===============================================================
EOF
