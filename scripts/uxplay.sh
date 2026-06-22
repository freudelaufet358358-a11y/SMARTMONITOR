#!/usr/bin/env bash
# AirPlay 受信 (UxPlay)。autostart から呼ばれる。
#  - -vs glimagesink : Intel GPU 向け出力
#  - デコーダは UxPlay が自動選択 (VA-API があればハード支援を優先)
#  - ハード支援が不安定な場合は下の VD を vah264dec / 空 にして調整:
#      VD="-vd vah264dec"   # 明示的にハード支援
#      VD=""                # 自動
#      ソフトデコード確認は: uxplay -avdec
#  - ミラーリング停止時の窓クローズ: UxPlay 1.45+ は既定で閉じる(-nc を付けない)。
#    停止しても窓が残る場合は版が古い → scripts/update-uxplay.sh で更新する。
set -euo pipefail

NAME="${UXPLAY_NAME:-SmartMonitor}"
VD="${UXPLAY_VD:-}"

# DISPLAY が無い場合に備える (autostart 経由なら設定済み)
export DISPLAY="${DISPLAY:-:0}"

echo "[uxplay] starting AirPlay receiver as '$NAME'"
exec uxplay -n "$NAME" -nh -vs glimagesink $VD
