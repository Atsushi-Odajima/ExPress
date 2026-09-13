# ExPress

オンラインウォレットと、外部EC向けホスト型決済の自作デモです。表示名は **ExPress**、コード識別子は `express-wallet` / `@exw/*`。実際の預金・送金・カード決済・本人確認審査・メール送信は実行しません。外部金融機関との境界は `MockProvider` で模擬し、残高・複式台帳・注文・ジョブなどの内部処理は実装しています。

利用者、加盟店2社と運営者を訪問者ごとのworkspaceへ生成し、残高払い、模擬カード直接払い、部分売上確定、返金、出金、継続課金をDB・複式台帳・独立ワーカー経由で処理します。サンプルEC「NORTHSTAR」は別オリジン・別DB・別権限で動作し、サーバーSDK・公開API・署名付きWebhookだけでExPressと連携します。

**完成版の範囲・実測結果・制約は [docs/completion-report.md](docs/completion-report.md)、要件ごとの対応は [docs/requirements-matrix.md](docs/requirements-matrix.md)、確認手順は [docs/final-review-guide.md](docs/final-review-guide.md) を参照してください。** 仕様の正本は [docs/SPECIFICATION.md](docs/SPECIFICATION.md) です。

## 必要環境

- Node.js 24 LTS（実測 24.21.0）、pnpm 11.19.0（`npm install -g pnpm@11.19.0` または corepack）。
- PostgreSQL：推奨は Docker Compose（`compose.yaml`、postgres:18.6）。Dockerがない場合は既存の PostgreSQL 13 以降（実測 16.13 と 18.6）に `exw` / `exw_store` の別DB・別roleを用意するか、Windowsでは `pnpm db:local`（プロジェクト内 embedded-postgres 18.4）を使えます。
- E2E：Windows は Microsoft Edge、Linux/macOS は Playwright 管理の Chromium（`pnpm exec playwright install chromium`）。`PLAYWRIGHT_CHANNEL=chromium|msedge|chrome` で上書きできます。

## 起動

### Windows / PowerShell

