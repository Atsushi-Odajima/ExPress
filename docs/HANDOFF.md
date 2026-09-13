# ExPress — 別プロジェクト／Astraへの引き継ぎ

**完成作業後の更新（2026-09-13）：この文書は引き継ぎ時点の履歴です。完成版の範囲・実測結果・Git保存状態は [completion-report.md](completion-report.md)、要件ごとの対応は [requirements-matrix.md](requirements-matrix.md)、元担当向けの確認手順は [final-review-guide.md](final-review-guide.md) を参照してください。第8節A／Bの既知の失敗は修正済みです。**
最終確認：2026-09-13。次の担当エージェントに、このファイル全体を開発引き継ぎプロンプトとして渡してください。

**移管更新：実装・本資料・ユーザー仕様原文をcommit `c47113f`でGitHub mainへpushし、別フォルダーへのclone検証まで完了しました。[検証記録](TRANSFER-VERIFIED.md)を参照。取得は[CLOUD-START.md](CLOUD-START.md)から開始してください。クラウドでは元Windowsパスへのアクセスは不要です。[SPECIFICATION.md](SPECIFICATION.md)が未着だった原仕様の全文です。以下の「未コミット」は初回引き継ぎ時点の履歴です。**

## 1. 次の担当者への依頼

あなたはExPressを最終完成・納品まで引き継ぐエンジニアです。担当範囲はレビュー、既知の不具合修正、仕様の不足実装、全体の受入検証、ドキュメント・デモ手順・最終確認資料の整備です。新規に作り直さず、現時点のコードと検証結果から再開してください。ExPressは、実資金を動かさないオンラインウォレット／外部EC向け決済プラットフォームの自作デモです。ユーザーは、DB・API・台帳・認証・非同期処理・SDK・別オリジンEC・UI・テスト・文書まで完成させることを要求しています。

全必須範囲の完成宣言はまだしていません。「あと20%」という過去の概算は工数計測に基づく数値ではなく、完成判定の証拠には使わないでください。実装の存在、テスト合格、未検証を分けて報告してください。

ユーザーは使用量を懸念しています。まず未解決箇所と関連ファイルだけを読み、差分を小さく修正してください。理由のない全コード再読、全面リファクタリング、全テストの反復を避け、対象テスト→必要な回帰確認の順に進めてください。並列エージェントを自動起動せず、依頼がある場合だけ使用してください。

前担当はアプリ改修を停止して引き継ぎ資料を保存しました。ユーザーは別プロジェクトで最終完成まで進め、その完成品を元担当に確認してもらう方針です。[COMPLETION-PROMPT.md](COMPLETION-PROMPT.md)が完成までの実行指示です。これを新しい会話で受け取ったら、以下から実装・検証・納品まで続行してください。既知の2件のE2E失敗を直すだけで作業を終了しないでください。

## 2. リポジトリと、最も重要な移行上の注意

- GitHub： https://github.com/Atsushi-Odajima/ExPress
- origin：`https://github.com/Atsushi-Odajima/ExPress.git`
- 現在ブランチ：`main`
- 初回引き継ぎのHEAD：`8929459 Initial commit`。その後のソース移管commitは`c47113f`。
- 実装があるローカルパス：`C:\Users\kuroa\Documents\Codex\2026-09-10\express-codex-0-ec-express-db`
- **初回引き継ぎ時点は実装一式が未コミット・未pushでした。この移管で実装をGit管理に追加しています。本ファイルとアプリ一式を含むmainを取得すれば、Gitから引き継げます。** `8929459`だけのcloneは更新が必要です。
- 最終確認のgit status：`README.md`が変更済み。`apps/`、`packages/`、`scripts/`、`tests/`、`docs/`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、各tsconfig、`.env.example`、`.gitignore`、`compose.yaml`、`playwright.config.ts`は未追跡。
- 同じPCなら上記フォルダーを使用可能。別PC／クラウドでは最新mainのclone/pullを使用してください。一般に未追跡ファイルはworktree/cloneへ移らないため、以後の変更もGit保存状態を明示すること。
- このMDだけでなく、Gitから`apps/`・`packages/`等のソース一式を取得してください。手順はCLOUD-START.mdにあります。
- 移行時のソース対象：`apps`、`packages`、`scripts`、`tests`、`docs`、ルートの設定・lockfile・README・`.env.example`。生成物の`node_modules`、`dist`、`apps/portal/.next`は再生成可能です。
- **`.env`、`.local/keys.json`、`.local/postgres`にはローカル秘密情報／DBがあります。公開リポジトリや会話へ貼らないでください。** 同一PCなら現状を保持し、別環境では`.env.example`から新しいデモ環境を作ります。鍵だけ変更すると既存暗号化データを復号できなくなる点に注意。
- `.local/*-latest.log`、`test-results/`、`playwright-report/`はGit対象外。検証証跡を渡す場合は秘密の一度表示などを含まないか確認してください。
- 別案件のwirepay、anypay、他のNodeアプリには触れないでください。

