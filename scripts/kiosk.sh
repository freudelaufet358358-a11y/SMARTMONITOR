#!/usr/bin/env bash
# Chrome キオスク起動。Openbox autostart から呼ばれる。
# @DASHBOARD_URL@ は install.sh / setup-dashboard.sh が実 URL に置換する。
# Ctrl+W などで閉じても自動で復帰するよう無限ループで再起動する。
set -uo pipefail   # -e は付けない（Chrome 終了でループを抜けないように）

URL="${1:-@DASHBOARD_URL@}"

# 画面ブランク・省電力・スクリーンセーバを無効化
xset s off
xset s noblank
xset -dpms

# マウスカーソルを 1 秒操作なしで隠す
pgrep -x unclutter >/dev/null || unclutter -idle 1 &

# 表示先 (ダッシュボード) が応答するまで待つ
echo "[kiosk] waiting for dashboard at $URL ..."
until curl -sf -o /dev/null "$URL"; do
  sleep 2
done
echo "[kiosk] dashboard is up. launching browser."

PREF="$HOME/.config/google-chrome/Default/Preferences"

# 閉じても/落ちても再起動するループ
while true; do
  # クラッシュ復元バブルを抑止
  if [ -f "$PREF" ]; then
    sed -i 's/"exit_type":"[^"]*"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$PREF" 2>/dev/null || true
  fi

  google-chrome \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --overscroll-history-navigation=0 \
    --check-for-update-interval=31536000 \
    --app="$URL"

  echo "[kiosk] browser exited (code $?). relaunching in 2s..."
  sleep 2
done
