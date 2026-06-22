# 06. デスクトップ + キオスク（普通の GUI を土台にする・採用中）

「全画面ダッシュボードは見たいが、土台は**タスクバー/Dock のある普通の GNOME
デスクトップ**にして、いつでも抜けられるようにしたい」構成。
黒画面でロックされる Openbox 単独キオスクを置き換える。

## 仕組み

- 自動ログイン先を **GNOME(Xorg) セッション**に変更（通常の Ubuntu デスクトップ）
- ログイン時に GNOME スタートアップから自動起動:
  - ダッシュボード（Chrome `--start-fullscreen`、全画面だが脱出可）
  - AirPlay（UxPlay）/ Cast（shanocast）/ 受信ウィンドウ前面化
- GNOME の画面ブランク・ロック・自動サスペンドを無効化（モニター用途）

## 適用（押すだけ）

```bash
cd ~/smartmonitor          # クローン先に合わせる
git pull origin claude/quirky-albattani-qe4lkd
bash scripts/setup-desktop-kiosk.sh
sudo systemctl reboot
```

> ダッシュボードの配信（`:8080`）と取得タイマーは `setup-dashboard.sh` で導入済みの
> systemd サービスがそのまま使われる。本スクリプトは「土台を GNOME に戻し、自動起動を
> GNOME 側へ移す」だけ。

## 全画面からデスクトップへ抜ける

| 操作 | 結果 |
|------|------|
| **Super（Windows）キー** | GNOME の Activities / Dock（タスクバー）が出る |
| **F11** | 全画面を解除／再開 |
| ウィンドウを閉じる / Ctrl+W | `kiosk.sh` が自動で開き直す（黒画面で固まらない） |

通常のデスクトップ作業をしたいときは Super キーでアプリを切り替え、ダッシュボードに
戻りたいときは Chrome のウィンドウへ戻る（または F11）。

## 元の「Openbox 単独キオスク」に戻したい場合

`scripts/install.sh` が設定する Openbox セッションに戻すには、ログイン画面の歯車 ⚙ で
「Openbox」を選ぶか、`/var/lib/AccountsService/users/<user>` の `XSession` を `openbox`
に戻す。ただし Openbox にはタスクバーが無いため、本ドキュメントの GNOME 構成を推奨。

## トラブルシュート

| 症状 | 対処 |
|------|------|
| ログイン後すぐ全画面で操作しづらい | Super キーで Dock 表示、または F11。閉じれば 2 秒後に再表示 |
| Cast の前面化が効かない | セッションが Xorg か確認（`echo $XDG_SESSION_TYPE` が `x11`）。Wayland なら `ubuntu-xorg` を導入 |
| 自動起動が動かない | `~/.config/autostart/smartmonitor-*.desktop` の `Exec` パスと実行権限を確認 |
| そもそも画面が出ない | `Ctrl+Alt+F3` で TTY → `sudo systemctl restart gdm3` |
| **GUI デスクトップに全く戻れない** | `Ctrl+Alt+F3` で TTY ログイン → `bash scripts/recover-desktop.sh`。自動ログイン/強制セッション/キオスク自動起動を解除して通常のログイン画面に戻す。セッション一覧が空なら GNOME 未導入 → `sudo apt install -y ubuntu-desktop` |

## 復旧（recover-desktop.sh）

GNOME 構成にしてから GUI に入れなくなった場合の戻し方:

```bash
# Ctrl+Alt+F3 で TTY に入りログイン
cd ~/smartmonitor
git pull origin claude/quirky-albattani-qe4lkd
bash scripts/recover-desktop.sh
```

これで自動ログインと「強制セッション固定」を解除し、キオスク自動起動を一時無効化して
通常の GDM ログイン画面に戻す。利用可能なセッションと GNOME 導入状況も表示する。
ログイン画面の歯車 ⚙ でセッション（Ubuntu / Ubuntu on Xorg）を選んで入り直せる。
