# katamichi-go-bot-neo

トヨタレンタカー「片道GO」の空き状況を監視し、変化を Slack に通知するボット。

アーキテクチャの詳細は [ARCHITECTURE.md](ARCHITECTURE.md) を参照。

---

## 前提条件

- **Node.js** v22 以上
- **Docker** および **Docker Compose**
- **Slack App** (Bot Token + Signing Secret)

---

## 環境構築

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd katamichi-go-bot-neo
```

### 2. 依存パッケージのインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、Slack の認証情報を設定する。

```bash
cp .env.example .env
```

`.env` の内容:

```
SLACK_SIGNING_SECRET=<Slack App の Signing Secret>
SLACK_BOT_TOKEN=xoxb-<Slack Bot Token>
```

Slack App に必要な権限:
- `chat:write` (メッセージ投稿)
- `reactions:write` (リアクション追加)
- `reactions:read` (リアクション削除)

---

## ローカルでの実行

### Docker Compose で全体を起動

DynamoDB Local + アプリケーションをまとめて起動する。

```bash
docker compose up --build
```

起動されるサービス:

| サービス | 説明 | ポート |
|---------|------|--------|
| `dynamodb-local` | DynamoDB Local | 8000 |
| `dynamodb-setup` | Cars テーブル自動作成 | - |
| `get-car-function` | 5秒間隔のポーリング (Fargate相当) | - |
| `init-db-function` | DB初期化 (Lambda相当) | 9001 |

### init-db を手動実行

Lambda コンテナを起動した状態で、以下のコマンドでDB初期化を実行できる。

```bash
curl -X POST "http://localhost:9001/2015-03-31/functions/function/invocations" \
  -d '{}'
```

### 個別にサービスを起動

DynamoDB Local だけ起動して、アプリケーションはホスト側で実行することもできる。

```bash
# DynamoDB Local + テーブル作成
docker compose up dynamodb-local dynamodb-setup

# 別ターミナルでビルド & 実行
npm run build
AWS_ENDPOINT_URL=http://localhost:8000 \
AWS_ACCESS_KEY_ID=dummy \
AWS_SECRET_ACCESS_KEY=dummy \
AWS_REGION=ap-northeast-1 \
NODE_ENV=dev \
node dist/get-cars/index.js
```

---

## 開発コマンド

```bash
# ビルド (ウォッチモード)
npm run dev

# ビルド (単発)
npm run build

# 型チェック
npm run typecheck

# テスト
npm run test

# テスト (ウォッチモード)
npm run test:watch

# リント
npm run lint

# フォーマット
npm run format
```

---

## ディレクトリ構成

```
.
├── src/
│   ├── get-cars/        # ポーリング処理 (ECS Fargate)
│   └── init-db/         # DB初期化 (Lambda)
├── tools/
│   ├── car-data/        # スクレイピング・差分検知
│   ├── slack/           # Slack 通知
│   ├── aws-sdk/         # DynamoDB・SNS 操作
│   ├── error-handler.ts # エラーハンドリング
│   └── types.ts         # 型定義
├── json/
│   ├── cars/            # 車種マスタ
│   ├── decorators/      # アイコン・カラー設定
│   ├── shops/           # 店舗・エリア情報
│   └── slack-config/    # チャンネルルーティング (dev/prod)
├── infrastructure/      # Terraform (AWS)
├── .github/workflows/   # CI/CD
├── docker-compose.yml
├── Dockerfile           # Lambda 用
└── Dockerfile.fargate   # Fargate 用
```