## 3. 認可と作業方針

- 正式表示名は常に **ExPress**。コード識別子は`express-wallet`／`@exw/*`。Express.jsとは別でAPIはFastifyです。
- 実預金、実送金、実カード決済／発行、実KYC、カードネットワークへのチャージバックは実施しません。
- 公開・デプロイ、実課金、外部メール送信、有料契約、パッケージ公開は依頼範囲外です。ローカル完成と公開手順の文書化が対象です。
- APIキー不足で止まらず標準MockProviderを使います。模擬化するのは外部金融境界だけで、内部残高・台帳・注文・ジョブは実処理です。
- 通常の可逆な実装判断は自律的に進め、`docs/decisions.md`へ理由を残してください。成功トーストだけ、静的な架空残高、無効なボタン、未実装の完了表示は禁止。
- `docs/implementation-status.md`に具体的な残項目・検証・再開点を維持してください。
- `apps/portal/AGENTS.md`はNextが生成した指示です。Next編集前にインストール済み`node_modules/next/dist/docs/`の該当資料を読むよう要求しています。前担当はServer/Client Components、CSS等の資料を読んでいます。新担当は対象に応じて確認してください。
- 大量のコードが少数の大きなファイルにあります。整形・分割だけの変更を先に行わず、挙動と不変条件を優先してください。

## 4. 実行環境・固定バージョン

Windows / PowerShell、Node.js 24.16.0、pnpm 11.19.0で実行しました。主な固定依存はNext 16.3.4、React 19.3.0、Fastify 5.12.3、TypeScript 5.9.3、pg 8.23.0。Tailwind 4、Playwright、qrcode 1.5.4も使用。正確な解決結果は`pnpm-lock.yaml`が正です。引き継ぎだけを理由に依存を更新しないでください。

Docker DesktopがこのPCにないため、`embedded-postgres 18.4.0-beta.17`で**実際のPostgreSQL 18.4**をプロジェクト内に起動しました。インメモリーDBやSQLiteでの代替ではありません。ComposeはPostgreSQL 18.6指定ですが、Compose起動自体は未検証です。

|サービス|このPCのURL／ポート|標準設定|
|---|---|---|
|Portal|http://localhost:3100|3000|
|NORTHSTAR EC|http://localhost:3001|3001|
|API|http://localhost:4000|4000|
|Swagger UI|http://localhost:4000/docs|同じ|
|OpenAPI|http://localhost:4000/v1/openapi.json|同じ|
|PostgreSQL|127.0.0.1:54329|54329|

3000は別アプリが使用しているため、Git対象外`.env`でPortalを3100に変更済みです。`PORTAL_PORT`と`PORTAL_URL`を揃え、API／ECのURLにも末尾スラッシュを付けません。Cookie名はExPressが`exw_session`／`exw_demo`、ECが`exw_store_session`で分離。

## 5. 構成とファイル案内

