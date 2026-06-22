# 03. キャスト受信（AirPlay = UxPlay / Cast = shanocast）

ダッシュボードを全画面表示したまま、スマホ/PC から映像を投げたら前面に出るようにする。

> **🚀 自動化：依存導入とスクリプト配置は [`scripts/install.sh`](../scripts/install.sh) が実施。**
> 実ファイルは [`scripts/uxplay.sh`](../scripts/uxplay.sh)・
> [`scripts/shanocast.sh`](../scripts/shanocast.sh)・
> [`scripts/raise-on-cast.sh`](../scripts/raise-on-cast.sh)。
> 以下は仕組みの解説と、実機で `wmctrl -l` を見ながら行う**前面化の最終調整**手順。

| 方式 | ソフト | 投げ元 |
|------|--------|--------|
| AirPlay | UxPlay | iPhone / iPad / Mac（画面ミラー・動画） |
| Google Cast | shanocast | PC の Chrome（タブ/画面のキャスト） |

> スマホアプリ（YouTube 等）の純正 Cast ボタンは Google 認証ハード前提のため
> 安定受信できない。スマホからの動画は **AirPlay** か、YouTube なら
> `youtube.com/tv` の「テレビコードでリンク」で代替する。

---

## A. AirPlay 受信（UxPlay）

### 1. 依存パッケージ

```bash
sudo apt -y install \
  uxplay \
  avahi-daemon \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-libav gstreamer1.0-tools \
  gstreamer1.0-vaapi
# Intel のハード支援デコード用ドライバ
sudo apt -y install intel-media-va-driver-non-free vainfo
```

`avahi-daemon`（mDNS）が動いていないと iPhone から見つからない：

```bash
sudo systemctl enable --now avahi-daemon
vainfo   # VA-API が UHD 630 を認識しているか確認
```

> Ubuntu のリポジトリに `uxplay` が無い古いリリースでは
> [ソースからビルド](https://github.com/FDH2/UxPlay#building-uxplay-from-source)する。

### 2. 起動スクリプト `~/casting/uxplay.sh`

```bash
#!/usr/bin/env bash
# UHD 630: VA-API の vah264dec + glimagesink でハード支援デコード
exec uxplay -n "SmartMonitor" -nh \
  -vs glimagesink \
  -vd vah264dec
```

```bash
mkdir -p ~/casting
chmod +x ~/casting/uxplay.sh
```

ハード支援デコードで不安定な場合の切り分け：

```bash
uxplay -avdec        # ソフトデコードで動くか確認（動けば VA-API 側の問題）
```

---

## B. Google Cast 受信（shanocast）

shanocast は Openscreen ベースの Chromecast 受信機。**PC の Chrome の「キャスト」**
（タブ/デスクトップのミラーリング）を受けられる。Docker で動かすのが簡単。

公式: https://github.com/rgerganov/shanocast

### 1. 起動スクリプト `~/casting/shanocast.sh`

README の最新手順に従って Docker イメージ名・オプションを確認すること。
host ネットワーク + X11 ソケット共有が要点：

```bash
#!/usr/bin/env bash
exec docker run --rm \
  --network host \
  -e DISPLAY="$DISPLAY" \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  --device /dev/dri \
  ghcr.io/rgerganov/shanocast:latest
```

```bash
chmod +x ~/casting/shanocast.sh
```

> `--device /dev/dri` で UHD 630 のレンダリングノードを渡す。イメージ名/タグは
> リポジトリの最新 README で確認して置き換える。

---

## C. キャスト時にダッシュボードの前面へ出す

UxPlay（glimagesink）も shanocast も、受信開始時に独自ウィンドウを生成する。
これを検出して全画面・最前面にし、終了したら Chrome（ダッシュボード）に戻す。

`~/casting/raise-on-cast.sh`：

```bash
#!/usr/bin/env bash
# キャスト受信ウィンドウが現れたら全画面・最前面にする監視ループ
# 受信ウィンドウのタイトルは環境で異なるため wmctrl -l で確認して調整する
CAST_PATTERNS="UxPlay|shanocast|AirPlay"

while true; do
  win=$(wmctrl -l | grep -E "$CAST_PATTERNS" | head -n1 | awk '{print $1}')
  if [ -n "$win" ]; then
    wmctrl -i -a "$win"                                  # 最前面へ
    wmctrl -i -r "$win" -b add,fullscreen,above          # 全画面 + 常に手前
  fi
  sleep 1
done
```

```bash
chmod +x ~/casting/raise-on-cast.sh
```

`wmctrl -l` で実際の受信ウィンドウのタイトルを確認し、`CAST_PATTERNS` を調整する。

### Openbox autostart へ登録

`~/.config/openbox/autostart`（`docs/01` で作成）に追加：

```bash
~/casting/uxplay.sh &
~/casting/shanocast.sh &
~/casting/raise-on-cast.sh &
~/kiosk.sh &
```

---

## D. 動作確認

1. iPhone のコントロールセンター → 画面ミラーリング → 「SmartMonitor」を選択
   → モニターに iPhone 画面が全画面表示される。
2. PC の Chrome → 右上メニュー → 「キャスト」→ shanocast の受信先を選択
   → タブ/画面がモニターに表示される。
3. ミラーリングを停止すると受信ウィンドウが閉じ、ダッシュボードに戻る。

### トラブルシュート

| 症状 | 対処 |
|------|------|
| iPhone から SmartMonitor が見えない | `avahi-daemon` 稼働確認 / VM とスマホが同一 LAN か / Proxmox のブリッジ設定 |
| 映像がカクつく・出ない | `uxplay -avdec` でソフトデコードを試し、VA-API 側（`gstreamer1.0-vaapi`/ドライバ）を見直す |
| 受信ウィンドウが前面に来ない | `wmctrl -l` でタイトル確認し `CAST_PATTERNS` を修正 |
| shanocast が Chrome から見つからない | `--network host` か / 同一 LAN か / イメージ最新タグか確認 |
