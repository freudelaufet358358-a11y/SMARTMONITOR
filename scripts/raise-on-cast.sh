#!/usr/bin/env bash
# キャスト受信ウィンドウ (UxPlay / shanocast) が現れたら全画面・最前面にし、
# 消えたらキオスク (Chrome) を前面に戻す監視ループ。Openbox autostart から呼ばれる。
#
# 受信ウィンドウのタイトルは環境で異なる。一度 `wmctrl -l` で実際の名前を確認し
# 必要なら CAST_PATTERNS を調整すること。
set -euo pipefail
export DISPLAY="${DISPLAY:-:0}"

CAST_PATTERNS="${CAST_PATTERNS:-UxPlay|shanocast|AirPlay|RPiPlay}"
KIOSK_PATTERN="${KIOSK_PATTERN:-Google Chrome|Chromium|SmartMonitor}"

raised=""

while true; do
  cast_win="$(wmctrl -l | grep -E "$CAST_PATTERNS" | head -n1 | awk '{print $1}')" || true

  if [ -n "$cast_win" ]; then
    if [ "$cast_win" != "$raised" ]; then
      wmctrl -i -a "$cast_win" || true
      wmctrl -i -r "$cast_win" -b add,fullscreen,above || true
      raised="$cast_win"
      echo "[raise] cast window $cast_win -> fullscreen/front"
    fi
  else
    if [ -n "$raised" ]; then
      # 受信終了 -> キオスクへ復帰
      kiosk_win="$(wmctrl -l | grep -E "$KIOSK_PATTERN" | head -n1 | awk '{print $1}')" || true
      [ -n "$kiosk_win" ] && wmctrl -i -a "$kiosk_win" || true
      raised=""
      echo "[raise] cast ended -> back to kiosk"
    fi
  fi
  sleep 1
done