```text
apps/api/src/
  app.ts          Fastify、認証ルート、/v1、CSRF、一覧、Playground、ログ
  security.ts     session/token/scopes、暗号化、secret、SSRF URL/DNS
  seed.ts         workspace・人物・加盟店・サンプル残高生成
  payments.ts     冪等性、注文、承認、capture/void/refund、入出金・P2P
  services.ts     アプリ鍵、Webhook、支払依頼、プラン/同意/案件
  extensions.ts   追加UI API、調査、帳票、調整/反対仕訳等
apps/worker/src/  永続job/outbox、provider照会、精算・期限切れ・請求
apps/portal/
  app/[[...path]]/page.tsx     画面ルーティング
  components/portal.tsx       シェル・セッション・利用者・checkout
  components/workspaces.tsx   加盟店・開発者・運営・デモ画面
  components/records.tsx      検索/cursor/CSV/QR/履歴
  components/investigation.tsx 調査・反対仕訳UI
  components/concurrency-lab.tsx 同時承認・100並列captureパネル
  public/                    logo.svg・manifest・静的資産専用SW
apps/demo-store/
  src/index.ts               別DB、商品正価、注文、SDK、Webhook、発送
  public/                    EC画面、日英辞書、CSS
packages/database/src/
  config.ts                  env/ローカル暗号鍵
  migrate.ts・hardening.ts    migration v1〜4、DB制約
  index.ts                   型付きSQL/Tx/テーブル共通アクセス
  ledger.ts                  勘定、複式仕訳、再計算、整合性
packages/domain/src/         金額・エラー・scope・能力等
packages/contracts/          JSON Schema、TS型、生成OpenAPI
packages/sdk-server/         token/HTTP SDK・署名検証・実行例
packages/sdk-browser/        redirect/popup・origin/source/nonce
packages/testkit/            MockProvider・固定の許可デモ資料
packages/ui/                 共通UI、日英辞書、エラー訳
scripts/                     起動・ビルド・DB・seed・OpenAPI・空DB検証
tests/                       DB/競合/セキュリティ/worker/SDK/E2E
docs/                        設計・API・シナリオ・実装状況
```

`packages/database/src/index.ts`の業務テーブルは共通のRow/JSON dataアクセスを使いますが、実際は概念ごとに別の物理テーブルです。金額はBIGINT、重要なJSON参照にも生成列と複合FKを追加しています。Prismaではなくpgとパラメーター化SQLを採用しました。

## 6. 実装範囲と維持すべき不変条件

### 6.1 デモ隔離・認証

- 訪問者ごとにworkspace/generation、利用者2名、加盟店2社、運営者、プリセット加盟店役割を生成。ローカル単一workspaceモードもコードがあります。
- workspaceは認証から決定。リクエストの任意workspace指定を信用しません。参照はworkspace/generation複合FK、クエリ・jobs・events・SDK経由も境界を維持。
- リセットは現在のworkspaceのgenerationを更新。古いセッション・ジョブ・通知を無効化し、旧台帳は通常の削除操作にしません。
- 通常登録／ログイン／ログアウト、プロフィール、セッション失効／他端末ログアウト。パスワードはsalt付きscrypt。HttpOnly/Lax、HTTPS時Secure、mutationはCSRF＋Origin。
- `exw_demo`はデモ所有者Cookieで、通常ログアウト後の同じデモへの復帰を支援。任意ユーザーのadmin昇格はしません。
- OAuth client_credentials、短命token、credential状態とversionによる既発行token失効、secretはハッシュ保存・一度表示。必要なWebhook秘密等は環境鍵で暗号化。
- owner/developer/finance/support/read_onlyのscope分離。**API鍵発行・ローテーションで自分のscopeを超えられない修正済み。**
- レート制限：入口IP 3000/分、ログイン等20/分、認証後workspace/generation/actor 300/分、429＋Retry-After。単一APIプロセスのメモリー制限で、多インスタンス共有は未対応。

### 6.2 台帳・金額・冪等性

- JPYのみ、APIは10進整数文字列、DB BIGINT、計算BigInt。ゼロ・負・上限・未対応通貨・明細合計をサーバーで検証。
- immutable複式台帳が正本。資産、利用者available/held、加盟店unsettled/available、payout held、refund held、fee revenue。訂正は理由付き調整仕訳／参照付き反対仕訳。
- 同一DB transactionに業務状態、仕訳、キャッシュ残高、idempotency結果、outboxを保存。業務イベント一意制約。
- **workspace行をロックして金銭操作を直列化し、勘定もID順にロック**。デモの正しさを優先した設計で、商用高TPSの根拠にはしない。
- 金銭POSTはIdempotency-Key必須。scopeはworkspace/generation/主体/操作/対象。正規化入力hashを保存、同一内容は同結果、異なる内容は409。寿命中保持。同時到着で二重処理しない。
- 仕訳借貸、再計算残高、業務レコード、注文集計、各種保留、精算ロットをreconciliationで照合。

### 6.3 利用者・決済

