#!/usr/bin/env bash
# =============================================================================
# SMARTMONITOR 復旧スクリプト: GUI デスクトップに戻れないときに実行する
#   - 自動ログインと「強制セッション固定」を解除し、通常の GDM ログイン画面に戻す
#   - キオスクの自動起動 (GNOME autostart / Openbox autostart) を一時無効化
#   - 利用可能なデスクトップセッションと導入状況を表示
#
#   使い方 (TTY: Ctrl+Alt+F3 でログインしてから):
#     bash scripts/recover-desktop.sh
#   反映:
#     スクリプト末尾で gdm を再起動 → ログイン画面の歯車でセッションを選ぶ
# =============================================================================
set -uo pipefail

USER_NAME="${SUDO_USER:-$(id -un)}"
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"

echo "================ SMARTMONITOR 復旧 ================"
echo "対象ユーザ: $USER_NAME"
echo

echo "== 1) 利用可能なログインセッション =="
echo "[Xorg] /usr/share/xsessions/"
ls -1 /usr/share/xsessions/ 2>/dev/null | sed 's/^/   /' || echo "   (なし)"
echo "[Wayland] /usr/share/wayland-sessions/"
ls -1 /usr/share/wayland-sessions/ 2>/dev/null | sed 's/^/   /' || echo "   (なし)"
echo
echo "== デスクトップ導入状況 =="
if dpkg -l ubuntu-desktop gnome-shell 2>/dev/null | grep -qE '^ii'; then
  dpkg -l ubuntu-desktop gnome-shell 2>/dev/null | grep -E '^ii' | awk '{print "   "$2" "$3}'
else
  echo "   ⚠ ubuntu-desktop / gnome-shell が見つかりません（GNOME 未導入の可能性）"
fi
echo

echo "== 2) 自動ログイン / 強制セッションを解除 =="
if [ -d /etc/gdm3 ]; then
  sudo cp -n /etc/gdm3/custom.conf "/etc/gdm3/custom.conf.bak.$(date +%s)" 2>/dev/null || true
  # 既定に戻す（自動ログイン無効・Wayland/Xorg は GDM 既定に任せる）
  printf '[daemon]\n' | sudo tee /etc/gdm3/custom.conf >/dev/null
  echo "   /etc/gdm3/custom.conf を既定に戻した（自動ログイン無効）"
else
  echo "   GDM 設定ディレクトリ無し（lightdm 等かもしれません）"
fi
# 強制セッション指定を削除（GDM 既定に戻す）
if [ -f "/var/lib/AccountsService/users/$USER_NAME" ]; then
  sudo rm -f "/var/lib/AccountsService/users/$USER_NAME"
  echo "   セッション固定 (/var/lib/AccountsService/users/$USER_NAME) を削除した"
fi
echo

echo "== 3) キオスク自動起動を一時無効化 =="
n=0
for f in "$USER_HOME"/.config/autostart/smartmonitor-*.desktop; do
  [ -e "$f" ] && { mv "$f" "$f.disabled"; n=$((n+1)); }
done
if [ -f "$USER_HOME/.config/openbox/autostart" ]; then
  mv "$USER_HOME/.config/openbox/autostart" "$USER_HOME/.config/openbox/autostart.disabled"
  n=$((n+1))
fi
echo "   無効化した自動起動: $n 件（*.disabled にリネーム）"
echo

echo "== 4) GDM を再起動 =="
if systemctl list-unit-files 2>/dev/null | grep -q '^gdm3\.service'; then
  sudo systemctl restart gdm3
elif systemctl list-unit-files 2>/dev/null | grep -q '^gdm\.service'; then
  sudo systemctl restart gdm
else
  echo "   gdm が見つかりません。手動で: sudo systemctl restart <表示マネージャ>"
fi

cat <<EOF

==================== 復旧手順 完了 ====================
ログイン画面が出たら:
  ・ユーザを選ぶ → 右下の歯車 ⚙ で「Ubuntu」または「Ubuntu on Xorg」を選択 → ログイン

ログイン画面が出ない / セッションが一覧に無い場合:
  ・GNOME 未導入の可能性。ネット接続後に:
       sudo apt update && sudo apt install -y ubuntu-desktop
    その後  sudo systemctl restart gdm3

キオスクをまた使いたくなったら（デスクトップに入れた後で）:
  ・bash scripts/setup-desktop-kiosk.sh   （GNOME 土台のキオスク・脱出可）
=====================================================
EOF
