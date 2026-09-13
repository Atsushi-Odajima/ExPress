# 外部EC導入

`packages/sdk-server` と `packages/sdk-browser` はworkspaceパッケージ。外部レジストリ公開は不要。server SDKはサーバー専用のclient secretを保持し、ブラウザSDKへ渡さない。

```ts
import { ExPressClient } from '@exw/sdk-server';
const exw = new ExPressClient({
  baseUrl: process.env.EXW_API_URL!,
  clientId: process.env.EXW_CLIENT_ID!,
  clientSecret: process.env.EXW_CLIENT_SECRET!
});
const order = await exw.createOrder({
  merchant_order_id: 'SHOP-001',
  amount: {currency:'JPY',value:'12000'},
  items: [{name:'Sample',quantity:1,unit_amount:{currency:'JPY',value:'12000'}}]
}, 'SHOP-001:create');
const checkout = await exw.createCheckout({
  order_id: order.id,
  return_url: 'http://localhost:3001/return',
  cancel_url: 'http://localhost:3001/cancel'
}, 'SHOP-001:checkout');
```

```ts
import { ExPressCheckout } from '@exw/sdk-browser';
ExPressCheckout.configure(['http://localhost:3000']);
ExPressCheckout.redirect({checkoutUrl: checkout.checkout_url});
```

戻り先URLは加盟店設定と完全一致。ブラウザSDKは許可ExPress originとcheckout pathを検査する。popup補助はブロック時にredirectへフォールバックし、postMessageのorigin/source/nonceを検証する。メッセージ自体では支払済みとしない。

ECは戻り画面で「確認中」を表示し、サーバーで `getOrder` を呼び、総額・JPY・merchant ID・外部注文番号を照合する。即時販売なら `capture`、出荷時確定ならオーソリ状態で保留する。

```ts
await exw.capture(authorizationId,
  {amount:{currency:'JPY',value:'6000'},final_capture:false},
  'SHOP-001:shipment-1');
await exw.refund(captureId,
  {amount:{currency:'JPY',value:'1000'},reason:'Sample return'},
  'SHOP-001:return-1');
```

SDKはトークンを更新し、timeout/ExPressError/requestIdを返す。GETと冪等キー付きPOSTにのみ限定的再試行を行い、同じキーを維持する。再試行で別注文・別返金を生成しない。

NORTHSTARはカタログ5点をサーバーに持ち、ブラウザから価格を受け付けない。EC注文を保存後、SDKでExPress注文とチェックアウトを作成する。入力キーとハッシュでEC側も重複を防ぐ。各captureに対する発送は一意制約で1件。

ローカル接続はPortalの「サンプルECを開く」から行う。一度限りの短命コードをECサーバーが交換し、資格情報を暗号化して別DBへ保存する。URLやlocalStorageにclient secretを入れない。Cookie名も `exw_store_session` に分離する。