- DB連動の残高・保留・明細、模擬カード／銀行の登録・停止・既定設定、チャージ、P2P、支払依頼、模擬銀行出金。
- サンプル初期残高30,000円／友人10,000円は初期チャージ仕訳から生成。実顧客の実績として表示しない。
- PaymentOrder、CheckoutSession、Authorization、Capture、Refund、ProviderAttemptを分離。
- checkoutのapprovedは同意、authorizationのauthorizedは資金確保。ユーザー・加盟店・額・通貨・支払元を固定。
- 残高払いはavailable→held→加盟店未精算＋手数料。カード直接払いはwalletを増減せずprovider側オーソリ、capture時に外部資金勘定へ記帳。
- 30分checkout／24時間authのデモ期限。部分capture複数回、final_capture残額解放、void/expiryは未確定分のみ解放。累計上限と競合保護。
- 元支払元への部分／全額返金。カード削除後も元token参照を保持して返金可能。
- 手数料はcaptureごと3%＋30円、率切捨て、snapshot、返金時は返却しない。手数料が額を超える少額captureは拒否するデモ判断。
- 返金は利用可能→古い未精算ロットの順で予約。pendingも返金上限に含める。原資不足はINSUFFICIENT_REFUND_FUNDS、加盟店模擬追加入金で回復。運営立替はしない。
- 返金失敗は元の勘定／ロットに戻す。未確定providerは予約を維持。精算ロット消費／予約を追跡して二重解放を防ぐ。
- 出金申請で資金を拘束、workerがprocessing→成功／失敗。成功は外部資金勘定、失敗は元残高へ解放。
- 追加認証はチェックボックスによる模擬ステップ。実カード番号/CVV/実書類は収集しない。

### 6.4 非同期・Webhook・障害回復

- APIと独立した常駐worker。intent保存→外部呼出し→結果反映。外部呼出し中に業務DB transactionを開かない。
- MockProvider結果を業務反映とは独立してコミット。成功後保存前のプロセス停止を実際に再現し、照会で1回だけ記帳。
- DB永続job/outbox、claim lease、停止後再取得、指数バックオフ/jitter、最大6回、dead-letter、手動再送。
- at-least-once。再送event ID同じ／delivery ID別、新timestamp。HMAC-SHA256(timestamp + '.' + raw body)。SDKは定時間比較・5分許容・複数鍵対応。
- 鍵更新後24時間は新旧両鍵のv1署名を同時送信。旧鍵だけの受信者にも移行時間を確保。
- SSRF：管理者設定URL allowlist、公開HTTPS、private/loopback/link-local等拒否、登録・配信でDNS再検証、接続IP固定、redirect禁止、5秒timeout・64KB制限。local例外は登録済みECのみ。
- Node24のDNS lookup all=trueで配列が必要な不具合は修正済み、localhost宛て実HTTPテストあり。
- Webhook失敗で成功決済を失敗に戻さない。ECはevent重複排除・resource version／最新API照会で収束。

### 6.5 定期課金・案件・運営

- 月額固定JPYプラン、pending_consent→利用者明示同意でactive。加盟店だけでは有効化不可。
- UTC月末丸め、テスト時計、subscription/period一意。1日後／3日後の同一周期再試行、最大3回で停止。unknown時は新規請求しない。
- 同意撤回／pause/cancel、次回請求、利用者の支払元固定。同意撤回で確定済み決済を自動取消しない。
- カードcapture失敗、auth後の加盟店制限で請求ジョブが永久停滞しない修正済み。削除済みカードは新規周期課金不可、既存返金は可。
- 固定額支払リンク／期限／停止／QR、支払依頼の作成・承認・取消、通知送信箱。
- 購入トラブル・返金依頼・案件内メッセージ、加盟店回答、運営者仲介。資料は許可された固定2テキストのみ、任意upload/URLなし。
- can_pay/can_receive/can_payout/can_refund/can_capture等を別管理、理由・監査。新規支払停止後も閲覧と返金受取を許可。
- 高額／provider失敗／10分内3回失敗のルールとversion・理由付きreview。後者は同一窓の重複reviewを抑止。
- 管理者検索、台帳照会／残高再計算、調整・反対仕訳、設定、ジョブ・provider不明・Webhook障害、注文タイムライン。

### 6.6 SDK・サンプルEC

