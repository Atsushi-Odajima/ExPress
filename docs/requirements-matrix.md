# 要件対応表（requirements-matrix）

[SPECIFICATION.md](SPECIFICATION.md)（ユーザーの開発指示書原文）を正本とし、必須要件ごとに対応コード・検証方法・状態・残件を記録する。前担当の「実装済み」説明ではなく、この環境（Linux、Node 24.21.0、PostgreSQL 18.6 Compose／16.13）で実際に実行した結果で判定した。最終実行の件数・日時は [completion-report.md](completion-report.md) を参照。

凡例：**合格** = 自動テストがこの環境で合格。**手動確認** = 実装があり手動操作で確認したが専用の自動テストはない。**未検証（環境）** = 実装はあるがこの環境の制約で未実行。**残件** = 未実装または未解決。

「ルートが存在する」「ボタンがある」だけの項目は合格にせず、DB・台帳・APIを通した検証があるものだけを合格とした。

## 1. 完成必須の成果物（仕様1）

|成果物|対応コード|検証|状態|
|---|---|---|---|
|1 利用者ウォレットWeb（モバイル優先・PWA）|`apps/portal/components/portal.tsx`、`apps/portal/public/{manifest.webmanifest,sw.js}`|E2E `加盟店・運営者・PWA・ダークモード`（manifest取得、iPhone13幅）、`別オリジンSDK購入…`のmobile project|合格|
|2 加盟店・開発者ポータル|`portal.tsx`（merchant区画）、`workspaces.tsx` `Developer`|E2E 2・4・6、単体 `開発者は自分のscopeを超える…`|合格|
|3 運営者コンソール|`workspaces.tsx` `Admin`、`investigation.tsx`、`/v1/admin/*`|E2E 6（調整仕訳・反対仕訳）、単体 `運営者の調整反対仕訳…`、`任意Idempotency-Key…運営者の仕訳検索…`|合格|
|4 ホスト型チェックアウト|`portal.tsx` checkout区画、`/v1/checkout/*`|E2E 1・3・5・7|合格|
|5 バージョン付きREST API・OpenAPI・対話型ドキュメント|`apps/api/src/app.ts`、`/v1/openapi.json`、`/docs`（Swagger UI）、`packages/contracts/openapi/exw-v1.json`|単体 `APIのCSRF…OpenAPI`、`pnpm run openapi` 再生成|合格|
|6 ブラウザSDK・サーバーSDK|`packages/sdk-browser`、`packages/sdk-server`|単体 `ブラウザSDKは許可origin…`、`SDK READMEのcheckout例を実HTTP APIで実行`|合格|
|7 別オリジンのサンプルEC|`apps/demo-store`（port 3001、別DB `exw_store`）|E2E 1・3・5、`verify:clean` のDB権限分離|合格|
|8 台帳・Webhookワーカー・期限切れ／定期課金ジョブ|`packages/database/src/ledger.ts`、`apps/worker/src/worker.ts`|単体 core／worker／process-recovery|合格|
|9 障害シナリオ再現パネル|`workspaces.tsx` `Demo`、`concurrency-lab.tsx`、`/v1/demo/*`|E2E 7、単体（scenarios経由のtimeout_success）|合格|
|10 自動テスト・起動手順・設計説明・面接用デモ手順|`tests/`、README、`docs/*.md`、`portfolio.md`|本表・completion-report・final-review-guide|合格|

## 2. 技術構成（仕様2）

