#!/usr/bin/env bash
# SMARTMONITOR サイト更新ルーチン:
#   git pull → 静的アセット再配置 → データ更新 → version.txt 更新
# version.txt が変わるとダッシュボード(app.js)が検知して強制再読込する。
#
# 必須環境変数:
#   SMARTMONITOR_REPO  リポジトリのパス
#   SMARTMONITOR_WWW   配信ディレクトリ (index.html などがある www)
# 任意:
#   SMARTMONITOR_BRANCH (既定: claude/quirky-albattani-qe4lkd)
set -uo pipefail
export GIT_TERMINAL_PROMPT=0   # 認証待ちでハングさせない

REPO="${SMARTMONITOR_REPO:?SMARTMONITOR_REPO を指定してください}"
WWW="${SMARTMONITOR_WWW:?SMARTMONITOR_WWW を指定してください}"
BRANCH="${SMARTMONITOR_BRANCH:-claude/quirky-albattani-qe4lkd}"

echo "[update] git pull ($BRANCH) in $REPO"
git -C "$REPO" fetch origin "$BRANCH" 2>&1 || echo "[update] fetch failed (continuing)"
git -C "$REPO" pull --ff-only origin "$BRANCH" 2>&1 \
  || git -C "$REPO" pull origin "$BRANCH" 2>&1 \
  || echo "[update] pull failed (using current tree)"

echo "[update] deploy web assets -> $WWW"
mkdir -p "$WWW"
for f in index.html style.css app.js; do
  [ -f "$REPO/dashboard/$f" ] && install -m 0644 "$REPO/dashboard/$f" "$WWW/$f"
done
# config.json は利用者が編集するため上書きしない

# 天気/RSS データも更新 (config.json があるときのみ)
if [ -f "$REPO/serve/fetch_data.py" ] && [ -f "$WWW/config.json" ]; then
  SMARTMONITOR_WWW="$WWW" python3 "$REPO/serve/fetch_data.py" 2>&1 || echo "[update] fetch_data failed"
fi

# バージョン更新 → ブラウザが検知して強制リロード
date +%s > "$WWW/version.txt"
echo "[update] done. version=$(cat "$WWW/version.txt")"
