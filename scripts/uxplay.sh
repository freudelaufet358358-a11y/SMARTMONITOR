#!/usr/bin/env bash
# AirPlay 受信 (UxPlay)。Openbox autostart から呼ばれる。
#  - -vs glimagesink : Intel GPU 向け出力
#  - デコーダは UxPlay が自動選択 (VA-API があればハード支援を優先)
#  - ハード支援が不安定な場合は下の VD を vah264dec / 空 にして調整:
#      VD="-vd vah264dec"   # 明示的にハード支援
#      VD=""                # 自動
#      ソフトデコード確認は: uxplay -avdec
set -euo pipefail

NAME="${UXPLAY_NAME:-SmartMonitor}"
VD="${UXPLAY_VD:-}"

# DISPLAY が無い場合に備える (autostart 経由なら設定済み)
export DISPLAY="${DISPLAY:-:0}"

echo "[uxplay] starting AirPlay receiver as '$NAME'"
exec uxplay -n "$NAME" -nh -vs glimagesink $VD
