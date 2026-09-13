# REST API

実装から生成した [OpenAPI JSON](../packages/contracts/openapi/exw-v1.json) と、起動後の `/docs` を参照。`pnpm openapi` でFastifyに登録されたルートから再生成する。

[全エンドポイントのメソッド・パス・認証条件一覧](api-endpoints.md) も同じルート定義から生成する。APIと資料を別々に追加する運用にはしない。

## 認証

利用者・運営者はHttpOnly Cookie `exw_session`。変更には許可Originと `X-CSRF-Token` が必要。加盟店はclient_credentialsによる10分のBearerトークン、または加盟店所属を持つCookieセッション。

```sh
curl -X POST http://localhost:4000/v1/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"YOUR_CLIENT_ID","client_secret":"YOUR_SERVER_SECRET"}'
```

秘密鍵はハッシュ保存、一度だけ表示。署名鍵等、復号が必要な値は環境鍵で暗号化。資格情報のversion/statusを毎回検証するので、rotation/revoke後の既発行トークンも拒否する。

`orders:read/write`、`payments:read/write`、`refunds:write`、`webhooks:manage`、`balances:read`、`payouts:write`、`subscriptions:write`をルートで確認する。加盟店トークンは利用者の承認APIへ使用できない。

## 金額と冪等性

```json
{"merchant_order_id":"SHOP-001","amount":{"currency":"JPY","value":"12000"},"description":"ワイヤレスヘッドホン","items":[{"name":"ワイヤレスヘッドホン","quantity":1,"unit_amount":{"currency":"JPY","value":"12000"}}],"metadata":{"store_order_id":"demo_order_001"}}
```

商品明細の合計と注文金額をサーバーで一致検証する。金銭POSTは `Idempotency-Key`（8〜200文字）必須。scopeはworkspace、generation、認証主体、操作、対象、キー。入力を正規化してハッシュし、同じ内容なら保存済み結果、違えば409。キーはworkspace世代の保存期間中保持する。

非同期操作は202＋operation_id。返されたcapture/refund/payout ID、または利用者の一覧で状態を照会する。最初に保存した冪等結果は受付時の状態であり、最新状態は照会APIで取得する。タイムアウト時に別キーを発行しない。

利用者は `/v1/me/operations/{id}`、加盟店は `/v1/operations/{id}` で受付済み操作を照会できる。明細のcursorは同じ仕訳に複数勘定行がある場合も欠落しないよう `(created_at, line_id)` を使う。

## エラー

```json
{"error":{"code":"INSUFFICIENT_FUNDS","message":"利用可能残高が不足しています。","request_id":"req_example","details":[]}}
```

400 INVALID_REQUEST、401 UNAUTHENTICATED、403 FORBIDDEN/ACCOUNT_RESTRICTED、404 RESOURCE_NOT_FOUND、409 INVALID_STATE/EXPIRED/INSUFFICIENT_FUNDS/INSUFFICIENT_REFUND_FUNDS/CAPTURE_AMOUNT_EXCEEDED/REFUND_AMOUNT_EXCEEDED/IDEMPOTENCY_CONFLICT/PROVIDER_PENDING、429 RATE_LIMITED＋Retry-After。レスポンスに内部スタックや秘密鍵を返さない。

リストは `q` / `status` / `from` / `to` / `limit` / `cursor`。日時はUTC ISO 8601、moneyは文字列。`X-Request-ID`でAPIログを追跡する。明細は `format=csv` に対応し、数式として解釈されるセルをエスケープする。

## ルート群

加盟店契約は `/orders`、`/checkout-sessions`、`/authorizations/:id/capture|void`、`/captures/:id/refunds`、`/refunds/:id`、`/balances`、`/transactions`、`/payouts`、`/payment-links`、`/webhook-endpoints`、`/webhook-deliveries`、`/plans`、`/subscriptions`、`/disputes`。

利用者は `/me/*`、支払い承認は `/checkout/*`、運営者は `/admin/*`、デモ制御は `/demo/*`。全て `/v1` 配下。各メソッド・必須入力・scope・schemaはOpenAPIを正とする。

API Playgroundは選択した許可APIに実リクエストを送り、status/latency/request ID/response/curlを表示する。任意URLへのプロキシはない。
