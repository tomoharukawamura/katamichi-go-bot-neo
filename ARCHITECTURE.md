# katamichi-go-bot-neo アーキテクチャ

トヨタレンタカーの「片道GO」サイトを定期的にスクレイピングし、車両の空き状況の変化を Slack に通知するシステム。

---

## システム全体像

```mermaid
graph TB
    subgraph External["外部サービス"]
        TOYOTA["トヨタ片道GOサイト<br/>cp.toyota.jp/rentacar"]
        SLACK["Slack"]
    end

    subgraph AWS["AWS"]
        subgraph Scheduling["EventBridge Scheduler"]
            EB1["6:50 JST トリガー"]
            EB2["7:00-22:00 JST トリガー"]
        end

        subgraph Compute["コンピューティング"]
            LAMBDA["Lambda<br/>init-db"]
            FARGATE["ECS Fargate<br/>get-cars"]
        end

        subgraph Storage["データストア"]
            DYNAMO[("DynamoDB<br/>Cars テーブル")]
            SECRETS["Secrets Manager<br/>Slack認証情報"]
        end

        subgraph Monitoring["監視"]
            SNS["SNS<br/>エラー通知"]
            CW["CloudWatch Logs"]
        end
    end

    EB1 -->|起動| LAMBDA
    EB2 -->|起動と停止| FARGATE

    LAMBDA -->|初期データ投入| DYNAMO
    LAMBDA -->|スクレイピング| TOYOTA

    FARGATE -->|5秒間隔で<br/>スクレイピング| TOYOTA
    FARGATE -->|読み書き| DYNAMO
    FARGATE -->|通知送信| SLACK
    FARGATE -->|認証情報取得| SECRETS
    FARGATE -->|エラー通知| SNS
    FARGATE -->|ログ出力| CW

    LAMBDA -->|エラー通知| SNS

    style External fill:#e8f5e9,stroke:#388e3c
    style AWS fill:#e3f2fd,stroke:#1565c0
    style Scheduling fill:#fff3e0,stroke:#ef6c00
    style Compute fill:#fce4ec,stroke:#c62828
    style Storage fill:#f3e5f5,stroke:#7b1fa2
    style Monitoring fill:#fff9c4,stroke:#f9a825
```

---

## 1日の処理フロー

```mermaid
sequenceDiagram
    participant EB as EventBridge
    participant INIT as init-db Lambda
    participant DDB as DynamoDB
    participant GET as get-cars Fargate
    participant TOYOTA as トヨタサイト
    participant SLACK as Slack

    Note over EB: 毎日 6:50 JST
    EB->>INIT: Lambda 起動
    INIT->>TOYOTA: HTML スクレイピング
    TOYOTA-->>INIT: 車両データ
    INIT->>DDB: テーブル初期化とデータ投入
    INIT-->>EB: 完了

    Note over EB: 毎日 7:00 JST
    EB->>GET: Fargate タスク起動

    loop 5秒間隔 7:00-22:00
        GET->>DDB: 既存レコード取得
        GET->>TOYOTA: HTML スクレイピング
        TOYOTA-->>GET: 車両データ

        alt 新規車両
            GET->>SLACK: 新着メッセージ投稿
            GET->>DDB: レコード追加
        else 情報更新
            GET->>SLACK: スレッド返信
            GET->>DDB: レコード更新
        else 売り切れ
            GET->>SLACK: sold outリアクション追加
            GET->>DDB: ステータス更新
        else 復活
            GET->>SLACK: スレッド返信とリアクション削除
            GET->>DDB: ステータス更新
        end
    end

    Note over EB: 毎日 22:00 JST
    EB->>GET: Fargate タスク停止
```

---

## 変更検知ロジック