|要件|対応|検証|状態|
|---|---|---|---|
|TypeScriptモノレポ、lockfile固定|`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`pnpm install --frozen-lockfile`|Linuxで frozen install 成功|合格|
|Next/React/Tailwind、独立Fastify API、PostgreSQL、独立worker、Playwright|`apps/*`、`playwright.config.ts`|typecheck・build・E2E|合格|
|型付きDBアクセス、排他制御にパラメーター化SQL|`packages/database/src/index.ts`（pg、`FOR UPDATE`、`SKIP LOCKED`）|単体 100並列・同時残高|合格|
|Docker ComposeでDB起動|`compose.yaml`（postgres:18.6、init SQL）|この環境で `docker compose up -d` → healthy、role分離、migration/seed/検証を実施|合格|
|ポート・URLは環境変数|`.env.example`、`packages/database/src/config.ts`|起動確認|合格|
|フロントに残高正本を置かない|PortalはAPIのみ、`/v1/me/balances` 等|コード確認・E2E|合格|
|workerはWebリクエスト外の常駐プロセス|`apps/worker/src/index.ts`、`scripts/start.ts`|E2E（配信・精算はworker経由）|合格|
|Redis不要の永続キュー|`jobs`／`outbox`／`webhook_deliveries` テーブル、lease|単体 worker `lease期限内は再取得せず…`|合格|

## 3. デモ環境と利用者の分離（仕様3）

|要件|対応|検証|状態|
|---|---|---|---|
|全画面に「デモ・実際のお金は動きません」|`portal.tsx` global-demo-notice／footer、ECの `.demo` バナー|E2Eスクリーンショット、手動確認|合格|
|FundingProvider／PayoutProvider配下のMockProvider|`packages/testkit/src/index.ts`|単体 provider系|合格|
|実カード番号・CVV・書類を収集しない|模擬カード選択（`/v1/me/payment-methods`）、KYCは状態のみ|コード確認|合格|
|訪問者ごとのworkspace生成（利用者・加盟店2社・運営者・EC）|`apps/api/src/seed.ts`、`/v1/demo/start`|E2E各テスト、単体 fixture|合格|
|役割切替はプリセット人物のみ、admin昇格禁止|`/v1/demo/switch`、`newSession`|単体 `通常登録…`（admin=undefined）|合格|
|Cookie／token／DB／job／Webhook／SDKでworkspace境界維持|複合FK、`transaction()`のworkspace行ロック|単体 `DBがworkspace外部キー…`、`resetはgeneration…`|合格|
|resetは現在workspaceのみ、generation更新で旧処理無効化|`/v1/demo/reset`|単体 `resetはgenerationを更新し…`|合格|
|ローカル単一workspaceモード|`SINGLE_WORKSPACE=true`（`/v1/demo/start`）|手動確認（コード経路）|手動確認|
|公開デモで共通管理者パスワード・共通API秘密鍵を配布しない|seedはランダム鍵、`config.ts` publicモード検証|コード確認|合格|

## 4. UI・UX（仕様4）

|要件|対応|検証|状態|
|---|---|---|---|
|日本語標準・英語切替、UTC保存・タイムゾーン表示|`packages/ui/src/{i18n,messages}.ts`、`date()`（利用者timezone）|E2E 2・5、辞書欠落チェック（scratch scriptで0件）|合格|
|独自ロゴ（ネイビー／ティール）|`packages/ui/src/index.tsx` `Logo`、`logo.svg`|手動確認|手動確認|
|モバイルUI／業務UI|`globals.css` レスポンシブ、mobile project|E2E mobile 7件|合格|
|ダークモード・レスポンシブ・キーボード・フォーカス・読み上げラベル|`data-theme`、`:focus-visible`、aria-label／htmlFor|E2E 4（dark）、E2E 7（label関連付け）|合格（包括的a11y監査は未実施）|
|残高種別の区別と説明|`stats()` 4区分＋説明文、balance-card|E2E 1（残高）、手動確認|合格|
|データなし／読込中／権限なし／失敗／再試行／期限切れ|`Empty`、`boot`、権限なしカード（`forbidden`）、`error`＋再試行、EXPIRED表示|E2E 2（No data yet）、E2E 4（権限なし: read_onlyで `payouts:write` / `webhooks:manage`）|合格|
|金額操作の事前確認・失敗時入力保持|`ActionDialog` 確認ステップ、エラー時にフォーム維持|E2E 6・7（内容を確認→確認して実行）|合格|
|CSV・検索・フィルター・ページング・期間・CSV注入対策|`records.tsx`（cursor）、`csv()` エスケープ|単体 `金額・手数料…CSV注入`、`同じ仕訳内の複数勘定もcursor…`、E2E 2（検索）|合格|
|利用者画面に技術詳細を散らさない|技術情報は `/developer` と `/demo` のみ|手動確認|手動確認|
|PWAは静的資産のみキャッシュ|`sw.js` は `/logo.svg` のみ|E2E 4（manifest）、コード確認|合格|

## 5. 利用者ウォレット（仕様5）

|要件|対応|検証|状態|
|---|---|---|---|
|5.1 登録／ログイン／ログアウト／プロフィール／言語／TZ|`/v1/auth/*`、`/v1/me/profile`|単体 `通常登録→ログアウト→…`|合格|
|パスワードハッシュ、セッション失効、他端末ログアウト|scrypt、`sessions.revoked`、`/v1/me/sessions/revoke-others`|同上|合格|
|模擬本人確認4状態|`kyc` unsubmitted/pending/verified/correction_required|E2E 2（審査画面）、コード確認|合格|
|利用制限の理由と可否表示|`CapabilityList`、`restriction_reason`|E2E 2、単体 `期限切れtoken…利用者制限後も返金受取`|合格|
|通知センター（アプリ内送信箱）|`notifications`、`/wallet/notifications`|単体（`tx.notify`）、手動確認|合格|
|5.2 残高・利用可能・保留・履歴|`/v1/me/overview`、`/v1/me/transactions`（journal lines）|E2E 1（19,000）、単体 cursor|合格|
|模擬カード／銀行の登録・削除・既定|`/v1/me/payment-methods*`|E2E 5、単体 `カード直払いは…削除済みカードへ返金`|合格|
|模擬チャージの成功・拒否・処理中・timeout後成功|`topup()` + scenarios（decline/pending/timeout_success）|単体 worker `シナリオ9…timeout_success`、`provider成功後…`|合格|
|銀行への模擬出金（確保→成功／失敗解放）|`payout()`、worker `payout`|単体 `出金失敗は出金保留を解放`|合格|
|支払元はウォレットまたは模擬カード（混合なし）|`approve()`|E2E 5、単体|合格|
|削除済みカードの返金先保持|`refund()` は元provider_token|単体 `…削除済みカードへ返金できる`|合格|
|5.3 P2P送金（宛先確認・メモ・上限・同時残高保護）|`transfer()` 上限100,000円、台帳ロック|単体 `残高10,000に対する…`（同時保護）、台帳照合|合格|
|支払依頼リンク（期限・承認・取消、依頼だけでは移動なし）|`/v1/me/payment-requests*`、`/request/:id`|コード確認・手動確認|手動確認|
|別workspace／不在利用者への送金禁止、存在判定で情報を返さない|workspace境界、登録エラーは汎用文言|単体 外部キー拒否|合格|
|5.4 承認・追加認証・取消・履歴|checkout画面、`challenge`|E2E 1・3・5|合格|
|継続課金同意一覧・撤回・次回請求日|`/wallet/subscriptions`、`/v1/me/subscriptions/:id/{consent,cancel}`|単体 `定期課金の周期一意性…同意撤回`|合格|
|購入トラブル申告・返金依頼・案件メッセージ|`/v1/me/disputes*`、`/v1/disputes/:id/messages`|単体 `運営者の調整反対仕訳・案件内資料…`|合格|
|明細CSV・取引詳細・印刷可能な受領明細|`HistoryPager` CSV、受領明細ダイアログ（`window.print`）|単体 CSV、手動確認|合格|

## 6. 加盟店・開発者ポータル（仕様6）

|要件|対応|検証|状態|
|---|---|---|---|
|プロフィール・店舗情報・ロゴ・表示名・問い合わせ先・審査状態|`PATCH /v1/merchant/profile`|手動確認（E2E 4で画面表示）|手動確認|
|owner／developer／finance／support／read_onlyの役割と権限|`roleScopes`（security.ts）、seedの5人物|単体 `開発者は自分のscopeを超える…`、E2E 4（read_onlyの権限なし表示）|合格|
|日次売上・確定額・返金・手数料・未精算／利用可能・出金予定（実データ集計）|`/v1/merchant/reports`（SQL集計）、`settlement_lots` の精算予定表|手動確認（集計SQLは実データ）、E2E 4画面|手動確認|
|決済検索・外部注文番号検索・オーソリ／確定／取消／返金|`RecordBrowser`（`q`はbusiness_key含む）、注文詳細ダイアログ|E2E 2（検索）、E2E 1・6（確定・返金）|合格|
|支払リンク（有効期限・固定金額・説明・QR）|`/v1/payment-links*`、`/pay/:id`、`ShareLink`（qrcode）|E2E 2（リンク作成・QR）|合格|
|アプリ登録・client ID・秘密鍵一度表示・ローテーション・失効・scope|`/v1/merchant/applications*`|単体 `開発者は…`、`APIのCSRF…失効secret`|合格|
|return／cancel URL完全一致|`PATCH /v1/merchant/return-urls`、`createCheckout()`|単体 `…return URL完全一致…`|合格|
|Webhook登録・イベント選択・鍵更新・配信履歴・再送・模擬テスト|`/v1/webhook-endpoints*`、`/v1/webhook-deliveries/:id/retry`、`/test`|E2E 3、単体 worker、`連続失敗ルールとテストWebhookの対象endpoint限定`|合格|
|APIリクエストログ（request ID・対象・結果・時間、秘密マスク）|`api_logs`（path/method/status/latency のみ保存）|E2E 6、単体 `…成功202をAPIログに保存`|合格|
|APIドキュメント・curl例・SDK導入例・署名検証例・Playground|`/docs`、Developer overview／Webhook タブの署名検証例、Playground（POSIX／PowerShell curl）|E2E 6、単体 `tests/playground.test.ts`（curl例を実行）|合格|
|手数料明細・出金申請・出金失敗・出金先口座変更|`fee_snapshot`、`/v1/payouts`、`payout_bank`|単体 `精算前返金→…出金失敗/成功…`|合格|
|定期課金プラン・購読者一覧・停止・解約・失敗再試行履歴|`/v1/plans`、`/v1/subscriptions*`、請求周期テーブル（`billing_cycles` の attempts／history）|単体 `カード定期課金の拒否は…最大3回で停止`、`/v1/merchant/overview` の `billing_cycles`|合格|
|案件回答・資料提出（許可ファイル限定）|`/v1/disputes/:id/messages`、`demoDocuments`|単体 `…案件内資料・他workspace拒否`（`../../.env` は400）|合格|

## 7. 運営者コンソール（仕様7）

|要件|対応|検証|状態|
|---|---|---|---|
|横断検索（利用者・加盟店・決済・台帳・出金・Webhook・ジョブ）|`/v1/admin/search?table=`、`/v1/admin/journals`（仕訳）|単体 `任意Idempotency-Key…運営者の仕訳検索`|合格|
|模擬審査・差戻し・承認・制限・解除、理由と監査ログ|`/v1/admin/accounts/:id/review`（audit_logs）|E2E 2（審査画面）、単体（can_pay=false）|合格|
|capabilities別管理（can_pay／receive／payout／refund／capture）|`packages/domain` `capabilities`、`can()`|単体 `期限切れtoken…利用者制限後も返金受取`、`カード課金確保後の加盟店制限…`|合格|
|制限マトリクス（閲覧・返金受取可、既存オーソリ確定の可否）|`docs/security.md` 制限表、`can_capture`|同上|合格|
|リスクルール・手動審査キュー（理由・ルール版）|`risk_reviews`（high_amount／provider_decline／repeated_failures）|単体 `連続失敗ルール…`|合格|
|購入トラブル仲介（チャージバックではない）|`/v1/admin/disputes/:id/{messages,resolve}`、`network_chargeback:false`|単体|合格|
|台帳整合性レポート（借貸・再計算・業務照合）|`reconciliation()`（勘定・仕訳・業務レコード）|単体 `台帳から業務レコードまで照合し…不一致を検出`|合格|
|調整仕訳（理由・対向勘定）、残高直接編集禁止|`/v1/admin/adjustments`、`/v1/admin/journals/:id/reverse`|E2E 6、単体|合格|
|手数料・精算待機時間・取引限度額・定期課金上限の設定|`PATCH /v1/admin/settings`|手動確認（画面から変更→次回取引で適用）|手動確認|
|outbox滞留・ジョブ失敗・Webhook失敗・provider結果不明の調査|`/v1/admin/overview` counts、`/admin/jobs`、再試行（`/v1/admin/jobs/:id/retry`、`/v1/admin/webhook-deliveries/:id/retry`）|単体 `任意Idempotency-Key…ジョブ再試行`|合格|
|取引timeline（EC注文→…→仕訳→Webhook→返金）|`/v1/admin/timeline/:id`（配信・仕訳明細・ロット・案件・請求周期を含む）|単体 timeline拡張|合格|

## 8. 決済モデルと状態遷移（仕様8）

|要件|対応|検証|状態|
|---|---|---|---|
|EC注文／PaymentOrder／CheckoutSession／Authorization／Capture／Refund／ProviderAttempt の分離|別テーブル（`orders`,`checkouts`,`authorizations`,`captures`,`refunds`,`provider_attempts`）|DB制約（`hardening.ts` 状態CHECK）|合格|
|状態集合（仕様表のとおり）|`hardening.ts` `states`、`contracts/responses.ts`|単体 OpenAPI|合格|
|approved＝同意、authorized＝資金確保、承認時に固定|`approve()`|E2E 1・3、単体|合格|
|30分／24時間のデモ期限|`createCheckout()`、`approve()`、worker `maintenance()`|単体 `シナリオ5…`（24時間後にexpire、期限前は維持）|合格|
|複数部分capture、累計上限、final_captureで残額解放|`capture()`／`finishCapture()`、DB CHECK|E2E 1、単体 `異なるキーの100並列capture…`|合格|
|部分capture後のvoid／期限切れは未確定分のみ解放|`voidAuthorization()`|単体 `部分capture・void競合…`|合格|
|captureごとの部分返金、処理中返金を含む予約|`refund()`、`captures.reserved`|単体 `処理中カード返金を含めた予約上限…`|合格|
|期限切れ・取消・capture競合で二重解放しない|workspace行ロック、DB CHECK|単体 同上|合格|
|外部呼出し中にトランザクションを開かない、intent→外部→反映、照会回復|`intent()`、worker `runJob()`|単体 process-recovery、worker シナリオ9|合格|
|timeoutはunknownとして照会、確定前に新規資金移動なし|MockProvider `timeout_success`、`applyProvider()`|単体 worker シナリオ9|合格|
|8.2 購入シーケンス（ECサーバー正価→token→冪等作成→SDK→承認→照会→capture→Webhook→照会収束）|`apps/demo-store/src/index.ts` `sync()`、`store.js`|E2E 1・3・5|合格|
|ポップアップ補助・postMessage検証、メッセージを証拠にしない|`sdk-browser` `popup()`|単体 `ブラウザSDKは…`|合格|

## 9. 台帳・残高・手数料（仕様9）

|要件|対応|検証|状態|
|---|---|---|---|
|JPYのみ、通貨コード付き、USD拒否|`amount()`、DB `CHECK(currency='JPY')`|単体 `金額・手数料…`|合格|
|最小単位整数（API文字列／BigInt／BIGINT）|`money()`、`amount()`、BIGINT列|単体|合格|
|正の金額・上限・ゼロ拒否・通貨一致|`amount()`|単体（'0','-1','1.5','01','1e3' 拒否）|合格|
|複式台帳が正本、仕訳内借貸一致|`journal()`、トリガー `exw_balanced`|単体 `DBが…不一致仕訳を拒否`|合格|
|仕訳の不変性、訂正は反対仕訳|トリガー `exw_immutable`、`sealed_entry`|単体 同上、E2E 6|合格|
|残高キャッシュを同一トランザクションで更新、再計算で検証|`ledger_accounts.balance`、`reconciliation()`|単体 台帳照合|合格|
|残高ロック・順序ロック・リトライ|workspace `FOR UPDATE`、勘定ID順ロック、40001/40P01リトライ|単体 100並列|合格|
|台帳・業務状態・outboxを1トランザクション、業務イベント一意|`transaction()`、`journal_entries UNIQUE(business_event)`、`outbox_business_event_unique`|単体|合格|
|9.2 必須勘定と仕訳（チャージ／オーソリ／capture／解放／精算／P2P／出金）|`ledger.md` の表と `payments.ts`／`worker.ts` の仕訳|単体 各シナリオ＋業務照合|合格|
|カード直接払いはwalletを増減せず、外部資金勘定に記帳|`finishCapture()`（source≠wallet）|E2E 5、単体 `カード直払いは財布を増減せず…`|合格|
|9.3 返金は元支払元、手数料3%+30円切捨てsnapshot、手数料非返却|`fee()`、`fee_snapshot`|単体 `手数料返却なし・並列返金の予約上限・原資不足`|合格|
|返金原資は利用可能→未精算ロット、出金中は使わない、不足はINSUFFICIENT_REFUND_FUNDS、追加入金で回復、立替なし|`refund()` allocations|単体 `精算前返金→…全額返金`|合格|
|返金失敗は元勘定へ、unknown中は予約保持|`finishRefund()`|単体 `処理中カード返金…失敗時の原資ロット復元`|合格|
|精算ジョブとの二重解放防止（ロット追跡）|`settlement_lots.reserved/released`|単体 `部分capture・void競合・返金・未精算ロットの整合性`|合格|

## 10. REST API（仕様10）

|要件|対応|検証|状態|
|---|---|---|---|
|10.1 `POST /v1/oauth/token` client_credentials、短命token|`app.ts`（10分）|単体 `APIのCSRF…`|合格|
|client IDは公開、secretはハッシュ保存・一度表示|`credentialCreate()`|単体|合格|
|scope集合|`packages/domain` `scopes`|単体 scope不足403|合格|
|secret失効／rotateで既発行tokenを失効（version検証）|`tokenContext()` `credential_version`|単体 `…失効secret…`、`期限切れtoken…`|合格|
|利用者セッションAPIと加盟店APIの分離|`Auth` 種別、Bearerは merchant ルートのみ|単体 `/v1/admin/overview` 403 等|合格|
|10.2 加盟店API一覧（全30パス）|`docs/api-endpoints.md`（生成）に全パス存在|`pnpm run openapi`、単体 OpenAPI（`/v1/captures/{id}/refunds`）|合格|
|`/v1/me/*`、`/v1/admin/*`、`/v1/demo/*`、`/v1/checkout/*`（ログイン利用者・CSRF・セッション束縛）|`app.ts`、`bound_session`|単体 `…CSRF…`、`approve()` の束縛検査|合格|
|10.3 金銭POSTはIdempotency-Key必須、その他も可能な限り|`financial:true`（必須）、`idempotent:true`（任意キー、秘密は再表示しない）|単体 100並列同一キー、`任意Idempotency-Keyの再配信は1回…`|合格|
|キーのスope（workspace・主体・操作・対象）、同内容同結果・異内容409、永続保存、同時到着1回|`idempotent()`、`idempotency_records` PK|単体|合格|
|処理中は202＋operation ID|`route()`（pending/requested→202）、`/v1/{me/,}operations/:id`|単体 `…成功202をAPIログに保存`|合格|
|cursorページング・フィルター・UTC ISO 8601・request ID・429＋Retry-After|`paged()`、`history()`、`x-request-id`、rate limit|単体 cursor、`レート制限は429とRetry-After…`|合格|
|スタックトレース・秘密・他加盟店情報を返さない|`setErrorHandler`、`sanitize()`|単体（password_hash非含有、IDOR 404）|合格|
|注文例・明細合計検証|`createOrder()`、`orderSchema`|単体・E2E|合格|
|エラーコード14種|`DomainError` 各所、`docs/api.md`|単体で主要コード検証|合格|

## 11. Webhook・非同期処理（仕様11）

|要件|対応|検証|状態|
|---|---|---|---|
|at-least-once、event_id不変、delivery ID別|`webhook_deliveries`、`outbox.data.event_id`|単体 worker `outbox commit後の停止…`|合格|
|payload（event ID・type・created_at・resource ID・version・最小データ）|`Tx.event()`|単体・E2E 3|合格|
|`ExPress-Signature: t=,v1=`、HMAC-SHA256(timestamp.raw)|`signWebhook()`|単体 `Webhook署名・期限・ローテーション・改ざん`|合格|
|raw body検証・定時間比較・5分許容・重複排除・再送時の新timestamp|`verifyWebhook()`、EC `store_events`|単体、E2E 3|合格|
|鍵ローテーション移行期間（24h二重署名）とSDK手順|`rotate-secret`、`deliverOne()` keys|単体 worker `…移行中二重署名…`、E2E 3（鍵更新）|合格|
|commit後配信、指数バックオフ＋jitter、最大回数、dead-letter、手動再送|`deliverOne()`（最大6試行）、`/retry`|単体 worker（dead_letter）、E2E 3（再送）|合格|
|claim lease、停止後回復|`claimJob()` `SKIP LOCKED`＋lease、配信lease|単体 worker `lease期限内は…`、process-recovery|合格|
|順序逆転で状態を戻さない（resource version／最新照会）|EC `sync()` の `resource_version` 比較|E2E 3（古い通知の再送で発送増えず）|合格|
|Webhook失敗で成功決済を失敗にしない|配信結果は決済状態に影響しない設計|E2E 3（500後もpaid）|合格|
|SSRF対策（許可リスト・HTTPS・private拒否・DNS再検証・redirect禁止・timeout・サイズ）|`webhookAddress()`、`send()`|単体 `SSRF: …`|合格|
|公開デモの宛先は管理者許可リストのみ|`WEBHOOK_ALLOWLIST`|単体|合格|
|必須イベント19種|`packages/domain` `events`、各発火箇所|コード確認（全19種を `tx.event()` で発火）|合格|

## 12. 定期課金（仕様12）

|要件|対応|検証|状態|
|---|---|---|---|
|月額固定JPYプラン、利用者の明示同意（加盟店だけでactive不可）|`plan()`、`subscription()`（pending_consent）、`consent()`|単体 `定期課金の周期一意性…`|合格|
|UTC基準、月末丸め、テスト時計|`nextMonth()`、`clock_offset`|単体 `金額・手数料・月末アンカー…`|合格|
|(subscription_id, period_start) 一意、並列でも1周期1回|`billing_period_unique`、`runBilling()`|単体（`Promise.all([maintenance,maintenance])`）|合格|
|残高不足／カード拒否はpast_due、1日後・3日後再試行、最大回数で停止|`completeCycle()`|単体 `カード定期課金の拒否は…最大3回で停止`|合格|
|再試行は同じ周期、unknown時に新規請求しない|`runBilling()`（pending中はcontinue）|単体|合格|
|同意撤回後は新規課金なし、確定済み取引を自動取消しない|`subscriptionAction('cancel')` → consent revoked|単体（撤回後40日進めても周期1件）|合格|
|日割り・自動値上げは対象外（新たな同意）|設計判断（decisions.md）|—|合格（範囲外を明記）|

## 13. SDK・サンプルEC・Playground（仕様13）

|要件|対応|検証|状態|
|---|---|---|---|
|ブラウザSDK redirect／popup、許可origin、秘密を扱わない、型と失敗／取消／期限切れの記載|`sdk-browser`、README|単体 `ブラウザSDKは…`|合格|
|サーバーSDK（token更新・注文・checkout・照会・capture／void／refund・Webhook検証・timeout・エラー型・冪等キー・request ID・限定再試行）|`sdk-server/src/index.ts`|単体 `SDK READMEのcheckout例…`、`verify:clean`|合格|
|READMEの例が動くことをテスト|`examples/checkout.ts`|単体 同上|合格|
|サンプルEC：一覧・詳細・カート・注文・ボタン・戻り画面・購入履歴・返品依頼、架空5商品、サーバー正価|`demo-store`|E2E 1・5|合格|
|即時売上確定／出荷時確定の切替|`mode` immediate／shipping|E2E 3（immediate）、E2E 1（shipping）|合格|
|2個購入→一部出荷→部分capture→部分返金|`/api/orders/:id/{ship,refund}`|E2E 1|合格|
|ECはSDK／API／Webhookのみ、DB別権限|`exw_store` role、CONNECT拒否|`verify:clean`（42501）、Compose init SQLでも確認|合格|
|発送はcaptureごとに1回、重複Webhookで二重発送なし|`shipments.capture_id UNIQUE`|E2E 3|合格|
|Playground：実API呼出し、request／response／status／latency／request ID／curl、許可パス限定|`/v1/merchant/playground`、`playground.ts`|E2E 6、`tests/playground.test.ts`（表示したcurl例を実行し同一注文を再現）|合格|

## 14. DBモデルと制約（仕様14）

|要件|対応|検証|状態|
|---|---|---|---|
|列挙された全概念の永続化（36概念）|`packages/database/src/index.ts` `tables`（34業務テーブル）＋`demo_workspaces`,`sessions`,`access_tokens`,`idempotency_records`,`ledger_accounts`,`journal_entries`,`journal_lines`|migration実行|合格|
|workspace含む複合FK|`migrate.ts`、`hardening.ts`（JSON参照の生成列FK）|単体 `DBがworkspace外部キー…`|合格|
|非負・通貨一致・外部注文番号・業務イベント一意のDB制約|CHECK／UNIQUE各種|単体、`tests/playground.test.ts`（同一merchant_order_idはINVALID_STATE）|合格|
|資金移動を伴う削除を用意しない、resetは再生成のみ|削除APIなし|コード確認|合格|
|監査ログ（主体・操作・対象・理由・時刻・request ID・前後）|`Tx.audit()`|単体（audit_logs行）|合格|
|timelineで追跡|`/v1/admin/timeline/:id`|単体|合格|

## 15. 認証・アクセス制御（仕様15）

|要件|対応|検証|状態|
|---|---|---|---|
|HttpOnly／Secure（HTTPS）／SameSite、CSRF、ログインレート制限|`cookieOptions`、Origin＋`X-CSRF-Token`、20/分|単体 `APIのCSRF…`、`レート制限…`|合格|
|ECとExPressのCookie名・ストア分離|`exw_session`／`exw_demo`／`exw_store_session`|コード確認・E2E|合格|
|CORS許可origin限定、credentialsとワイルドカード非併用|`@fastify/cors` origin配列|コード確認|合格|
|return／cancel／checkout URL検証、open redirect防止|完全一致、SDK `validate()`|単体|合格|
|承認権限・scope・所属・運営者権限を各APIで確認|`route()` auth／scope／roles、`merchantOwn`／`userOwn`|単体 IDOR・scope|合格|
|デモ操作APIはworkspaceに閉じ、裏口にしない|`/v1/demo/*` はsession必須、`claim-store` は短命コード|単体 reset・handoff経路|合格|
|secret／token／Webhook鍵をログ・応答から除外、環境鍵で暗号化|`sanitize()`、`encrypt()`（AES-256-GCM）|単体（応答に `password_hash` なし、timelineに `secret` なし）|合格|
|ワンクリック全部成功なし|存在しない|コード確認|合格|

## 16. デモシナリオ（仕様16）

各シナリオの手順・期待結果は [demo-scenarios.md](demo-scenarios.md)。自動検証と手動確認を区別する。

|#|シナリオ|自動検証|手動確認|状態|
|---|---|---|---|---|
|1|残高支払い→即時capture→Webhook→EC支払済み|E2E 3（immediate、ECサーバー照会でcapture、Webhook後もpaid・発送1件）|Portal→EC購入|合格|
|2|模擬カード支払い→capture→元カード返金|E2E 5、単体 `カード直払い…`|—|合格|
|3|残高不足→模擬チャージ→再承認|単体 `シナリオ3…同じcheckoutを再承認`|Portal操作|合格|
|4|承認後ブラウザ離脱→ECサーバー照会復旧|E2E 3（戻りURLなしで `/api/orders/:id/confirm`）|EC購入履歴「ExPressに照会して更新」|合格|
|5|未captureオーソリ期限切れ→保留解放|単体 `シナリオ5: 未captureオーソリは業務時計の期限切れでworkerが解放し…`（90,000秒進め→maintenance→expired・held 0・authorization.expired配信・二重解放なし）|デモパネル時計|合格|
|6|部分capture→残額解放→部分返金|E2E 1|—|合格|
|7|同capture並列・重複→1回|単体 `100並列の同一冪等キー…`、E2E 7（パネル）|—|合格|
|8|同残高から異なる注文へ同時支払い→超過禁止|単体 `残高10,000に対する8,000円…`、E2E 7（パネル）|—|合格|
|9|provider timeout後成功→照会復旧→二重計上なし|単体 worker `シナリオ9…timeout_success`、`provider成功後…`、process-recovery|デモパネル provider タブ|合格|
|10|Webhook500→自動再送→EC更新|E2E 3、単体 worker（500再送）|—|合格|
|11|Webhook重複・順序逆転→後退／二重発送なし|E2E 3（手動再送・発送1件）、単体 worker（同一event ID）|—|合格|
|12|加盟店出金失敗→保留解放|単体 `出金失敗は出金保留を解放`、`精算前返金→…出金失敗/成功…`|デモパネル decline|合格|
|13|出金後の返金原資不足→追加入金→返金|単体 `精算前返金→…追加入金で全額返金`|Portal操作|合格|
|14|定期課金失敗→同周期再試行、または同意撤回で停止|単体 `定期課金の周期一意性…`、`カード定期課金の拒否は…`|Portal操作|合格|
|15|can_pay制限→新規拒否、過去明細と返金受取は可|単体 `期限切れtoken…利用者制限後も返金受取`|運営者画面|合格|
|16|他加盟店・別workspaceアクセス→拒否|単体 `APIのCSRF・scope・IDOR…`、`…他加盟店のIDOR…`|—|合格|

## 17. テストと受け入れ条件（仕様17）

|必須自動テスト|テスト|状態|
|---|---|---|
|仕訳ごとの借貸一致、残高再計算一致|core `台帳から業務レコードまで照合…`、各テストの `reconciliation().ok`|合格|
|100並列同一キーcapture1回、別キーでも累計上限|core `100並列の同一冪等キー…`、`異なるキーの100並列capture…`|合格|
|残高10,000円に8,000円2件は両方成功しない|core `残高10,000に対する…`|合格|
|異なるキーの部分返金同時実行でcapture額超過なし|core `手数料返却なし・並列返金の予約上限…`、`処理中カード返金…`|合格|
|capture・void・期限切れ競合で二重解放なし|core `部分capture・void競合…`|合格|
|provider成功後・保存前停止からの照会回復|core `provider成功後…`、process-recovery（別プロセス停止）|合格|
|outbox commit後worker停止→再起動で配信回復|worker `outbox commit後の停止…`|合格|
|署名不一致・古い署名・重複・順序逆転・鍵更新|core `Webhook署名…`、worker、E2E 3|合格|
|期限切れtoken・失効secret・scope不足・IDOR・workspace越境・CSRF・URL検証|core `APIのCSRF…`、`期限切れtoken…`|合格|
|capture前後／精算前後／出金後の返金と原資不足|core `精算前返金→…`|合格|
|定期課金の周期重複・月末・同意撤回・再試行|core 3件|合格|
|SDKを使った別オリジンECで購入→部分返金までのE2E|E2E 1|合格|
|スマートフォン幅とデスクトップ幅|Playwright `desktop`／`mobile`（iPhone 13エミュレーション）|合格|

完成判定（仕様17）：クリーン環境での起動（Compose 18.6 + `verify:clean`）、各画面からのAPI呼出しとDB反映（E2E）、OpenAPIと実装の一致（`pnpm run openapi` 生成物をGit管理）、PlaygroundとSDK例の動作（自動テスト）、16シナリオの再現（上表）、静的に盛ったダッシュボードなし（集計は `/v1/merchant/reports` のSQL）。実際の実行結果は completion-report.md。

## 18. 文書・納品（仕様19）

|文書|状態|
|---|---|
|README.md、.env.example|最終状態へ更新|
|architecture／payment-lifecycle／ledger／api／api-endpoints／webhooks／integration-guide／demo-scenarios／security／implementation-status／decisions／portfolio|最終状態へ更新（変更点は completion-report を参照）|
|requirements-matrix（本書）、completion-report、final-review-guide|作成|

## 残件・制約（正直な区分）

- **未実施検証（環境）**：実iOS Safari・Edge以外の実ブラウザ（この環境はPlaywright管理Chromium 153）、包括的アクセシビリティ監査、負荷性能、外部侵入試験、公開配備。Windows PowerShellでの `curl.exe` 例はquote規則に基づく静的検証のみ（POSIX例は実行検証済み）。
- **範囲外**：実預金・送金・カード・KYC・メール送信、混合払い・FX・日割り、複数APIプロセスでの共有レート制限ストア。
- **手動確認のみ**：支払依頼リンク、加盟店プロフィール・設定変更、SINGLE_WORKSPACEモード、印刷用受領明細。いずれもAPI・DB経由で動作する実装があり、ダミー表示ではない。
