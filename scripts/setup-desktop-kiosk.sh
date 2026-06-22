#!/usr/bin/env bash
# =============================================================================
# SMARTMONITOR: 通常の GNOME デスクトップ上でキオスク表示する構成へ切替える
#   - 自動ログイン先を GNOME(Xorg) セッションに変更
#       → タスクバー/Dock のある普通のデスクトップが土台になる
#   - ダッシュボード / AirPlay(UxPlay) / Cast(shanocast) を GNOME ログイン時に自動起動
#       → ダッシュボードは全画面だが F11 / Super キーでデスクトップへ脱出できる
#   - 黒画面ロックの原因だった Openbox 単独セッションをやめる
#
#   使い方 (キオスク用ユーザでログインした状態 / TTY でも可):
#     bash scripts/setup-desktop-kiosk.sh
#   反映:
#     sudo systemctl reboot
# =============================================================================
set -uo pipefail

KIOSK_USER="${KIOSK_USER:-$(id -un)}"
KIOSK_HOME="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:8080}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

log()  { printf '\033[1;32m[DESKTOP]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

if [ "$(id -u)" -eq 0 ]; then
  err "root では実行しないこと。キオスク用ユーザで実行する。"
  exit 1
fi

# ---- 1. GNOME(Xorg) セッションを選ぶ ---------------------------------------
SESS=""
for s in ubuntu-xorg gnome-xorg ubuntu gnome; do
  [ -f "/usr/share/xsessions/$s.desktop" ] && { SESS="$s"; break; }
done
if [ -z "$SESS" ]; then
  err "GNOME セッションが見つかりません。先に: sudo apt install ubuntu-desktop"
  exit 1
fi
case "$SESS" in
  ubuntu|gnome)
    warn "Xorg セッションが無く '$SESS'(Wayland) を選択。Cast の前面化(wmctrl)が効かない場合があります。"
    warn "可能なら: sudo apt install ubuntu-desktop で 'Ubuntu on Xorg' を用意してください。" ;;
esac
log "ログインセッション: $SESS （タスクバー/Dock のある通常デスクトップ）"

# ---- 2. 自動ログイン + セッション固定 --------------------------------------
log "GDM 自動ログインと既定セッションを設定中..."
# Xorg セッションを選んだときだけ Wayland を無効化する。
# (Wayland セッションしか無いのに WaylandEnable=false にすると起動できず GUI に入れなくなる)
WAYLAND_LINE=""
case "$SESS" in
  *xorg*) WAYLAND_LINE="WaylandEnable=false" ;;
esac
sudo cp -n /etc/gdm3/custom.conf "/etc/gdm3/custom.conf.bak.$(date +%s)" 2>/dev/null || true
{
  echo "[daemon]"
  [ -n "$WAYLAND_LINE" ] && echo "$WAYLAND_LINE"
  echo "AutomaticLoginEnable=true"
  echo "AutomaticLogin=$KIOSK_USER"
} | sudo tee /etc/gdm3/custom.conf >/dev/null
sudo install -d /var/lib/AccountsService/users
sudo tee "/var/lib/AccountsService/users/$KIOSK_USER" >/dev/null <<EOF
[User]
Session=$SESS
XSession=$SESS
SystemAccount=false
EOF

# ---- 3. kiosk.sh を再配置 (全画面だが脱出可) -------------------------------
log "kiosk.sh を配置中 (URL=$DASHBOARD_URL)..."
install -m 0755 "$REPO_ROOT/scripts/kiosk.sh" "$KIOSK_HOME/kiosk.sh"
sed -i "s|@DASHBOARD_URL@|$DASHBOARD_URL|g" "$KIOSK_HOME/kiosk.sh"

# ---- 4. GNOME autostart へ登録 ---------------------------------------------
log "GNOME スタートアップに登録中 (ダッシュボード / AirPlay / Cast)..."
AUTODIR="$KIOSK_HOME/.config/autostart"
mkdir -p "$AUTODIR"
for f in "$REPO_ROOT"/config/autostart/*.desktop; do
  sed "s|@HOME@|$KIOSK_HOME|g" "$f" > "$AUTODIR/$(basename "$f")"
done

# ---- 5. 旧 Openbox autostart を無効化 (二重起動防止) -----------------------
# GNOME 下では Openbox autostart は実行されないが、混乱回避のため退避する
if [ -f "$KIOSK_HOME/.config/openbox/autostart" ]; then
  mv "$KIOSK_HOME/.config/openbox/autostart" \
     "$KIOSK_HOME/.config/openbox/autostart.disabled" 2>/dev/null || true
fi

sudo chown -R "$KIOSK_USER:$KIOSK_USER" \
  "$KIOSK_HOME/.config" "$KIOSK_HOME/kiosk.sh" 2>/dev/null || true

cat <<EOF

============== デスクトップ + キオスク 設定完了 ==============
土台      : 通常の GNOME デスクトップ ($SESS) — タスクバー/Dock あり
自動起動  : ダッシュボード(全画面) + AirPlay(UxPlay) + Cast(shanocast)
脱出方法  : Super(Windows)キー … Activities/Dock を表示
            F11 ……………………… 全画面の解除/再開
            Ctrl+W で閉じても kiosk.sh が自動で開き直す
反映      : sudo systemctl reboot
============================================================
EOF
