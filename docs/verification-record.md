# 移管前の検証記録

元Windows環境の保存済みログを2026-09-13に再確認して転記。クラウドで実行した結果ではありません。生ログは`.local`、スクリーンショット／traceは`test-results`にあり、秘密情報混入を避けるためGitへ入れません。

|対象|結果|
|---|---|
|Node／DB|Node 24.16.0、PostgreSQL 18.4（embedded-postgres経由の実DB）|
|pnpm run typecheck|合格の実行記録あり|
|pnpm run test|33 tests / 33 pass / 0 fail / 0 skipped、42,272ms|
|pnpm run build|server tsc／Next production build合格|
|pnpm run start|API・worker・EC・Portal起動を確認|
|pnpm run verify:clean|新規DBへmigration2回・seed・HTTP SDK決済／返金・台帳照合・ECの台帳DB接続拒否に合格|
|pnpm run test:e2e|14件中12 passed / 2 failed、4.6分|
|Docker Compose、Linuxブラウザ|未実施|

## E2E合格

以下がWindows Edge desktop／iPhone13幅のエミュレーション各1回、計12件合格。

1. 別オリジンSDK購入 → 一部出荷 → 部分返金。
2. 英語切替・加盟店検索・共有QR・運営者の能力別設定。
3. WebhookでECが支払済みに収束、500再送・鍵更新・重複・順序逆転で二重発送なし。
4. 加盟店・運営者・PWA・ダークモード。
5. 模擬カード直接払いと元カード返金、英語ECでも財布は増減しない。
6. Playgroundで実注文作成・APIログ・管理者の調整仕訳と反対仕訳。

## E2E失敗（両幅で同じ箇所）

`tests/e2e/payment.spec.ts:75`：「デモパネルの同時承認で過剰使用を防ぎ、100重複captureが1回になる」。

```text
Test timeout of 90000ms exceeded.
Error: locator.selectOption: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByLabel('オーソリ', { exact: true })
tests/e2e/payment.spec.ts:80:137
```

前段の同時承認でINSUFFICIENT_FUNDS／残高6000の検査は通過。失敗時snapshotには「100並列の売上確定を試す」、combobox「オーソリ」、初期optionと24,000 JPYの有効option、「内容を確認」disabledが存在。label解決やrole切替後遷移の診断は未完了。失敗をtimeout延長だけで隠さないこと。

## 33件の範囲

テストの最新名称・実装は`tests/*.test.ts`を正とする。金額／台帳／並列冪等性／残高保護／返金予約／capture・void・expiry競合、認証／scope／越境／CSRF／URL、請求周期／再試行／撤回、provider成功後の独立プロセス停止回復、outbox／lease／署名／500再送／dead-letter、SDK等を検査。

直近合格ケースには、管理者反対仕訳・案件資料認可、カードauth後の加盟店制限からの回復、連続失敗リスク、開発者のscope超過鍵発行／更新拒否、429／Retry-Afterと主体分離、精算前返金→出金失敗／成功→返金原資不足→追加入金、削除済みカードの新規課金禁止が含まれる。

この移管はソース共有が目的で、上記失敗のアプリ修正は行っていない。引き継ぎ後に実行した結果は別日付で追記し、元の記録を成功に書き換えないこと。
