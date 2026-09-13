# ExPress

オンラインウォレットと、外部EC向けホスト型決済の自作デモです。表示名は **ExPress**、コード識別子は `express-wallet` / `@exw/*`。実際の預金・送金・カード決済・本人確認審査・メール送信は実行しません。

利用者、加盟店2社と運営者を訪問者ごとのworkspaceへ生成し、残高払い、模擬カード直接払い、部分売上確定、返金、出金、継続課金をDB・複式台帳・ワーカー経由で処理します。サンプルEC「NORTHSTAR」は別オリジン・別DBです。

**実装・検証の最新状況と残項目は [implementation-status.md](docs/implementation-status.md) を参照してください。全要件の完成判定前です。**

**別PC・クラウドへの引き継ぎ入口：** [取得・起動手順](docs/CLOUD-START.md) → [完成までの指示](docs/COMPLETION-PROMPT.md) → [詳細引き継ぎ](docs/HANDOFF.md)。[ユーザー開発仕様の原文](docs/SPECIFICATION.md)もリポジトリに保存しています。以前の初期READMEだけのcloneは、mainを更新して実装一式を取得してください。Windowsの元フォルダーへ接続する必要はありません。

## 必要環境

- Node.js 24 LTS、pnpm 11.19.0。`npm install -g pnpm@11.19.0`。
- 推奨：Docker Desktop（Linux containers）とCompose。
- DockerがないWindowsでは `pnpm db:local` がプロジェクト内PostgreSQLを起動します。OSへのDBサービス登録は不要です。
- E2Eの既定はWindowsがMicrosoft Edge、Linux/macOSがPlaywright管理のChromium。後者は `pnpm exec playwright install chromium` が必要です。`PLAYWRIGHT_CHANNEL=chromium` / `msedge` / `chrome` で上書き可能。これまでの実測はWindows Edgeです。

## Windows / PowerShellで起動

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

Dockerがない場合、別ターミナルで以下を起動してから `db:migrate` 以降を実行します。

```powershell
pnpm db:local
```

初回はブラウザの「デモウォレットをはじめる」を選択します。秘密鍵・共通管理者パスワードは配布しません。サンプル利用者の30,000円、友人の10,000円は、サンプル初期チャージ仕訳から作成します。

|サービス|標準URL|役割|
|---|---|---|
|Portal|http://localhost:3000|利用者・加盟店・運営者・チェックアウト|
|NORTHSTAR|http://localhost:3001|独立サンプルEC|
|REST API|http://localhost:4000/v1|認証・決済・調査|
|APIドキュメント|http://localhost:4000/docs|Swagger UI|
|OpenAPI|http://localhost:4000/v1/openapi.json|実装から生成|
|PostgreSQL|127.0.0.1:54329|exw / exw_store の別DB|

この開発PCでは3000が使用中のため、Git対象外の `.env` で `PORTAL_PORT=3100` / `PORTAL_URL=http://localhost:3100` にしています。ポートを変えるときは対応するURLも変更してください。`API_URL` / `PORTAL_URL` / `STORE_URL` は末尾スラッシュなし。

`pnpm dev` はAPI・worker・EC・Nextを別プロセスで起動します。中断後はサービスが停止している場合があります。DB→migration→devの順に再開してください。`.local` はローカルDBと暗号鍵を含み、Git対象外です。削除するとローカルのデモデータを失います。

本番ビルドをローカルで確認する場合は、`pnpm run build` → `pnpm run start`。ビルド時にルートの `.env` を読み、PortalへAPI/ECの公開originを埋め込みます。URLを変えた場合は再ビルドしてください。API・EC・Portalはloopbackに待受し、公開構成では同一ホストのTLSプロキシを通します。

## 検証

```powershell
pnpm typecheck
pnpm run test
# 空DBのmigration/seed/SDK/DB権限を検証（ローカルDBの作成権限が必要）
pnpm run verify:clean
# pnpm dev を別ターミナルで起動した状態で
pnpm test:e2e
pnpm openapi
pnpm build
```

DBテストは隔離workspaceを作成し、本物のPostgreSQLで並列要求・制約を検査します。モックDBではありません。E2Eはdesktop/mobileの購入→部分確定→部分返金、加盟店・運営者画面を操作します。テスト結果のスクリーンショットとトレースは `test-results/` と `playwright-report/` に出力します。最新の実測結果は実装状況に記録します。

プロセス停止を再現するDBテストは、通常の `pnpm dev` / `pnpm start` のworkerを停止して実行してください。E2Eは4サービスを起動してから実行します。Composeの実行は、この開発PCにDocker Desktopがないため未検証です。

## 環境変数

`.env.example` に一覧と説明があります。`DATABASE_URL` と `STORE_DATABASE_URL` は必ず別権限。`DEMO_MODE=public` ではHTTPS公開URL、管理者所有のWebhook許可リスト、ランダムな `ENCRYPTION_KEY`（32バイトhex）が必須です。`SINGLE_WORKSPACE=true` はローカルだけで使用します。`SETTLEMENT_DELAY_SECONDS` は初期精算待機秒数です。

外部サービスのAPIキーは不要です。標準 `MockProvider` が金融機関の境界を模擬します。内部の残高移動を省略する「全部成功」機能はありません。

## 構成と資料

- [構成・信頼境界・配備](docs/architecture.md)
- [決済ライフサイクル](docs/payment-lifecycle.md)、[台帳](docs/ledger.md)
- [API](docs/api.md)、[Webhook](docs/webhooks.md)、[SDK導入](docs/integration-guide.md)
- [16シナリオ](docs/demo-scenarios.md)、[セキュリティ](docs/security.md)
- [設計判断](docs/decisions.md)、[ポートフォリオ・デモ手順](docs/portfolio.md)

公開・有料契約・実課金は実施していません。静的ホスティングだけでは動きません。Next・API・永続DB・独立worker・ECサーバーが必要です。
