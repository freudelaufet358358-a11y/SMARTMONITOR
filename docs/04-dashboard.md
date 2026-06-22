# 04. Lovelace ダッシュボード（時計 / 時間割 / SwitchBot / RSS）

スマートモニターに表示するダッシュボードを作る。`docs/02` で各統合が入っている前提。

> **📋 雛形あり：完成形に近い YAML は [`config/lovelace/dashboard.yaml`](../config/lovelace/dashboard.yaml)、
> 時間割の HTML は [`config/lovelace/timetable.md`](../config/lovelace/timetable.md)。**
> インストーラ実行時は `~/homeassistant/lovelace-samples/` にも併置される。
> 「生の構成エディタ」に貼り付けてから entity 名を実環境に合わせるのが最短。
> ダッシュボード作成は GUI 操作のため手動（`install.sh` の対象外）。

## 0. カスタムカードの導入（HACS）

時計や見やすいカレンダーには HACS のカードを使う。HACS → フロントエンド で検索して
インストール：

- `clock-weather-card` … 時計 + 天気
- `atomic-calendar-revive` … 見やすいカレンダー/予定リスト
- （任意）`card-mod` … 細かい見た目調整

インストール後、ダッシュボード編集 → 右上 … → 「リソース」に登録されているか確認。

## 1. ダッシュボードを「YAML モード」にすると編集が楽

設定 → ダッシュボード → 新規ダッシュボード（例: `SmartMonitor`）→ 編集 → … →
**「生の構成エディタ」** で以下を貼り付けて調整していく。

横長 HDMI 想定で 2〜3 カラムのグリッドに配置する例（抜粋）：

```yaml
title: SmartMonitor
views:
  - title: Home
    type: sections
    sections:
      # ── 時計 ──────────────────────────────
      - type: grid
        cards:
          - type: custom:clock-weather-card
            entity: weather.home          # 天気エンティティ（無ければ time/date センサーで代替）
            locale: ja
            time_format: 24
            date_pattern: "yyyy年M月d日 (EEE)"

      # ── カレンダー ────────────────────────
      - type: grid
        cards:
          - type: custom:atomic-calendar-revive
            name: 予定
            entities:
              - calendar.your_google_calendar   # docs/02 で追加したカレンダー
            maxDaysToShow: 7
            showLocation: false

      # ── 大学の時間割（手動・下記 §2）──────
      - type: grid
        cards:
          - type: markdown
            title: 時間割
            content: !include timetable.md     # ↓ §2 参照（または直接埋め込み）

      # ── SwitchBot（室温/湿度/エアコン/電力）─
      - type: grid
        cards:
          - type: entities
            title: 室内環境
            entities:
              - entity: sensor.living_temperature
                name: 室温
              - entity: sensor.living_humidity
                name: 湿度
          - type: thermostat
            entity: climate.living_aircon       # エアコン温度設定
          - type: gauge
            entity: sensor.plug_power
            name: 消費電力
            unit: W
            min: 0
            max: 1500
          - type: entity
            entity: sensor.電気代_本日
            name: 本日の電気代

      # ── ニュース（RSS）───────────────────
      - type: grid
        cards:
          - type: markdown
            title: ニュース
            content: >
              {% for item in state_attr('sensor.nhk_主要ニュース', 'entries') %}
              - [{{ item.title }}]({{ item.link }})
              {% endfor %}
```

> `entity` 名（`sensor.living_temperature` など）は **開発者ツール → 状態** で
> 実名を確認して置き換える。`!include` を使わず markdown カードの `content` に
> 直接書いてもよい。

## 2. 大学の時間割（UNIPA は手動）

UNIPA は ICS/iCal 出力が無いため、**週間割を手動で 1 度だけ書く**のが現実的
（毎週固定なら運用は楽）。Markdown カードに HTML テーブルで書く例：

```yaml
- type: markdown
  title: 時間割
  content: |
    <table style="width:100%; text-align:center; border-collapse:collapse;">
      <tr><th></th><th>月</th><th>火</th><th>水</th><th>木</th><th>金</th></tr>
      <tr><td>1</td><td>線形代数</td><td></td><td>英語</td><td>物理</td><td></td></tr>
      <tr><td>2</td><td>プログラミング</td><td>微積分</td><td></td><td>物理演習</td><td>体育</td></tr>
      <tr><td>3</td><td></td><td>情報倫理</td><td>実験</td><td></td><td>ゼミ</td></tr>
      <tr><td>4</td><td>第二外国語</td><td></td><td>実験</td><td>統計</td><td></td></tr>
      <tr><td>5</td><td></td><td></td><td></td><td></td><td></td></tr>
    </table>
```

> 授業名は自分の履修に合わせて編集する。曜日の強調（今日の列を色付け）まで
> やりたい場合は `card-mod` + テンプレートで実現可能だが、まずは固定表で十分。

### （任意）「次の授業」を表示したい場合

時間割をカレンダー化したいなら、Google カレンダーに繰り返し予定として登録し、
`atomic-calendar-revive` や標準カレンダーカードで「次の予定」を出すのが楽。
UNIPA から自動取得はできない点に注意。

## 3. キオスク表示の最終確認

1. `http://localhost:8123/<ダッシュボード名>` を `docs/01` の `kiosk.sh` の
   `--app=` URL に設定する（ログイン後に直接そのビューが開くように）。
2. HA のユーザを「自動ログイン」状態に保つため、長期間有効なセッションにするか、
   キオスク用ユーザの「このデバイスを信頼する」を有効化する。
3. 再起動して、電源ON → 自動ログイン → ダッシュボード全画面、を確認。

## 仕上げのアイデア（任意）

- 画面の焼き付き対策：深夜は時計のみのシンプルビューに自動切替（HA の自動化 +
  ブラウザ URL 切替、または HA の screensaver 系カード）。
- 表示テーマを暗め（`dark` テーマ）にして夜間のまぶしさを抑える。
- タッチ操作するなら HDMI モニターをタッチ対応にして操作性を上げる。
