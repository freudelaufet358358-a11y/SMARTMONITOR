#!/usr/bin/env bash
# Google Cast 受信 (shanocast)。PC の Chrome の「キャスト」(タブ/画面) を受信する。
# 公式: https://github.com/rgerganov/shanocast
#   - 初回はリポジトリ取得 + Docker イメージのビルド (数分)
#   - 起動はネットワークIFを INTERFACE で指定 (既定はデフォルトルートのIFを自動検出)
#   - 送信側は PC の Chrome のみ対応 (スマホアプリの純正Castは非対応 → AirPlay で代替)
set -uo pipefail

SHANO_DIR="${SHANO_DIR:-$HOME/shanocast}"
export DISPLAY="${DISPLAY:-:0}"

# ネットワークインターフェースを自動検出 (デフォルトルートのIF)。INTERFACE で上書き可。
IFACE="${INTERFACE:-$(ip route show default 2>/dev/null | awk '{print $5; exit}')}"
IFACE="${IFACE:-eth0}"

# 取得
if [ ! -d "$SHANO_DIR/.git" ]; then
  echo "[shanocast] リポジトリ取得..."
  git clone https://github.com/rgerganov/shanocast.git "$SHANO_DIR"
fi

# 初回のみイメージをビルド
if [ ! -f "$SHANO_DIR/.built" ]; then
  echo "[shanocast] Docker イメージをビルド中 (初回のみ・数分かかります)..."
  ( cd "$SHANO_DIR" && ./docker/build-images.sh ) && touch "$SHANO_DIR/.built"
fi

# コンテナが X に描画できるよう許可
xhost +local: >/dev/null 2>&1 || true

echo "[shanocast] 起動: interface=$IFACE  (Chrome のキャストメニューに出ます)"
cd "$SHANO_DIR"
exec env INTERFACE="$IFACE" DISPLAY="$DISPLAY" ./docker/run-shanocast.sh
