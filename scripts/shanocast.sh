#!/usr/bin/env bash
# Google Cast 受信 (shanocast / Docker)。Openbox autostart から呼ばれる。
# @SHANOCAST_IMAGE@ は install.sh がイメージ名に置換する。
# PC の Chrome の「キャスト」(タブ/画面ミラー) を受信する。
set -euo pipefail

IMAGE="${SHANOCAST_IMAGE:-@SHANOCAST_IMAGE@}"
export DISPLAY="${DISPLAY:-:0}"

# X11 ソケットへ書き込めるよう許可 (失敗しても続行)
xhost +local: >/dev/null 2>&1 || true

echo "[shanocast] starting Cast receiver (image: $IMAGE)"
exec docker run --rm \
  --name shanocast \
  --network host \
  -e DISPLAY="$DISPLAY" \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  --device /dev/dri \
  "$IMAGE"
