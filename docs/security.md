# セキュリティとデモ境界

## 認証・認可

- パスワードはランダムsalt＋scrypt。セッションはランダムトークンのSHA-256を保存、HttpOnly/SameSite=Lax、HTTPS設定ではSecure。
- 金銭変更はCSRFトークンと完全一致Originを検証。CORSは設定されたPortal/EC originだけ。
- user/sessionとmerchant/API tokenを分離。各ルートにrole・scope・merchant所有権・利用者所有権を確認。
- API秘密鍵のハッシュ、資格情報version/status、トークンexpiryを毎回確認。ログへbody・認証ヘッダーを保存しない。
- アプリのscopeは作成者のscopeの部分集合。自分にないscopeを持つアプリの鍵更新による権限取得も拒否する。
- KYCは状態だけの模擬審査。PAN/CVV/実本人確認書類の入力欄や保存先を用意しない。

## workspace境界

認証情報からworkspace/generationを導出する。リソースIDを知っていても、別workspace・別加盟店の照会は404。主要金融関連はworkspace/generationを含む複合外部キー。resetは現在のworkspaceのgenerationを更新し、旧セッション・ジョブ・通知を無効化する。台帳は削除しない。

ロール切替は事前生成した人物だけ。利用者の任意admin昇格APIはない。全機能が隔離されたデモ用で、通常の実金融アカウントへの裏口として配備しない。

## 制限マトリクス

|能力|拒否する操作|引き続き可能な操作|
|---|---|---|
|can_pay=false|新規承認、P2P送金、新規定期請求|閲覧、元支払元への返金受取、同意撤回|
|can_receive=false|チャージ、送金受取、新規加盟店注文|閲覧、過去取引の返金処理（can_refundによる）|
|can_payout=false|新規出金|閲覧、保留中出金の結果回復|
|can_refund=false|加盟店からの新規返金予約|閲覧、予約済み返金の結果回復|
|can_capture=false|既存オーソリからの新規capture|閲覧、未使用オーソリ解放|

利用者のcan_payを止めても、既存承認に対する加盟店captureは加盟店can_captureが有効なら許可する。結果不明のプロバイダー操作は制限状態に関わらず照会・解決し、保留資金を不整合なまま放置しない。

Portalは必要scopeを満たさないrole（例：read_onlyの出金画面・開発者ポータル）に「権限なし」を表示し、操作ボタンを描画しない。APIは画面に関係なくscope・roleで拒否する。任意Idempotency-Keyの再送応答から一度表示の秘密（client_secret／webhook_secret）を除外する。

加盟店role：ownerは全scope、developerは注文/開発者管理/購読設定、financeは確定/返金/残高/出金、supportは照会/返金/案件、read_onlyは読取。詳細は `security.ts` のroleScopesを参照。

## 公開前の確認

公開・実資金運用は本作業の対象外。公開デモを配備する前に、HTTPS・公開origin、ランダムな環境鍵、管理者固定Webhook許可リスト、ネットワークACL、DB最小権限、保存期間と削除手順、監視、依存監査を確認する。localhost固定パスワードは公開環境で使用しない。複数APIプロセスでの共有レート制限、包括的なアクセシビリティ・セキュリティ試験は実装状況に残す。

入口にはIP単位の3,000/分、ログイン等には20/分、認証後はworkspace/generation/主体単位の300/分の制限を置く。認証前の任意Cookie文字列をレート制限の主体として信用しない。429とRetry-Afterを検証する自動テストがある。

カード削除は新規利用停止。新しい継続課金も開始しない。既に受け付けた外部処理の結果照会と、削除前の元トークンへの返金は継続する。