- server SDK：token取得／更新、typed注文・checkout作成／照会、auth/capture/refund照会、capture/void/refund、timeout・エラー型・request ID、限定再試行。同じ金銭POSTは同じキー。
- browser SDK：許可ExPress origin/pathのredirect、popup補助、ブロック時fallback。postMessage origin/source/nonce検証。メッセージや戻りURLを決済証拠にしない。
- NORTHSTAR ECは別オリジン、別DB／別roleでExPress DBのCONNECT不可。SDK・公開API・署名Webhookだけで連携。
- 架空商品5点、商品詳細・カート・サーバー正価・注文・購入履歴・返品依頼。
- immediate／shipping確定。2個購入→一部出荷→部分capture/final解放→部分返金。
- 注文状態・金額・通貨・加盟店・EC注文対応をサーバー照合後にcapture。Webhookと照会どちらが先でも収束。発送はcaptureごと一意。
- 失敗カードの再checkout導線、pending auth/capture/refundの照会、日英・ダークを実装。

### 6.7 UI・APIドキュメント・デモパネル

- Next PortalはAPIのみ利用、フロントを残高正本にしない。モバイルwallet、情報密度のある加盟店／運営、独自ネイビー／ティールSVGロゴ。
- 日本語標準／英語辞書、言語保持、タイムゾーン表示、dark、responsive、focus/label、失敗保持、金額確認。利用者入力の名称・メモは翻訳しない。
- 全画面のデモ表示。PWAは静的logo等のみcache、残高・PII・支払APIをcacheしない。オフライン成功を作らない。
- 主要一覧cursor検索／期間／状態、CSV数式注入対策。明細CSVは最大10,000行、その他は表示ページのみと明示。
- 加盟店日次売上／手数料は実データ集計。店舗logoは1〜4文字の独自マーク。
- 開発者：アプリ／secret/scopes/return URL、Webhook設定/履歴/再送、APIログ、Swagger、curl/SDK説明、実API Playground。
- Playgroundは登録済み3パス（orders/balances/webhook-deliveries）とGET／orders POSTに制限。任意外部proxyではない。
- デモ時計はworkspace内業務時計、障害はworkspace/generation/operation単位。worker停止／再開とreset。
- 操作前後の実API snapshot比較（メモリー内、reloadで消える）、100並列capture、2注文同時承認パネルを追加済み。**最後の100並列パネルE2Eは未合格、詳細は次節。**

## 7. 直近の検証結果（再実行していない確定記録）

2026-09-13に既存ログを読み直して確認しました。新たな全テストは引き継ぎ作成時には実行していません。

|検証|最新結果|証跡|
|---|---|---|
|typecheck|直近実行で合格|前担当実行結果|
|単体／実DB統合／worker／SDK|**33件合格・0失敗**|`.local/test-latest.log`、約42秒|
|production build|サーバーtsc・Next build合格|`.local/build-latest.log`|
|production start|API/worker/EC/Portal起動確認済み|現在も起動中とは断定しない|
|空DB検証|migration 2回、seed、HTTP SDK決済・部分返金、台帳、DB権限分離に合格|`scripts/verify-clean*.ts`|
|最新Playwright|**14件中12合格・2失敗**、約4.6分|`.local/e2e-latest.log`|
|Docker Compose起動|未実施|このPCにDockerなし|

33件には、借貸／残高／業務照合、100同一キー／別キーcapture上限、残高10,000円への8,000円2件、並列返金予約上限、capture/void/expiry競合、provider成功後プロセス停止、outbox/lease/HTTP500/二重署名/dead-letter、失効token/scope/IDOR/workspace/CSRF/URL、請求月末・重複・撤回・再試行等が含まれます。

直近追加で合格した重要ケース：

- 開発者が権限を超えるAPI鍵発行／更新をできない。
- 制限時429＋Retry-After、別workspace主体への波及を防ぐ。
- 精算前200円返金→740円精算→加盟店出金失敗で解放→出金成功→残800円返金原資不足→800円追加入金→全額返金・照合。
- 削除済みカードの新規継続課金禁止。
- 管理者反対仕訳、資料認可、カードauth後の加盟店制限からのジョブ収束。

PlaywrightはEdge desktopとiPhone13幅のChromium/Edgeエミュレーション各7ケース。各環境で次の6ケースが合格：

1. SDK購入→一部出荷→部分capture／残額解放→部分返金。
2. 英語保持・加盟店検索・QR・能力別設定。
3. 実WebhookでEC更新、500再送、鍵更新、重複・順序逆転でも二重発送なし。
4. 加盟店／運営・PWA・dark。
5. 英語ECで模擬カード直接払い→元カード返金、wallet残高は不変。
6. Playground実注文・APIログ・管理者調整仕訳→反対仕訳。