```powershell
git clone https://github.com/Atsushi-Odajima/ExPress.git
cd ExPress
Copy-Item .env.example .env
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Dockerがない場合は別ターミナルで `pnpm db:local` を起動してから `db:migrate` 以降を実行します。

### Linux / macOS

```sh
git clone https://github.com/Atsushi-Odajima/ExPress.git
cd ExPress
cp -n .env.example .env
pnpm install --frozen-lockfile
docker compose up -d          # PostgreSQL 18.6 を 127.0.0.1:54329 で起動、exw_store role と exw DB の権限分離を init SQL で作成
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```

Docker を使わない場合の既存 PostgreSQL の設定手順は [docs/CLOUD-START.md](docs/CLOUD-START.md) 第7節にあります。root 環境では `pnpm db:local`（initdb）は使えません。

初回はブラウザで http://localhost:3000 を開き「デモウォレットをはじめる」を選びます。訪問者ごとに隔離されたサンプル環境（利用者・友人・加盟店2社と5役割・運営者）を生成します。秘密鍵・共通管理者パスワードは配布しません。サンプル利用者の30,000円、友人の10,000円は初期チャージ仕訳から作成し、実顧客の実績ではありません。

|サービス|標準URL|役割|
|---|---|---|
|Portal|http://localhost:3000|利用者ウォレット・加盟店／開発者ポータル・運営コンソール・ホスト型チェックアウト・デモ操作パネル|
|NORTHSTAR|http://localhost:3001|別オリジン・別DBのサンプルEC|
|REST API|http://localhost:4000/v1|認証・決済・調査|
|APIドキュメント|http://localhost:4000/docs|Swagger UI（実装から生成）|
|OpenAPI|http://localhost:4000/v1/openapi.json|`packages/contracts/openapi/exw-v1.json` と同じ内容|
|PostgreSQL|127.0.0.1:54329|`exw`（台帳）と `exw_store`（EC）の別DB・別role|

ポートを変えるときは `PORTAL_PORT` と `PORTAL_URL` など対応するURLも変更してください。`API_URL` / `PORTAL_URL` / `STORE_URL` は末尾スラッシュなしのoriginです。

`pnpm dev` は API・worker・EC・Next を別プロセスで起動します。本番ビルドは `pnpm run build` → `pnpm run start`（ビルド時にルートの `.env` を読み、PortalへAPI/ECの公開originを埋め込むので、URL変更後は再ビルド）。API・EC・Portal は loopback に待ち受け、公開構成では同一ホストの TLS プロキシを通します。`.local` はローカルの暗号鍵・ログ・DB（db:local時）を含み、Git対象外です。

## 検証

```sh
pnpm run typecheck        # tsc --noEmit
pnpm run test             # 単体・実DB統合・worker・SDK・Playground（DBを起動し、通常workerを止めた状態で）
pnpm run verify:clean     # 新規の空DBへ migration 2回・seed・HTTP SDK決済／返金・台帳照合・EC roleの台帳DB接続拒否（DB作成権限が必要）
pnpm run openapi          # OpenAPI と docs/api-endpoints.md を登録ルートから再生成
pnpm run build            # server tsc + Next production build
pnpm run start            # 別ターミナルで4サービスを起動
pnpm run test:e2e         # Playwright desktop / mobile（iPhone 13幅）— 4サービス起動後
```

DBテストは隔離workspaceを作成し、本物のPostgreSQLで100並列capture・同時残高・返金予約・期限切れ競合・DB制約・worker lease・プロセス停止回復・Webhook署名・SSRF・レート制限・定期課金を検査します。E2Eは別オリジンSDK購入→一部出荷→部分返金、Webhook 500再送・鍵更新・重複再送、模擬カード直接払いと元カード返金、Playground実注文と管理者の調整／反対仕訳、同時承認と100並列captureパネル、日英切替・QR・審査画面・権限なし表示・PWA・ダークモードを操作します。プロキシ環境では `NO_PROXY=localhost,127.0.0.1` を付けて実行してください。

最新の実測（件数・日時・環境）は [docs/completion-report.md](docs/completion-report.md) に記録しています。テスト結果のスクリーンショット・トレースは `test-results/` と `playwright-report/` に出力され、Git対象外です。

## 環境変数

`.env.example` に一覧と説明があります。`DATABASE_URL` と `STORE_DATABASE_URL` は必ず別権限。`DEMO_MODE=public` ではHTTPS公開URL、管理者所有のWebhook許可リスト、ランダムな `ENCRYPTION_KEY`（32バイトhex）が必須です。`SINGLE_WORKSPACE=true` はローカル専用。`SETTLEMENT_DELAY_SECONDS` は初期精算待機秒数、`WEBHOOK_ALLOWLIST` はWebhook通知先の完全一致許可リストです。

外部サービスのAPIキーは不要です。標準 `MockProvider` が金融機関の境界を模擬します。内部の残高移動を省略する「全部成功」機能はありません。

## 構成と資料

- [要件対応表](docs/requirements-matrix.md)、[完成報告](docs/completion-report.md)、[元担当向け確認ガイド](docs/final-review-guide.md)
- [構成・信頼境界・配備](docs/architecture.md)、[セキュリティ](docs/security.md)
- [決済ライフサイクル](docs/payment-lifecycle.md)、[台帳](docs/ledger.md)
- [API](docs/api.md)、[エンドポイント一覧](docs/api-endpoints.md)、[Webhook](docs/webhooks.md)、[SDK導入](docs/integration-guide.md)
- [16シナリオ](docs/demo-scenarios.md)、[ポートフォリオ・デモ手順](docs/portfolio.md)
- [設計判断](docs/decisions.md)、[実装状況](docs/implementation-status.md)
- 引き継ぎ履歴：[CLOUD-START](docs/CLOUD-START.md)、[HANDOFF](docs/HANDOFF.md)、[COMPLETION-PROMPT](docs/COMPLETION-PROMPT.md)、[TRANSFER-VERIFIED](docs/TRANSFER-VERIFIED.md)、[verification-record](docs/verification-record.md)

公開配備・有料契約・実課金は実施していません。静的ホスティングだけでは動きません。Next・API・永続DB・独立worker・ECサーバーが必要です。公開前の条件は [docs/security.md](docs/security.md) と [docs/architecture.md](docs/architecture.md) を参照してください。
