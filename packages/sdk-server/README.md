# ExPress server SDK

サーバー専用。秘密鍵をブラウザbundle・localStorageへ渡さない。

```ts
import { ExPressClient, ExPressError, verifyWebhook } from '@exw/sdk-server';
const client = new ExPressClient({
  baseUrl: process.env.EXW_API_URL!,
  clientId: process.env.EXW_CLIENT_ID!,
  clientSecret: process.env.EXW_CLIENT_SECRET!,
  timeoutMs: 5000
});
const order = await client.createOrder({
  merchant_order_id: 'SHOP-001',
  amount: {currency:'JPY',value:'1000'},
  items: [{name:'Sample',quantity:1,unit_amount:{currency:'JPY',value:'1000'}}]
}, 'SHOP-001:order');
const checkout = await client.createCheckout({order_id:order.id,
  return_url:'http://localhost:3001/return',cancel_url:'http://localhost:3001/cancel'
}, 'SHOP-001:checkout');
```

同じ冪等キーを再試行に使う。GETとキー付きPOSTだけ最大2回再試行する。例外は `code/status/requestId` を持つ。tokenは期限前に更新し、401で一度取り直す。createOrder/createCheckout/getOrder/capture/void/refund/requestを提供。

getCheckout/getAuthorization/getCapture/getRefundで個別の非同期結果を照会できる。注文・チェックアウト・capture・refundの入力と応答はTypeScript型をexportする。金額のvalue/amountは10進整数文字列。型だけで認可・金額検証を代用せず、APIで再検証する。

Webhookはraw bodyとヘッダーを `verifyWebhook` に渡す。許容時刻5分、定時間比較、新旧鍵配列。重複排除と最新状態照会は受信側の永続ストアで行う。

実行可能例は `examples/checkout.ts`。DB統合テストからHTTPサーバーを立てて、この例を実行する。ワークスペースではTypeScriptソースをtsx経由で利用し、`pnpm build:server` でJS/宣言を `dist/packages/sdk-server/` に生成する。
