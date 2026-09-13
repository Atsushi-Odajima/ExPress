# ポートフォリオ説明

ExPressは自作の決済デモ。実預金、実送金、カード発行、カードネットワークへのチャージバック、実際の本人確認審査は行っていない。決済事業者としての実運用実績・認証取得・取引件数・性能は主張しない。

## 説明できる実装上の事実

- PostgreSQLの複式台帳を正本にしたJPY整数金額処理。
- 同意、オーソリ、部分capture、返金予約、provider結果不明を分けるモデル。
- workspace/generationの境界、RBAC・scope、CSRF、資格情報失効。
- 独立worker、DB outbox、lease、HMAC Webhookと照会による回復。
- 別オリジン・別DBのサンプルEC、サーバーSDKとブラウザSDK。
- 100並列同一キーcapture、同時残高保護など本物のDBによるテスト（単体・DB統合・worker・SDK・Playground 39件、Playwright desktop/mobile 14件。実測は completion-report.md）。
- 運営者の注文timeline（配信・仕訳明細まで）、仕訳検索、理由付きの再送・再試行、加盟店の精算予定・請求周期履歴。
- API Playgroundが表示するcurl例は、POSIX shで実際に実行し同一注文を再現するテストで検証。

どの検証が合格したかは [completion-report.md](completion-report.md) と [requirements-matrix.md](requirements-matrix.md) を併記する。API/画面が存在することと、全例外経路を検証済みであることは区別する。

## 5分デモ

1. 0:00 ウォレット開始。サンプル残高とデモ表示を説明。
2. 0:40 NORTHSTARへ遷移、商品購入、ExPressで金額・店舗・支払元を確認。
3. 1:40 店舗がAPIで照会し売上確定。戻りURLだけで支払済みにしていない点を説明。
4. 2:30 加盟店で返金。手数料返却なしと原資確保を説明。
5. 3:30 運営者の台帳で借貸一致と残高再計算。provider/イベントを追跡。
6. 4:30 競合テストの結果と未検証範囲を明示。

## 15分デモ

5分版に加え、出荷時部分capture、final解放、返金原資不足から追加入金、Webhook500再送、provider成功後保存前停止、月末継続課金、can_pay制限、他workspace拒否を示す。すべてを15分で操作する場合は事前にシナリオごとの環境を用意し、サンプル生成であることを明記する。

## 撮影前チェック

テストの最新結果を確認。余計な個人情報を画面に出さない。秘密鍵一度表示の画面は撮影後すぐ失効する。公開していない環境・未実装項目を、完成した商用サービスとして説明しない。
