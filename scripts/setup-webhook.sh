#!/usr/bin/env bash
# =============================================================================
# SMARTMONITOR Webhook 自動更新 + 強制リロード のセットアップ
#   - Webhook サーバ (smartmonitor-update.service) を起動
#       POST/GET /update を受けると git pull → 再配置 → version.txt 更新
#   - ダッシュボード(app.js)が version.txt を監視して自動で強制リロード
#   - 任意: 定期自動pull (AUTOPULL=yes) も有効化できる
#
#   使い方:
#     bash scripts/setup-webhook.sh                       # ローカル専用 (127.0.0.1)
#     SMARTMONITOR_HOOK_SECRET=xxxx bash scripts/setup-webhook.sh   # LAN/外部公開 + 認証
#     AUTOPULL=yes bash scripts/setup-webhook.sh           # 5分毎の自動pullも有効化
# =============================================================================
set -uo pipefail

KIOSK_USER="${KIOSK_USER:-$(id -un)}"
KIOSK_HOME="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
DASH_DIR="${DASH_DIR:-$KIOSK_HOME/smartmonitor-dashboard}"
WWW_DIR="$DASH_DIR/www"
BRANCH="${SMARTMONITOR_BRANCH:-claude/quirky-albattani-qe4lkd}"
PORT="${SMARTMONITOR_HOOK_PORT:-8765}"
SECRET="${SMARTMONITOR_HOOK_SECRET:-}"
AUTOPULL="${AUTOPULL:-no}"
ENVFILE="$DASH_DIR/hook.env"

BIND_DEFAULT="127.0.0.1"; [ -n "$SECRET" ] && BIND_DEFAULT="0.0.0.0"
BIND="${SMARTMONITOR_HOOK_BIND:-$BIND_DEFAULT}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

log()  { printf '\033[1;32m[WEBHOOK]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

[ "$(id -u)" -eq 0 ] && { err "root では実行しないこと。"; exit 1; }
command -v python3 >/dev/null 2>&1 || { err "python3 が必要です。"; exit 1; }

# ---- 1. スクリプト配置 -----------------------------------------------------
log "update.sh / update_server.py を配置中..."
mkdir -p "$DASH_DIR" "$WWW_DIR"
install -m 0755 "$REPO_ROOT/serve/update.sh"        "$DASH_DIR/update.sh"
install -m 0755 "$REPO_ROOT/serve/update_server.py" "$DASH_DIR/update_server.py"

# ---- 2. 環境ファイル (秘密情報は 600) --------------------------------------
log "環境ファイルを作成中: $ENVFILE"
cat > "$ENVFILE" <<EOF
SMARTMONITOR_REPO=$REPO_ROOT
SMARTMONITOR_WWW=$WWW_DIR
SMARTMONITOR_UPDATE=$DASH_DIR/update.sh
SMARTMONITOR_BRANCH=$BRANCH
SMARTMONITOR_HOOK_PORT=$PORT
SMARTMONITOR_HOOK_BIND=$BIND
SMARTMONITOR_HOOK_SECRET=$SECRET
EOF
chmod 600 "$ENVFILE"

# ---- 3. 初回更新 (最新アセット配置 + version.txt 生成) ---------------------
log "初回更新を実行 (アセット配置 + version.txt)..."
SMARTMONITOR_REPO="$REPO_ROOT" SMARTMONITOR_WWW="$WWW_DIR" \
  bash "$DASH_DIR/update.sh" || warn "初回更新でエラー (後で再実行可)"

# ---- 4. systemd: Webhook サーバ --------------------------------------------
render() {
  sed -e "s|@USER@|$KIOSK_USER|g" -e "s|@DASH_DIR@|$DASH_DIR|g" \
      -e "s|@ENVFILE@|$ENVFILE|g" "$1"
}
log "Webhook サーバを systemd に登録中..."
render "$REPO_ROOT/serve/smartmonitor-update.service" \
  | sudo tee /etc/systemd/system/smartmonitor-update.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now smartmonitor-update.service

# ---- 5. (任意) 定期自動pull ------------------------------------------------
if [ "$AUTOPULL" = "yes" ]; then
  log "定期自動pull (5分毎) を有効化中..."
  render "$REPO_ROOT/serve/smartmonitor-autopull.service" \
    | sudo tee /etc/systemd/system/smartmonitor-autopull.service >/dev/null
  sudo install -m 0644 "$REPO_ROOT/serve/smartmonitor-autopull.timer" \
    /etc/systemd/system/smartmonitor-autopull.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now smartmonitor-autopull.timer
fi

sudo chown -R "$KIOSK_USER:$KIOSK_USER" "$DASH_DIR" 2>/dev/null || true

# ---- 案内 ------------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
cat <<EOF

==================== Webhook 自動更新 設定完了 ====================
エンドポイント:
  ローカル   : curl -X POST http://localhost:$PORT/update
EOF
if [ -n "$SECRET" ]; then
cat <<EOF
  LAN/外部   : curl -X POST "http://$IP:$PORT/update?token=<secret>"
  GitHub     : リポジトリ Settings → Webhooks → Add webhook
                 Payload URL : http://<公開アドレス>:$PORT/update
                 Content type: application/json
                 Secret      : (設定した SMARTMONITOR_HOOK_SECRET)
  ※ 認証あり(0.0.0.0待受)。GitHub から届かせるには公開到達性が必要
    (ポート開放 or cloudflared/ngrok などのトンネル)。
EOF
else
cat <<EOF
  ※ 認証なし・127.0.0.1 のみ待受 (安全側の既定)。
    LAN/GitHub から叩くには: SMARTMONITOR_HOOK_SECRET=xxxx で再実行。
EOF
fi
cat <<EOF

動作: /update が叩かれる → git pull + 再配置 → version.txt 更新
      → 画面のダッシュボードが 7 秒以内に自動で強制リロード

GitHub に届かせるのが難しい家庭内環境では、これが簡単:
  AUTOPULL=yes bash scripts/setup-webhook.sh   # 5分毎に自動pull+リロード
状態確認: systemctl status smartmonitor-update.service
================================================================
EOF