## 8. 最優先の未解決事項・レビュー候補

### A. 2件のE2E失敗を修正する

- ファイル：`tests/e2e/payment.spec.ts:75`の「デモパネルの同時承認で過剰使用を防ぎ、100重複captureが1回になる」。PC／mobileの両方で同じ失敗。
- 停止行：80、`page.getByLabel('オーソリ',{exact:true}).selectOption({index:1})`で90秒timeout。
- その前の2注文同時承認は進行し、`INSUFFICIENT_FUNDS`／残高`6000`のassertionを通過。
- 失敗snapshotには「100並列の売上確定を試す」と、オーソリcombobox／有効な24,000 JPYのoptionが表示されている。
- **原因は未確定。** labelがselectを内包しておりgetByLabelのexact一致がoptionテキスト等の影響を受ける可能性がある。role変更直後の画面遷移raceも確認候補。traceを見てから修正する。
- 候補：明示的label htmlFor／select id、適切なaccessible name／getByRole、role切替後の完了待ち。timeout延長やassertion削除で合格扱いにしない。
- 対象UI：`apps/portal/components/concurrency-lab.tsx`。最後の編集は同じ行を同じ内容で置換しただけで、**実効的な修正はまだありません。**
- このE2Eは100API送信に到達していないため、パネルから100要求が通ることは未確認。API／DB側の100並列テストは合格済み。
- 証跡：`test-results/payment-デモパネルの同時承認で過剰使用を防ぎ、100重複captureが1回になる-{desktop|mobile}/error-context.md`、`trace.zip`、`test-failed-1.png`。

最初の再実行は対象だけ：

```powershell
pnpm run test:e2e --grep 'デモパネルの同時承認'
```

### B. Playgroundのcurl例の不備

- `apps/api/src/app.ts:156`付近のレスポンス`curl`。
- 現状のPOST例にContent-TypeとJSON bodyが付いていない。
- `Authorization: Bearer $EXW_ACCESS_TOKEN`がPOSIXシェルの単一引用符内なので変数展開されない。
- 表示例を修正する場合は秘密token自体を埋めず、ユーザー制御のidempotency key／body／URLを適切にシェルquote。Windows例とPOSIX例の区別も明示する。
- 現状Playground本体のHTTP処理は動作しており、上記は**提示するcurl文字列**の不備。

### C. 仕様網羅性の最終レビュー

- `docs/api-endpoints.md`と生成OpenAPIが全endpoint一覧。UI向け追加APIも含む。列挙の存在だけで契約／認可／レスポンス仕様完成と判断せず、重要経路を照合。
- 全16シナリオは下記と`docs/demo-scenarios.md`に手順あり。個別E2Eが16本あるわけではない。残りはDB統合／worker試験と手順の組合せ。
- admin timelineには注文・checkout・auth・capture・refund・provider・journal・eventがある。delivery詳細／journal lineを同一timelineで追えるか、必要ならUI／API補完を検討。
- singleton localモード、全一覧の英語／timezone／empty/error状態、全役割の操作導線は、全組合せをE2E済みとは主張していない。
- UIテストの主要幅は合格しているが、包括的キーボード／読み上げ監査は未実施。
- DB共通Rowのdataが広いany型のため、型付きSDK導入済みでも全内部型が厳密とは限らない。境界のサーバーvalidation／DB制約を重点確認。
- Dockerのクリーン起動は未実施。`verify:clean`は新規空DBでの実検証だが、Docker/別Windows PCの完全再現とは区別する。EC schemaはEC起動時作成で、この空DB試験がECの全起動まで検証しているわけではない。

### D. 未実施／既知の制約

- 公開配備、実iOS端末、Edge以外、負荷性能、外部侵入試験、包括的a11y監査は未実施。
- 共有レート制限storeや多インスタンス運用は未実装。workspace内金銭操作は直列化。
- JPYのみ、混合払い・FX・日割り・自動値上げは今回の対象外。実金融API接続は対象外。
- 店舗logoは文字マーク、資料は固定2テキスト。ユーザー入力の機械翻訳なし。
- 初回資料作成時点では未コミット／未pushだった。その後ユーザーがGitへの移管を依頼したため、実装と資料をGit管理へ追加。配備・実課金等のアプリ公開は行わない。

## 9. 起動・検証・プロセスの扱い

同じPCでは既存`.env`を上書きしないこと。別環境でだけ`.env.example`から作成してください。

