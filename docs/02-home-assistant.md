# 02. Home Assistant（Docker）導入と統合設定

今の Ubuntu VM 内に **HA Container（Docker 版）** を入れる。
Ubuntu Desktop に Supervised を入れるのは不安定なので採用しない。

> **🚀 自動化：この章の手順 1〜2（Docker 導入・HA 起動）は
> [`scripts/install.sh`](../scripts/install.sh) が実施し、HA を起動済みにする。**
> compose は [`config/homeassistant/docker-compose.yml`](../config/homeassistant/docker-compose.yml)、
> RSS/電気代の反映例は [`config/homeassistant/configuration.example.yaml`](../config/homeassistant/configuration.example.yaml)
> （インストーラが `~/homeassistant/` 配下に併置する）。
> **手順 3 以降（HACS / 各統合の追加・configuration.yaml への反映）は GUI 操作のため手動。**
> 下記に沿って進める。

## 1. Docker 導入

```bash
sudo apt -y install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

## 2. compose ファイル

`~/homeassistant/docker-compose.yml`：

```yaml
services:
  homeassistant:
    container_name: homeassistant
    image: ghcr.io/home-assistant/home-assistant:stable
    restart: unless-stopped
    privileged: true
    network_mode: host          # デバイス検出のため host ネットワーク
    volumes:
      - ./config:/config
      - /etc/localtime:/etc/localtime:ro
      - /run/dbus:/run/dbus:ro
    environment:
      - TZ=Asia/Tokyo
```

起動：

```bash
cd ~/homeassistant
docker compose up -d
docker compose logs -f   # 起動ログ確認 (Ctrl+C で抜ける)
```

ブラウザで `http://localhost:8123` を開きオンボーディング（管理ユーザ作成）。
`network_mode: host` なのでポート 8123 で待ち受ける。

## 3. HACS 導入（カスタムカード / feedparser で使用）

```bash
docker exec -it homeassistant bash -c \
  "wget -O - https://get.hacs.xyz | bash -"
docker restart homeassistant
```

HA を再起動後、**設定 → デバイスとサービス → 統合を追加 → HACS** を追加し、
GitHub デバイス認証を完了する。

## 4. SwitchBot Cloud 統合（温湿度 / 電力 / エアコン）

Bluetooth 不要のクラウド API を使う。

### トークン取得

1. SwitchBot アプリ → プロフィール → 設定
2. 「アプリバージョン」を 10 回タップ → **開発者向けオプション**が出現
3. **token** と **secret** を控える

### HA 側

**設定 → デバイスとサービス → 統合を追加 → SwitchBot Cloud** を選び、token / secret を入力。

取得できる主なエンティティ（名前は登録名で変わる。**開発者ツール → 状態**で実名を確認）：

| デバイス | エンティティ例 | 用途 |
|----------|----------------|------|
| 温湿度計 | `sensor.<name>_temperature` / `_humidity` | 室温・湿度 |
| プラグミニ | `sensor.<name>_power`（W） | 消費電力（瞬時） |
| プラグミニ | `sensor.<name>_energy`（kWh） | 積算電力（電気代計算に使用） |
| Hub + エアコン | `climate.<name>` | エアコン温度設定・運転モード |

> 積算電力のエンティティ名・単位は機種により異なる。kWh の累積値が無い場合は
> 後述の `utility_meter` で power(W) から積算を作る。

## 5. 電気代の算出

### 方法A（推奨・かんたん）: エネルギーダッシュボード

**設定 → ダッシュボード → エネルギー** で「個別の機器」にプラグの kWh センサーを追加し、
料金（円/kWh）を設定すると、自動で電気代グラフが出る。

### 方法B: テンプレートセンサーで「今すぐ表示」

`config/configuration.yaml` に追記（単価は各自の契約に合わせる。例 31 円/kWh）：

```yaml
# kWh の積算が無い機種向け: power(W) → エネルギー積算を作る
utility_meter:
  plug_daily_energy:
    source: sensor.plug_energy        # kWh センサー。無ければ riemann で作る(下記)
    cycle: daily

template:
  - sensor:
      - name: "電気代（本日）"
        unit_of_measurement: "円"
        state: >
          {{ (states('sensor.plug_daily_energy') | float(0) * 31) | round(1) }}
```

kWh センサーが無く W（瞬時電力）しか無い場合は、まず積分センサーを作る：

```yaml
sensor:
  - platform: integration
    source: sensor.plug_power          # W
    name: plug_energy                  # → kWh を生成
    unit_prefix: k
    round: 3
    method: trapezoidal
```

## 6. カレンダー統合

用途に応じて選ぶ：

- **Google Calendar**（推奨）: 設定 → 統合を追加 → Google Calendar。OAuth 設定が必要
  （[公式手順](https://www.home-assistant.io/integrations/google/)）。スマホからも予定追加できて楽。
- **ローカルカレンダー**: 設定 → 統合を追加 → ローカルカレンダー。HA 内で完結。
- **CalDAV**: iCloud / Nextcloud 等と同期したい場合。

> **大学の時間割（UNIPA）はここには来ない。** UNIPA は ICS 出力が無いため、
> 時間割は `docs/04` の手動カードで作る。どうしてもカレンダーに載せたい場合は、
> Google カレンダーに「繰り返し予定」として手動登録する運用になる。

## 7. RSS ニュース（feedparser）

表示用にはイベントベースの内蔵 `feedreader` ではなく、**HACS の `feedparser`**
（フィード項目をセンサー属性として持つ）が向く。

HACS → 統合 → 「feedparser」を検索してインストール →  HA 再起動 →
`configuration.yaml` に追記：

```yaml
sensor:
  - platform: feedparser
    name: "NHK 主要ニュース"
    feed_url: "https://www.nhk.or.jp/rss/news/cat0.xml"
    date_format: "%m/%d %H:%M"
    show_topn: 8
    inclusions:
      - title
      - link
      - published
```

表示は `docs/04` の Markdown カードで行う。

## 8. 反映

`configuration.yaml` を編集したら **開発者ツール → YAML → 設定の再読み込み**
（構成の変更によっては HA 再起動 `docker restart homeassistant`）。
