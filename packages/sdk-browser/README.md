# ExPress browser SDK

```ts
import { ExPressCheckout } from '@exw/sdk-browser';
ExPressCheckout.configure(['http://localhost:3000']);
ExPressCheckout.redirect({checkoutUrl});
```

checkoutUrlはECサーバーがサーバーSDKから得た値。SDKは許可origin・checkout pathを検証する。API秘密鍵・Bearer tokenは引数に渡さない。

追加のpopup補助:

```ts
const cleanup = ExPressCheckout.popup({
  checkoutUrl,
  nonce: checkout.data.nonce,
  onReturn: () => refreshFromStoreServer()
});
// Component unmount: cleanup();
```

popupが開けなければredirect。メッセージはorigin・source・nonceを確認するが、決済成功を証明しない。ECサーバー照会を必ず行う。取消・期限切れ・結果不明はそれぞれ表示し、ブラウザが戻らなくても注文履歴から照会できるようにする。
