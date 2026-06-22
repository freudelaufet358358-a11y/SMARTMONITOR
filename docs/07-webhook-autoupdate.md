# 07. Webhook 自動更新 + 強制リロード

リポジトリを更新したら、表示中のダッシュボードを**自動で最新化＆強制再読み込み**する。

## 仕組み

```
[git push]
   │  (Webhook or 定期pull)
   ▼
POST /update  ──►  update.sh : git pull → アセット再配置 → version.txt 更新
                                                   │
ダッシュボード(app.js) が version.txt を7秒毎に監視 ─┘
   └─► 値が変わったら location.reload() で強制リロード
```

- **update.sh** … `git pull` → `index.html/style.css/app.js` を www へ再配置 →
  `fetch_data.py`（天気/RSS）→ `version.txt` を更新。`config.json` は上書きしない。
- **update_server.py** … `POST/GET /update` を受けて update.sh を実行する小さな HTTP サーバ。
- **app.js** … `version.txt` を監視し、変化を検知したら自動リロード。

## セットアップ

```bash
cd ~/smartmonitor          # クローン先
git pull origin claude/quirky-albattani-qe4lkd

# ローカル専用 (127.0.0.1 のみ・認証なし)
bash scripts/setup-webhook.sh

# LAN/外部にも公開する場合 (推奨: 認証用シークレットを付ける)
SMARTMONITOR_HOOK_SECRET='任意の長い文字列' bash scripts/setup-webhook.sh

# GitHub から届かせるのが難しい家庭内環境向け: 5分毎の自動pullも有効化
AUTOPULL=yes bash scripts/setup-webhook.sh
```

## 使い方（トリガー）

```bash
# ローカルで手動トリガー
curl -X POST http://localhost:8765/update

# LAN の別端末から (シークレット設定時)
curl -X POST "http://<このVMのIP>:8765/update?token=<secret>"
```

数秒以内に画面のダッシュボードが自動でリロードされる。

### GitHub Webhook として使う（公開到達性が必要）

リポジトリ **Settings → Webhooks → Add webhook**:

| 項目 | 値 |
|------|----|
| Payload URL | `http://<公開アドレス>:8765/update` |
| Content type | `application/json` |
| Secret | `setup-webhook.sh` で設定した `SMARTMONITOR_HOOK_SECRET` |
| Events | Just the push event |

> 家庭内の VM は GitHub から直接到達できないのが普通。その場合は
> **ポート開放**するか、**cloudflared / ngrok** などのトンネルで公開する。
> 面倒なら `AUTOPULL=yes` の定期pull（上記）が確実で簡単。

## 認証の既定（安全側）

- `SMARTMONITOR_HOOK_SECRET` 未設定 → **127.0.0.1 のみ**待受・認証なし。
- 設定済み → `0.0.0.0` 待受。`X-Hub-Signature-256`（GitHub HMAC）/ `X-Hook-Token` /
  `?token=` のいずれかが一致しないと 403。シークレットは `hook.env`(600) に保存。

## 運用 / トラブルシュート

| 操作 | コマンド |
|------|----------|
| サーバ状態 | `systemctl status smartmonitor-update.service` |
| 手動更新 | `curl -X POST http://localhost:8765/update` |
| 直接実行 | `SMARTMONITOR_REPO=~/smartmonitor SMARTMONITOR_WWW=~/smartmonitor-dashboard/www bash ~/smartmonitor-dashboard/update.sh` |
| 自動pull状態 | `systemctl status smartmonitor-autopull.timer` |

| 症状 | 対処 |
|------|------|
| リロードされない | `version.txt` が更新されているか (`curl localhost:8080/version.txt`)。古い app.js のままなら一度手動リロード/再起動で新 app.js を読ませる |
| pull が進まない | private リポジトリの認証切れ。`git -C ~/smartmonitor pull` を手動で確認 |
| 403 が返る | シークレット不一致。`?token=` かヘッダ、GitHub は Secret 設定を確認 |
