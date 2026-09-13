# APIエンドポイント一覧

Fastifyの登録ルートから `pnpm run openapi` で生成。入力・応答schemaと認証条件の詳細は [OpenAPI](../packages/contracts/openapi/exw-v1.json) を参照。

|Method|Path|内容・条件|
|---|---|---|
|GET|`/v1/health`|稼働確認|
|GET|`/v1/openapi.json`|OpenAPI|
|POST|`/v1/demo/start`|隔離デモを開始|
|GET|`/v1/session`|現在のセッション Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/demo/switch`|デモ人物へ切替 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/demo/reset`|現在のデモだけを再生成 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/auth/register`|デモ利用者を登録 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/auth/login`|パスワードでログイン|
|POST|`/v1/auth/logout`|ログアウト Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/sessions/revoke-others`|他の端末をログアウト Session mutations require exact Origin and X-CSRF-Token.|
|PATCH|`/v1/me/profile`|プロフィール設定 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/verification`|模擬本人確認を提出 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/overview`|ウォレット概要 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/balances`|ウォレット残高 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/transactions`|利用者の明細 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/topups`|模擬チャージ Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/topups`|利用者 topups 一覧 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/transfers`|利用者間送金 Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/transfers`|利用者 transfers 一覧 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/payouts`|模擬銀行出金 Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/payouts`|利用者 payouts 一覧 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/notifications`|利用者 notifications 一覧 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/notifications/{id}/read`|通知を既読にする Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/payment-methods`|模擬支払手段を登録 Session mutations require exact Origin and X-CSRF-Token.|
|DELETE|`/v1/me/payment-methods/{id}`|支払手段の新規利用を停止 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/payment-methods/{id}/default`|既定の支払手段 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/payment-requests`|支払依頼リンクを作成 Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/payment-requests/{id}/approve`|支払依頼に支払う Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/payment-requests/{id}/cancel`|支払依頼を取消 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/subscriptions/{id}/consent`|月額課金に同意 Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/subscriptions/{id}/cancel`|継続課金の同意を撤回 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/disputes`|返金・購入トラブル申告 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/me/disputes/{id}/messages`|案件メッセージ Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/checkout/{id}`|支払内容を確認・セッション束縛 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/checkout/{id}/approve`|利用者の支払承認 Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/checkout/{id}/cancel`|チェックアウトを取消 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/oauth/token`|client_credentials トークン|
|POST|`/v1/orders`|決済注文の作成 Required scope: orders:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/orders`|決済注文一覧 Required scope: orders:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/orders/{id}`|注文と各決済の詳細 Required scope: orders:read. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/orders/{id}/cancel`|未処理注文を取消 Required scope: orders:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/checkout-sessions`|承認セッションを作成 Required scope: orders:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/checkout-sessions/{id}`|checkout-sessions 詳細 Required scope: payments:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/authorizations/{id}`|authorizations 詳細 Required scope: payments:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/captures/{id}`|captures 詳細 Required scope: payments:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/refunds/{id}`|refunds 詳細 Required scope: payments:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/payouts/{id}`|payouts 詳細 Required scope: payments:read. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/authorizations/{id}/capture`|全額・部分売上確定 Required scope: payments:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/authorizations/{id}/void`|未確定残額を解放 Required scope: payments:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/captures/{id}/refunds`|元支払元へ全額・部分返金 Required scope: refunds:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/balances`|加盟店残高 Required scope: balances:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/transactions`|加盟店明細・CSV Required scope: balances:read. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/payouts`|加盟店模擬出金 Required scope: payouts:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/payouts`|payouts 一覧 Required scope: payouts:write. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/merchant/topups`|加盟店の模擬追加入金 Required scope: payouts:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/merchant/overview`|加盟店業務概要 Session mutations require exact Origin and X-CSRF-Token.|
|PATCH|`/v1/merchant/profile`|店舗プロフィール・出金先設定 Allowed roles: owner. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|PATCH|`/v1/merchant/return-urls`|戻り先URL登録 Allowed roles: owner, developer. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/merchant/applications`|加盟店アプリの登録 Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/merchant/applications/{id}/rotate`|API秘密鍵 rotate Allowed roles: owner, developer. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/merchant/applications/{id}/revoke`|API秘密鍵 revoke Allowed roles: owner, developer. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/payment-links`|固定金額支払リンク Required scope: orders:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/payment-links`|支払リンク一覧 Required scope: orders:read. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/payment-links/{id}/deactivate`|支払リンク無効化 Required scope: orders:write. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/checkout/payment-links/{id}/open`|支払リンクの確認画面を開く Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/webhook-endpoints`|Webhook通知先登録 Required scope: webhooks:manage. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/webhook-endpoints`|webhook-endpoints 一覧 Required scope: webhooks:manage. Session mutations require exact Origin and X-CSRF-Token.|
|PATCH|`/v1/webhook-endpoints/{id}`|Webhook通知先更新 Required scope: webhooks:manage. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|DELETE|`/v1/webhook-endpoints/{id}`|Webhook通知停止 Required scope: webhooks:manage. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/webhook-endpoints/{id}/rotate-secret`|署名鍵更新・旧鍵は24時間移行 Required scope: webhooks:manage. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/webhook-endpoints/{id}/test`|テスト通知 Required scope: webhooks:manage. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/webhook-deliveries/{id}/retry`|同一イベントを再配信 Required scope: webhooks:manage. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/plans`|月額JPYプラン Required scope: subscriptions:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/plans`|plans 一覧 Required scope: subscriptions:write. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/subscriptions`|同意待ち購読を作成 Required scope: subscriptions:write. Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/subscriptions`|subscriptions 一覧 Required scope: subscriptions:write. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/subscriptions/{id}/pause`|購読 pause Required scope: subscriptions:write. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/subscriptions/{id}/resume`|購読 resume Required scope: subscriptions:write. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/subscriptions/{id}/cancel`|購読 cancel Required scope: subscriptions:write. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/disputes/{id}/messages`|購入案件に回答 Required scope: payments:read. Allowed roles: owner, support, finance, api. Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/disputes/{id}/messages`|案件メッセージ履歴 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/webhook-deliveries`|webhook-deliveries 一覧 Required scope: webhooks:manage. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/disputes`|disputes 一覧 Required scope: payments:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/admin/overview`|運営調査の概要 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/admin/search`|横断検索 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/admin/ledger`|台帳整合性レポート Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/admin/accounts/{id}/review`|模擬審査・能力別制限 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/admin/adjustments`|理由と対向勘定を伴う調整仕訳 Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|PATCH|`/v1/admin/settings`|模擬手数料・上限の設定 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/admin/risk-reviews/{id}/resolve`|手動審査の記録 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/admin/disputes/{id}/resolve`|購入トラブルを仲介 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/demo/clock`|workspace業務時計を進める Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/demo/inspect`|現在のデモ処理を調査 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/demo/scenarios`|特定operationの模擬結果を設定 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/demo/store-handoff`|サンプルECへの一度限りの接続コード Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/demo/claim-store`|ECサーバーが接続コードを交換|
|POST|`/v1/merchant/playground`|許可されたAPIをデモ資格情報で実行|
|POST|`/v1/admin/disputes/{id}/messages`|案件への仲介メッセージとデモ資料 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/disputes/{id}/materials/{filename}`|案件に添付された許可デモ資料 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/admin/journals/{id}`|仕訳と勘定の詳細 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/records/{table}`|利用者の一覧を検索・ページング Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/merchant/records/{table}`|加盟店の一覧を検索・ページング Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/payment-requests/{id}`|支払依頼リンクの内容 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/me/operations/{id}`|受付済み操作を照会 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/operations/{id}`|受付済み操作を照会 Required scope: payments:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/merchant/reports`|期間内の日次売上・返金・手数料 Required scope: balances:read. Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/admin/timeline/{id}`|注文から台帳・通知まで追跡 Session mutations require exact Origin and X-CSRF-Token.|
|GET|`/v1/admin/journals`|仕訳の検索・cursorページング Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/admin/webhook-deliveries/{id}/retry`|運営者による通知の再配信（理由を監査） Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/admin/jobs/{id}/retry`|失敗ジョブの再試行（理由を監査） Idempotency-Key optional: the same key with the same input replays the stored result; one-time secrets are not repeated. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/admin/journals/{id}/reverse`|調整仕訳を参照付き反対仕訳で訂正 Idempotency-Key required. A pending response is 202; poll operation_id. Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/demo/worker`|現在のworkspaceのジョブ取得を一時停止・再開 Session mutations require exact Origin and X-CSRF-Token.|
|POST|`/v1/demo/jobs/{id}/retry`|失敗ジョブを再試行 Session mutations require exact Origin and X-CSRF-Token.|
