#!/usr/bin/env bash
# =============================================================================
# UxPlay を最新版（ソースビルド）に更新する。
#   UxPlay 1.45 以降は「ミラーリング停止」時に映像ウィンドウを自動で閉じる。
#   apt の古い版だと停止後もウィンドウ（最後のフレーム）が残るため、これで更新する。
#   uxplay.sh は -nc を付けないので、1.45+ なら停止で自動クローズになる。
#
#   使い方:  bash scripts/update-uxplay.sh
#   ※ ビルドには libplist 2.3 以上が必要（新しめの Ubuntu 推奨）。
#     古い Ubuntu で libplist が古くビルドに失敗する場合は、OS の更新が必要。
# =============================================================================
set -euo pipefail

echo "[uxplay] 現在の版: $(command -v uxplay >/dev/null 2>&1 && uxplay -v 2>&1 | head -1 || echo '未導入')"

echo "[uxplay] ビルド依存を導入..."
sudo apt-get update -y
sudo apt-get install -y \
  cmake build-essential git \
  libssl-dev libplist-dev libavahi-compat-libdnssd-dev \
  libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-libav gstreamer1.0-tools \
  gstreamer1.0-vaapi

# apt 版があると衝突するので退避
if dpkg -l uxplay 2>/dev/null | grep -q '^ii'; then
  echo "[uxplay] apt 版を削除..."
  sudo apt-get remove -y uxplay || true
fi

tmp="$(mktemp -d)"
echo "[uxplay] 最新ソースを取得してビルド..."
git clone --depth 1 https://github.com/FDH2/UxPlay "$tmp/UxPlay"
(
  cd "$tmp/UxPlay"
  cmake .
  make -j"$(nproc)"
  sudo make install
)
sudo ldconfig || true
rm -rf "$tmp"

echo "[uxplay] 完了: $(command -v uxplay) / $(uxplay -v 2>&1 | head -1)"
echo "[uxplay] iPhone で「ミラーリングを停止」するとウィンドウが自動で閉じます。"
echo "[uxplay] 反映するには受信を再起動: pkill -f uxplay  (autostart/サービスが再起動)"