```powershell
Set-Location 'C:\Users\kuroa\Documents\Codex\2026-09-10\express-codex-0-ec-express-db'
git status --short
pnpm install --frozen-lockfile
# ターミナルA：Dockerがない場合はDBを常駐
pnpm run db:local
```

別ターミナル：

```powershell
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```

本番ビルドを使う場合はdevと同時起動せず：

```powershell
pnpm run build
pnpm run start
```

- `scripts/build.ts`はルート.envを読み、tsc→Next webpack build。PortalにAPI／EC URLをビルド時埋込。URL変更後は再build。
- `scripts/start.ts`はビルド済みAPI/worker/ECとNext startを別プロセス起動。現構成はloopback待受、公開時は同一ホストTLS proxy等が必要。
- `scripts/dev.ts`／startは`.local/dev-processes.json`へrootとPIDを保存。**PIDは古くなるので実プロセスのコマンドラインと所有を確認してからExPressだけ停止。全Node強制終了は禁止。**
- 9/11の最終起動ではproductionの4サービス＋embedded DBが動作したが、日付をまたいだ現在の生存は未確認。古いツールsession IDを引き継いで操作しない。
- PostgreSQLが停止しているときはDBを先に起動。`.local/postgres`や鍵を消して直そうとしない。

```powershell
pnpm run typecheck
# 通常workerを停止した状態。DBは起動しておく
pnpm run test
pnpm run verify:clean
pnpm run openapi
# 4サービスを起動してから
pnpm run test:e2e
```

- DB試験に実worker停止／再開が含まれるため通常workerと競合させない。
- `verify:clean`はUUID名の新規検証DBだけを作成・削除し、設定済みDBは削除しない設計。DB作成権限が必要。
- `pnpm run openapi`は`packages/contracts/openapi/exw-v1.json`と`docs/api-endpoints.md`を実装から生成。
- `pnpm test`がpnpmの自動install/noTTYで失敗したことがあるため、明示的な`pnpm run test`を推奨。
- 全テストは変更内容に応じて実行。最初は失敗したパネル2件だけでよい。修正後のbuild／回帰確認は新しい変更に必要な範囲で行う。

## 10. ユーザー必須16シナリオ

1. 残高支払い→即時capture→Webhook→EC支払済み。
2. 模擬カード支払い→capture→元カード返金。
3. 残高不足→模擬チャージ→再承認。
4. 承認後ブラウザ離脱→ECサーバー照会復旧。
5. 未captureオーソリ期限切れ→保留解放。
6. 部分capture→残額解放→部分返金。
7. 同capture並列・重複→1回だけ確定。
8. 同残高から異なる注文へ同時支払い→超過使用禁止。
9. provider timeout後成功→照会復旧→二重計上禁止。
10. Webhook500→自動再送→EC更新。
11. Webhook重複・順序逆転→状態後退／二重発送禁止。
12. 加盟店出金失敗→保留解放。
13. 出金後の返金原資不足→加盟店追加入金→返金。
14. 定期課金失敗→同周期再試行、または同意撤回で停止。
15. can_pay制限→新規拒否、過去明細と返金受取は可。
16. 他加盟店・別workspaceアクセス→拒否。

## 11. 全文書と納品時の条件

- `README.md`：起動・環境・各URL・テスト。
- `.env.example`：ローカル例。実secretなし。
- `docs/architecture.md`：構成、信頼境界、常駐worker、配備案。
- `docs/payment-lifecycle.md`：状態、期限、競合、unknown回復。
- `docs/ledger.md`：仕訳、手数料、返金予約、整合性、訂正。
- `docs/api.md`／`docs/api-endpoints.md`／`packages/contracts/openapi/exw-v1.json`：API。
- `docs/webhooks.md`：署名、24h二重署名移行、再送、SSRF。
- `docs/integration-guide.md`／各SDK README：EC導入。
- `docs/demo-scenarios.md`：16手順と期待結果。
- `docs/security.md`：認証・権限・隔離・公開前の構成条件。
- `docs/implementation-status.md`：進捗・検証・残項目。引き継ぎ時に33件／12成功2失敗へ訂正。
- `docs/decisions.md`：仕様判断／選定理由。
- `docs/portfolio.md`：実装上の説明可能な事実、5分／15分デモ。
- `docs/HANDOFF.md`：この引き継ぎ。

