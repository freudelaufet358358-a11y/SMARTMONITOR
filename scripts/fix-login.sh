#!/usr/bin/env bash
# =============================================================================
# ログイン後に「グレー画面で固まる」ときの修復
#   1) ホームの所有者を本人に戻す（root 所有ファイルがあるとセッションが即破綻する）
#   2) GNOME のユーザ状態（キャッシュ / dconf）を退避して次回ログインで再生成させる
#
#   使い方 (TTY: Ctrl+Alt+F3 で本人ログインしてから / sudo は付けない):
#     bash scripts/fix-login.sh
# =============================================================================
set -uo pipefail

U="${SUDO_USER:-$(id -un)}"
H="$(getent passwd "$U" | cut -d: -f6)"
TS="$(date +%s)"

echo "== ログイン修復 (ユーザ: $U / ホーム: $H) =="

echo "[1] ホーム配下の所有者を $U に修正（root 所有ファイル対策）..."
sudo chown -R "$U:$U" "$H"

echo "[2] GNOME キャッシュ / dconf を退避（次回ログインで再生成）..."
[ -d "$H/.cache" ]        && mv "$H/.cache"        "$H/.cache.bak.$TS"        && echo "   .cache を退避"
[ -d "$H/.config/dconf" ] && mv "$H/.config/dconf" "$H/.config/dconf.bak.$TS" && echo "   .config/dconf を退避"

echo "[3] GDM を再起動..."
sudo systemctl restart gdm3 2>/dev/null || sudo systemctl restart gdm 2>/dev/null || true

cat <<EOF

== 完了 ==
Ctrl+Alt+F1 でログイン画面へ → ユーザを選び、右下の歯車 ⚙ で:
   まず 「Ubuntu on Xorg」 を試す
   だめなら 「Ubuntu」(Wayland) を試す

それでもグレー画面のままなら（このVMで GNOME Shell が描画できていない可能性）:
   bash scripts/install-xfce.sh   ← 軽量で確実なデスクトップ(XFCE/タスクバーあり)を導入
EOF
