#!/usr/bin/env bash
# =============================================================================
# 軽量デスクトップ XFCE を導入する。
#   GNOME Shell がグレー画面で起動しない VM(GPUパススルー等)向けの確実な代替。
#   タスクバー(パネル)があり、3D合成に依存しないので VM で安定して動く。
#   表示マネージャは gdm3 のまま維持する（lightdm へ勝手に切替えない）。
#
#   使い方 (TTY でログインしてから):
#     bash scripts/install-xfce.sh
#   反映: ログイン画面の歯車 ⚙ で 「Xfce Session」 を選んでログイン
# =============================================================================
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
# 表示マネージャを gdm3 に固定（XFCE 導入時の lightdm への切替プロンプトを抑止）
echo "gdm3 shared/default-x-display-manager select gdm3" | sudo debconf-set-selections || true

echo "[xfce] パッケージ更新..."
sudo apt-get update -y
echo "[xfce] XFCE を導入中..."
sudo apt-get install -y xfce4 xfce4-goodies

echo
echo "== 完了 =="
echo "Ctrl+Alt+F1 でログイン画面 → 右下の歯車 ⚙ で 「Xfce Session」 を選択 → ログイン"
echo "タスクバー(パネル)付きの軽量デスクトップに入れます。"