次の納品報告は「何が動くか」「起動手順」「実行したテスト結果」「未解決」「未実施検証」を明示してください。Astraによるレビューはまだ実施していません。全必須範囲が確認できなければ、完成・100%とは書かず具体的に残件を列挙してください。

## 12. 使用量を抑える推奨再開順

1. 最新mainを取得し、git statusと実装ファイルを確認。GitHubの初期commitだけを見て作り直さない。クラウドのパスは自身のclone先へ読み替える。
2. このMDの第8節、E2E失敗trace、`concurrency-lab.tsx`、テスト75〜81行だけを先に読む。
3. パネル失敗を診断し、最小修正→対象2件を検証。
4. Playgroundのcurl例を修正、表示例の内容／quoteを確認。
5. お金・認可・job回復を優先して残仕様を差分レビュー。既存33テストを土台に必要な不足テストだけ追加。
6. 最後に必要なbuild／回帰検証、OpenAPI再生成、status更新。公開・課金・外部メール・有料契約はしない。

以上を初動として、次の第13節およびCOMPLETION-PROMPT.mdに従い、全体の完成判定・最終納品まで継続してください。

## 13. この先の完成までの作業

### 第1段階：受入計画を実装に結び付ける

`docs/SPECIFICATION.md`に保存した元の開発指示書を要件の正本とすること。このMDの「実装済み」は前担当の実装説明であり、独立した検収結果ではありません。`docs/requirements-matrix.md`を新規作成し、ウォレット／加盟店／開発者／運営／checkout／API／SDK／EC／台帳／worker／デモ／UI／セキュリティ／起動・文書の全必須範囲について、対応コード、検証、残件を紐付けてください。

一覧には少なくとも「未実装」「実装済み・未検証」「検証合格」「検証失敗」「環境により未検証」を分け、設計だけ、ルートだけ、ボタンだけを完成と数えないでください。元仕様で必須だったものを任意項目へ変更して終了しないでください。

### 第2段階：既知の失敗を修正

第8節Aの並列パネル2件とBのcurl例を修正・検証。失敗の根拠と修正理由を残します。既に合格したDB不変条件を維持してください。

### 第3段階：不足実装を埋める

要件表を基に、金銭一貫性と認可、provider／worker回復、EC連携を優先。続いて利用者／加盟店／運営の全操作、API／SDK契約、16シナリオ、日英・レスポンシブ・PWA・検索／CSV・状態表示まで仕上げてください。管理者timelineなど第8節Cの項目も確認対象です。大規模な作り直しより既存サービスの不足を補う方針とします。

### 第4段階：完成版で受入検証

変更対象テストが通った後、納品する最終状態に対してtypecheck、DB/worker/SDK試験、production build、production start、desktop/mobile E2E、空DBmigration/seed／SDK／DB権限を確認。OpenAPIを再生成し、実装・SDK例・Playgroundの一致を確認してください。必須16シナリオそれぞれに自動／手動の検証方法と実行結果を残します。

Dockerが利用できる環境ではComposeのクリーン起動も確認。利用不能の場合は代替の実PostgreSQL検証を実行し、Docker未検証を明記します。外部環境の条件は隠さず、利用可能な範囲の実装・検証を全て終えてください。既存データ破壊や無断の有料サービス導入で検証環境を作らないでください。

### 第5段階：完成品と元担当向け確認資料を納品

README、全設計文書、要件表、implementation-statusを最終状態に同期します。`docs/completion-report.md`に完成版の範囲、起動方法、実行環境、テスト日時・件数・結果、16シナリオの結果、制約、未実施検証、Git保存状態を記載。`docs/final-review-guide.md`には元担当が短時間で完成品を確認できる入口、5分／15分の操作手順、修正一覧、主要コードと証跡への案内、重点レビュー項目をまとめてください。

引き継ぎ時点の33件／12合格2失敗をそのまま最終結果に転記せず、完成版の実測へ更新します。commit／pushの実施有無とローカル成果物の場所を明示し、GitHubに存在しないコードを公開済みとして案内しないでください。公開配備・実課金等は対象外のままです。

完成判定は、全必須機能がDB/API/台帳/worker/ECを通して操作でき、必要な試験と文書が揃うことです。修正可能な失敗や未実装が残る間は続行してください。外部環境が必要な未実施検証だけが残る場合も「全て検証済み」とはせず、実装完了範囲と検証保留を区別して納品してください。
