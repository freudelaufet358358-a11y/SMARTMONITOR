# 01. Ubuntu VM のキオスク化（自動ログイン + 全画面表示）

GPU パススルーで HDMI 出力済みの Ubuntu Desktop VM を、電源を入れたら自動で
ダッシュボードが全画面表示される「キオスク端末」にする。

> 前提：ウィンドウの前面化（キャスト受信時）に `wmctrl`/`xdotool` を使うため、
> **X11 セッションを使う**（Wayland は無効化する）。

> **🚀 自動化：この章の手順 1〜8 は [`scripts/install.sh`](../scripts/install.sh) が一括実行する。**
> 配置される実ファイルは [`scripts/kiosk.sh`](../scripts/kiosk.sh)・
> [`config/openbox/autostart`](../config/openbox/autostart)。
> 以下は「何を・なぜ」やっているかの解説。手動でやる場合のみ順に実施すればよい。

## 0. パッケージ更新

```bash
sudo apt update && sudo apt -y upgrade
```

## 1. キオスク用ユーザを作る（任意だが推奨）

```bash
sudo adduser --gecos "" kiosk
sudo usermod -aG audio,video,plugdev kiosk
```

普段使いのユーザと分けておくと、自動ログイン・自動起動の管理が楽。

## 2. 自動ログイン + X11 強制（GDM3 の場合）

`/etc/gdm3/custom.conf` を編集：

```ini
[daemon]
# Wayland を無効化して Xorg(X11) を使う
WaylandEnable=false

AutomaticLoginEnable=true
AutomaticLogin=kiosk
```

> LightDM を使っている場合は `/etc/lightdm/lightdm.conf` に
> `autologin-user=kiosk` / `autologin-session=openbox` を設定する。

## 3. 軽量ウィンドウマネージャ（Openbox）とツール導入

GNOME のままでも可能だが、キャスト受信ウィンドウの重ね合わせ制御が楽なので
Openbox セッションを用意する。

```bash
sudo apt -y install openbox xterm wmctrl xdotool x11-xserver-utils unclutter
```

- `wmctrl` / `xdotool` … ウィンドウの前面化・全画面化に使用（`docs/03`）
- `x11-xserver-utils` … `xset`（画面ブランク無効化）
- `unclutter` … マウスカーソルを自動的に隠す

## 4. Chromium 導入

Ubuntu 標準の `chromium-browser` は snap 版で `--kiosk` 周りが扱いにくいことがある。
**deb 版（Google Chrome）または flatpak 版 Chromium** を推奨。

```bash
# 例: Google Chrome (deb)
wget -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt -y install /tmp/chrome.deb
```

以降の手順は `google-chrome` 前提。snap/flatpak の Chromium を使う場合はコマンド名を読み替える。

## 5. キオスク起動スクリプト

`/home/kiosk/kiosk.sh` を作成：

```bash
#!/usr/bin/env bash
# 画面ブランク・省電力・スクリーンセーバを無効化
xset s off
xset s noblank
xset -dpms

# マウスカーソルを隠す
unclutter -idle 1 &

# Home Assistant が立ち上がるまで待つ（Docker起動直後対策）
until curl -sf http://localhost:8123/manifest.json >/dev/null; do
  sleep 2
done

# Chrome をキオスクモードで起動（クラッシュ復元ダイアログを抑制）
exec google-chrome \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --app=http://localhost:8123
```

```bash
sudo chmod +x /home/kiosk/kiosk.sh
sudo chown kiosk:kiosk /home/kiosk/kiosk.sh
```

## 6. Openbox autostart に登録

`/home/kiosk/.config/openbox/autostart` を作成：

```bash
# キャスト受信（詳細は docs/03）
~/casting/uxplay.sh &
~/casting/shanocast.sh &

# キオスク（ダッシュボード）
~/kiosk.sh &
```

```bash
sudo mkdir -p /home/kiosk/.config/openbox
sudo chown -R kiosk:kiosk /home/kiosk/.config
```

> まだ `docs/03` のキャストを導入していない段階では、上の `uxplay.sh` /
> `shanocast.sh` の 2 行はコメントアウトしておく。

## 7. ログイン時に Openbox セッションを選ぶ

GDM のログイン画面（自動ログイン前に一度手動ログインして）右下の歯車から
**「Openbox」セッション**を選んでおくと、以後の自動ログインでも Openbox が起動する。

## 8. 動作確認

```bash
sudo systemctl reboot
```

再起動後、自動ログイン → Openbox → Chrome キオスクで HA のログイン/オンボーディング
画面（`docs/02` 実施後はダッシュボード）が全画面表示されれば成功。

### トラブルシュート

| 症状 | 対処 |
|------|------|
| 画面が一定時間で暗くなる | `kiosk.sh` の `xset` 行が効いているか確認。GNOME の場合は別途電源設定も無効化 |
| Wayland のままで wmctrl が効かない | `echo $XDG_SESSION_TYPE` が `x11` か確認。`custom.conf` の `WaylandEnable=false` と Openbox セッション選択を再確認 |
| Chrome が「正常に終了しませんでした」を出す | 起動フラグ `--disable-session-crashed-bubble` を確認。`~/.config/google-chrome/Default/Preferences` の `exit_type` を `Normal` に直す |
| **画面が真っ黒で操作不能 / キオスクが消えた** | `Ctrl+Alt+F3` で仮想コンソール(TTY)へ。ログイン後 `sudo systemctl restart gdm3` でキオスク復帰。GUI に戻るのは `Ctrl+Alt+F1`(または F7) |
| **通常の Ubuntu(GNOME) で入りたい** | TTY で `sudo sed -i 's/^AutomaticLoginEnable=true/AutomaticLoginEnable=false/' /etc/gdm3/custom.conf` と `sudo rm -f /var/lib/AccountsService/users/$USER` → `sudo systemctl restart gdm3` → GDM の歯車⚙で「Ubuntu on Xorg」を選択 |

### キオスクの堅牢化（Ctrl+W 対策）

`scripts/kiosk.sh` は **Chrome が閉じても自動で再起動するループ**になっている。
さらに `config/openbox/rc.xml` で **Ctrl+W / Ctrl+Q / Alt+F4 を無効化**し、
**Ctrl+Alt+T でターミナル**、**右クリックで救出メニュー**（ターミナル/再起動/ログアウト）
を出せるようにしている。これらは `install.sh` または `setup-dashboard.sh` で配置される。
適用後は誤操作でキオスクが閉じても自動復帰し、真っ黒のまま操作不能になることはない。
