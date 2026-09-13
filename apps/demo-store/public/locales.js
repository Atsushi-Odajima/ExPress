const pairs=`ExPress サンプルEC · デモ・実際のお金は動きません|ExPress sample store · Demo · No real money moves
デモ・実際のお金は動きません|Demo · No real money moves
ショッピングバッグ|Shopping bag
売上確定のタイミング|Capture timing
即時売上確定|Immediate capture
出荷時に部分売上確定|Partial capture on shipment
次の画面で、支払先・金額・支払元を確認します。|Review the merchant, amount and payment source on the next screen.
ExPressで支払う|Pay with ExPress
バッグに追加|Add to bag
数量|Quantity
削除|Remove
合計|Total
閉じる|Close
ExPressで「サンプルECを開く」を選んで接続してください。|Connect from ExPress using Open sample store.
お支払いを確認しています。|Verifying your payment.
店舗サーバーがExPressの決済情報を照会しています。|The store server is checking the payment with ExPress.
購入履歴から再確認|Check again in order history
お支払いをキャンセルしました。|Payment cancelled.
決済の最終状態は購入履歴から確認できます。|Check the final payment status in order history.
購入履歴|Order history
ExPressからサンプルECに接続してください。|Connect to this sample store from ExPress.
ExPressを開く|Open ExPress
サンプル商品の購入・一部出荷・返品を確認できます。|Review sample purchases, partial shipments and returns.
購入はまだありません。|No purchases yet.
通知の失敗を再現|Simulate a delivery failure
次のWebhookを500で拒否し、ExPressの自動再送を確認します。|Reject the next webhook with HTTP 500 and observe ExPress retry it.
次の1回を500にする|Return 500 once
次の1回の通知を拒否する設定を保存しました。|The next notification will be rejected once.
Webhook署名鍵を更新|Rotate webhook key
署名鍵を受信側にも保存しました。|The receiver has saved the rotated signing key.
商品が見つかりません|Product not found
商品一覧|All products
サンプル商品です。実際には発送されません。|Sample product. No real item will be shipped.
好きなものと、|Things you love.
心地よい毎日を。|Every day, a little better.
音を楽しむ。考えを綴る。ひと息つく。|Listen. Write. Take a breath.
あなたの日常に寄り添う、小さな道具たち。|Thoughtful little tools for your everyday life.
コレクションを見る|Explore the collection
ご注文の詳細|Your order details
売上確定|Captured
返金済|Refunded
返金|Refund
発送処理|Shipments
件（captureごとに1回）| (one per capture)
ExPressに照会して更新|Query ExPress for updates
支払元を選び直す|Choose another payment source
一部出荷・売上確定|Partial shipment and capture
この金額を確定し、対応するサンプル発送を作成します。|Capture this amount and create the corresponding sample shipment.
確定金額（円）|Capture amount (JPY)
最終売上確定として未使用分を解放する|Final capture: release the unused remainder
この金額で出荷・確定|Ship and capture this amount
返品・部分返金|Return and partial refund
元の支払元への返金金額（円）|Refund amount to original source (JPY)
サンプル商品の返品|Return of a sample product
この金額の返金を依頼|Request this refund amount
円を売上確定します。よろしいですか？| JPY will be captured. Continue?
円を元の支払元に返金します。よろしいですか？| JPY will be refunded to the original source. Continue?
ワイヤレスヘッドホン|Wireless headphones
メカニカルキーボード|Mechanical keyboard
ポータブルスピーカー|Portable speaker
ワイヤレス充電器|Wireless charger
ワイヤレスマウス|Wireless mouse
静けさと、あなたの好きな音。毎日に寄り添う架空のワイヤレスヘッドホン。|Quiet moments and the sounds you love. Fictional wireless headphones for every day.
書く時間を、もっと心地よく。コンパクトな架空のキーボード。|Make writing feel better. A compact fictional keyboard.
小さなボディに広がる音。架空のポータブルスピーカー。|Room-filling sound in a small body. A fictional portable speaker.
デスクの上をすっきりと。架空のワイヤレス充電器。|Keep your desk clear. A fictional wireless charger.
手のひらになじむ、やわらかな形。架空のワイヤレスマウス。|A soft shape that fits your hand. A fictional wireless mouse.
日常を、少し心地よく。|Make every day feel a little better.
ExPressとの別オリジン決済デモ|Separate-origin payment demo with ExPress
読み込み中…|Loading…
処理に失敗しました|The operation failed
商品|Products
バッグ|Bag
注文|Order
金額|Amount
状態|Status
詳細|Details
確定|Captured
理由|Reason`;
const translations=pairs.split('\n').map(line=>{const i=line.indexOf('|');return [line.slice(0,i),line.slice(i+1)];}).sort((a,b)=>b[0].length-a[0].length);
export const language=localStorage.getItem('northstar-language')??'ja';
export function localizeHTML(value){if(language!=='en')return value;let result=String(value);for(const [ja,en] of translations)result=result.replaceAll(ja,en);return result;}
export function setupLocale(){document.documentElement.lang=language;document.body.innerHTML=localizeHTML(document.body.innerHTML);const nav=document.querySelector('nav'),button=document.createElement('button');button.className='outline';button.textContent=language==='en'?'日本語':'EN';button.setAttribute('aria-label','Language');button.onclick=()=>{localStorage.setItem('northstar-language',language==='en'?'ja':'en');location.reload();};nav.append(button);const theme=document.createElement('button');theme.className='outline';theme.textContent='◐';theme.setAttribute('aria-label',language==='en'?'Toggle dark mode':'ダークモード切替');theme.onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';localStorage.setItem('northstar-theme',document.documentElement.dataset.theme);};nav.append(theme);document.documentElement.dataset.theme=localStorage.getItem('northstar-theme')??'light';}