```mermaid
graph TD
    START["スクレイピング実行"] --> PARSE["HTML パース<br/>cheerio"]
    PARSE --> COMPARE{"DynamoDB の<br/>既存レコードと比較"}

    COMPARE -->|DBに存在しない| NEW["new<br/>新規車両"]
    COMPARE -->|DBに存在する| CHECK_STATUS{"ステータス確認"}

    CHECK_STATUS -->|available かつ データ変更あり| UPDATED["updated<br/>情報更新"]
    CHECK_STATUS -->|available かつ サイトから消えた| SOLDOUT["soldOut<br/>売り切れ"]
    CHECK_STATUS -->|unavailable かつ サイトに復活| RECOVERED["recovered<br/>復活"]
    CHECK_STATUS -->|変更なし| SKIP["スキップ"]

    NEW --> SLACK_NEW["Slack: チャンネルに新規投稿"]
    UPDATED --> SLACK_THREAD["Slack: 元メッセージにスレッド返信"]
    SOLDOUT --> SLACK_REACT["Slack: 元メッセージにリアクション"]
    RECOVERED --> SLACK_RECOVER["Slack: リアクション削除とスレッド返信"]

    SLACK_NEW --> SAVE["DynamoDB に保存"]
    SLACK_THREAD --> SAVE
    SLACK_REACT --> SAVE
    SLACK_RECOVER --> SAVE

    style NEW fill:#c8e6c9,stroke:#2e7d32
    style UPDATED fill:#bbdefb,stroke:#1565c0
    style SOLDOUT fill:#ffcdd2,stroke:#c62828
    style RECOVERED fill:#fff9c4,stroke:#f9a825
    style SKIP fill:#e0e0e0,stroke:#616161
```

---

## Slack チャンネルルーティング

```mermaid
graph LR
    CAR["車両データ<br/>startArea + returnArea"] --> ROUTE{"エリアペアで<br/>チャンネル振り分け"}

    ROUTE --> CH1["#channel-A<br/>例: 東京-大阪"]
    ROUTE --> CH2["#channel-B<br/>例: 大阪-東京"]
    ROUTE --> CH3["#channel-C<br/>例: 名古屋-福岡"]

    CH1 --> MSG["Slack メッセージ"]
    CH2 --> MSG
    CH3 --> MSG

    MSG -->|新規| POST["チャンネルに投稿<br/>tsをDynamoDBに保存"]
    MSG -->|更新/復活| THREAD["元メッセージに<br/>スレッド返信"]
    MSG -->|売り切れ| REACT["元メッセージに<br/>リアクション追加"]
```

---

## ソースコード構成

```mermaid
graph LR
    subgraph src["src/ エントリーポイント"]
        GET_CARS["get-cars/<br/>fargate.ts<br/>ポーリングループ"]
        INIT_DB["init-db/<br/>index.ts<br/>DB初期化Lambda"]
    end

    subgraph tools["tools/ 共通モジュール"]
        CAR_MGR["car-data/<br/>car-manager.ts<br/>スクレイピングと差分検知"]
        SLACK_BOT["slack/<br/>slack-bot-app.ts<br/>Slackクライアント初期化"]
        POST_MSG["slack/<br/>post-carmessage.ts<br/>メッセージ投稿"]
        ATTACH["slack/<br/>create-attachments.ts<br/>リッチメッセージ生成"]
        CAR_REPO["aws-sdk/<br/>car-repository.ts<br/>DynamoDB操作"]
        SNS_REPO["aws-sdk/<br/>sns-repository.ts<br/>SNS通知"]
        ERR["error-handler.ts<br/>エラーハンドリング"]
    end

    subgraph json["json/ 設定ファイル"]
        CARS_JSON["cars/<br/>車種マスタ"]
        DECO_JSON["decorators/<br/>アイコンとカラー"]
        SHOP_JSON["shops/<br/>店舗とエリア"]
        SLACK_JSON["slack-config/<br/>チャンネル設定"]
    end

    GET_CARS --> CAR_MGR
    GET_CARS --> POST_MSG
    GET_CARS --> CAR_REPO
    GET_CARS --> ERR

    INIT_DB --> CAR_MGR
    INIT_DB --> CAR_REPO

    POST_MSG --> SLACK_BOT
    POST_MSG --> ATTACH
    ATTACH --> CARS_JSON
    ATTACH --> DECO_JSON
    ATTACH --> SHOP_JSON
    POST_MSG --> SLACK_JSON

    ERR --> SNS_REPO

    style src fill:#e8eaf6,stroke:#283593
    style tools fill:#e0f2f1,stroke:#00695c
    style json fill:#fff8e1,stroke:#ff8f00
```

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| 言語 | TypeScript (ESM) |
| ランタイム | Node.js |
| ビルド | esbuild |
| テスト | vitest |
| リンター | Biome |
| スクレイピング | cheerio |
| Slack連携 | @slack/bolt |
| AWS SDK | @aws-sdk v3 (DynamoDB, SNS) |
| コンテナ | Docker (Fargate + Lambda) |
| IaC | Terraform |
| CI/CD | GitHub Actions (OIDC認証) |
