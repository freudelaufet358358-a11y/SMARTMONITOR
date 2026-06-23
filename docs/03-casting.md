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
  -fs \
  -vs glimagesink \
  -vd vah264dec
```

> `-fs` で全画面表示。iPhone を横向きにした映像は横画面いっぱいに広がり、
> 縦向きはアスペクト比を保って左右黒帯になる。窓表示にしたい場合は `-fs` を外す。

```bash
mkdir -p ~/casting
chmod +x ~/casting/uxplay.sh
```

### ミラーリング停止時にウィンドウを消す

UxPlay **1.45 以降は「ミラーリングを停止」すると映像ウィンドウを自動で閉じる**
（`uxplay.sh` は `-nc` を付けないので既定で閉じる）。停止後もウィンドウ（最後のフレーム）が
残る場合は、**apt の UxPlay が 1.45 より古い**。最新版に更新する:

```bash
bash scripts/update-uxplay.sh     # ソースから 1.45+ をビルド導入
pkill -f uxplay                   # 受信を再起動して反映 (autostart/サービスが再起動)
```

> ビルドには libplist 2.3 以上が必要。古い Ubuntu でビルドに失敗する場合は OS 更新が必要。

ハード支援デコードで不安定な場合の切り分け：

```bash
uxplay -avdec        # ソフトデコードで動くか確認（動けば VA-API 側の問題）
```

---

## B. Google Cast 受信（shanocast）

shanocast は Openscreen ベースの Chromecast 受信機。**PC の Chrome の「キャスト」**
（タブ/デスクトップのミラーリング）を受けられる。**スマホアプリの純正 Cast ボタンは
非対応**（iPhone は AirPlay、YouTube は `youtube.com/tv` の TV コードで代替）。

公式: https://github.com/rgerganov/shanocast
（公式の配布 Docker イメージは無く、リポジトリを取得して自分でイメージをビルドする方式）

### 1. 一度だけ：取得とビルド

```bash
sudo apt install -y git docker.io      # docker 未導入なら
git clone https://github.com/rgerganov/shanocast.git ~/shanocast
cd ~/shanocast
./docker/build-images.sh               # イメージをビルド（数分）
```

### 2. 受信を起動（ネットワークIFを指定）

```bash
# デフォルトルートのインターフェース名を確認 (例: ens18 / enp0s3 / eth0)
ip route show default

# そのIF名を INTERFACE に渡して起動 (X セッション内で実行すること)
cd ~/shanocast
INTERFACE=ens18 ./docker/run-shanocast.sh
```

> `run-shanocast.sh` は `--network host --privileged` で動き、`INTERFACE` 環境変数で
> NIC を指定できる（未指定だと対話プロンプト）。X11/PulseAudio/`/dev/dri` を共有する。

リポジトリ同梱の `scripts/shanocast.sh` は上記（取得・ビルド・IF自動検出・起動）を
まとめて行うラッパー：

```bash
~/casting/shanocast.sh          # 初回はビルド、以降は起動
# IF を明示するなら:  INTERFACE=ens18 ~/casting/shanocast.sh
```

### 3. 送信（PC の Chrome から）

1. 受信側と**同じ LAN** の PC で Chrome を開く
2. 右上メニュー ⋮ →「キャスト…」→ 一覧に出る受信先（shanocast）を選ぶ
3. 「ソース」で **タブをキャスト** または **画面をキャスト** を選択

> 一覧に出ないとき：受信が起動中か / 同一 LAN か / `INTERFACE` が正しい NIC か /
> docker をsudoなしで実行できるか（`sudo usermod -aG docker $USER` 後に再ログイン）を確認。

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
