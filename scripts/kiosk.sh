#!/usr/bin/env bash
# Chromium/Chrome キオスク起動。Openbox autostart から呼ばれる。
# @DASHBOARD_URL@ は install.sh が実 URL に置換する。
set -euo pipefail

URL="${1:-@DASHBOARD_URL@}"

# 画面ブランク・省電力・スクリーンセーバを無効化
xset s off
xset s noblank
xset -dpms

# マウスカーソルを 1 秒操作なしで隠す
pgrep -x unclutter >/dev/null || unclutter -idle 1 &

# Home Assistant が応答するまで待つ (Docker 起動直後対策)
echo "[kiosk] waiting for Home Assistant at $URL ..."
until curl -sf "${URL%/}/manifest.json" >/dev/null 2>&1; do
  sleep 2
done
echo "[kiosk] Home Assistant is up. launching browser."

# クラッシュ復元バブルを抑止
PREF="$HOME/.config/google-chrome/Default/Preferences"
if [ -f "$PREF" ]; then
  sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$PREF" || true
fi

exec google-chrome \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --app="$URL"
