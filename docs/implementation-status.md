# ExPress 実装状況

2026-09-13 更新。主要実装の受入検証途中で、ユーザーの別プロジェクト移行依頼により改修を停止。[引き継ぎ全文](HANDOFF.md)に実装範囲・検証・残項目・再開手順を保存。全必須要件の完成宣言はまだ行っていない。

## 実装済み

- 基盤：pnpm/TypeScript、独立Fastify、PostgreSQL、migration v1〜4、セッション/CSRF、通常ログイン、資格情報失効、workspace/generation、OpenAPI。
- 台帳：JPY整数、変更不可の複式仕訳、残高再計算、冪等性、チャージ、P2P、100並列capture・同時残高保護。
- 決済：注文/承認/オーソリ/capture/refund/provider attemptを分離、部分確定、残額解放、元支払元返金、返金予約と精算ロット、カード結果不明の復旧。
- EC連携：独立worker、永続outbox/lease/再送、鍵更新時の二重署名、型付きサーバーSDK、redirect/popup SDK、別オリジン・別権限DBのEC、重複排除と発送一意性。
- 運営：精算/出金、役割/能力別制限、審査と監査、実売上の日次集計、台帳と業務レコード照合、調整仕訳/反対仕訳、注文タイムライン。
- 補助業務：支払リンク/QR、支払依頼、月額同意/請求周期/再試行/撤回、案件メッセージ/許可デモ資料、通知送信箱、高額/連続失敗の審査。
- デモ/UI：隔離reset、業務時計、operation単位の模擬障害、worker停止/再開、100並列captureパネル、操作前後比較、Playground、日英/ダーク/レスポンシブ、静的資産のみPWA、検索/期間/cursor/CSV。

## 確認済み結果

- pnpm run typecheck：合格。
- pnpm run test：33件合格、失敗0。ログは .local/test-latest.log。
- pnpm run build：サーバーTypeScriptとNext production build合格。
- pnpm run start：ビルド済みAPI/worker/EC/Portalの4プロセス起動確認。
- 最新Playwrightはdesktop/mobile合計14件中12件合格・2件失敗。購入→部分確定/解放→部分返金、英語保持/QR/検索、Webhook 500/再送/鍵更新/重複/順序逆転、運営者・PWA・ダーク、英語ECのカード直接払い/元カード返金、Playground実注文/管理者反対仕訳が両幅で合格。
- pnpm run verify:clean：新規の空DBへmigrationを2回実行、seed、HTTP SDKで注文→承認→capture→部分返金、台帳照合、EC資格情報のExPress DB接続拒否を確認。新規作成した検証用DBだけ終了時に削除。
- 独立workerプロセスをprovider成功後・業務結果保存前に終了し、別プロセスで1回だけ記帳する試験合格。
- UIスクリーンショットをdesktop/mobileで保存・確認。test-resultsはGit対象外。

## 受入残項目

1. 並列操作パネルE2EのPC/mobile 2件が、tests/e2e/payment.spec.ts:80のgetByLabel('オーソリ', {exact:true}).selectOptionでtimeout。前段の2注文同時承認と残高保護はassertion通過。snapshotにはselectと有効optionが存在。label解決または画面遷移の診断が必要で、原因・修正は未確定。100並列captureのAPI/DB試験自体は合格済み。
2. Playgroundのcurl表示例にPOST body/Content-Typeがなく、単一引用符内のアクセストークン変数がPOSIX shellで展開されない。実API実行は動作。apps/api/src/app.ts:156付近の提示文字列を修正する。
3. 一覧・日英・16シナリオの最終照合。同時承認/100並列パネルは追加済みだが上記UI検証が残る。運営timelineの配信詳細導線など、仕様網羅性レビューも未完了。
4. OpenAPI再生成とSDK追加照会の型検査は実施済み。Docker Desktopが未導入のためComposeによるクリーン起動は未実施。検証したDBはPostgreSQL 18.4、Composeは18.6指定。

## 制約・未実施検証

- JPYのみ。外部金融機関はMockProvider。実預金・送金・カード・KYC・メール送信は行わない。
- 公開配備、実iOS端末、他ブラウザ、包括的アクセシビリティ監査、負荷性能、外部侵入試験は未実施。Windows Edgeのdesktop/iPhone13幅のエミュレーションで検証。
- workspace内の金銭操作は直列化。商用TPSや実運用の可用性を主張しない。
- 主要明細CSVは最大10,000行まで期間を絞って取得。他の一覧CSVは表示ページを明示して出力する。
- デモ資料は固定の2テキストのみ。実資料アップロードはない。店舗ロゴは1〜4文字の独自マーク設定。
- 利用者が入力した日本語の名称・メモは機械翻訳しない。

## 再開手順

1. このファイル、docs/decisions.md、git statusを確認。Git接続先はAtsushi-Odajima/ExPress、main。
2. pnpm run db:localを別ターミナルで起動（またはDocker）、pnpm run db:migrate。
3. pnpm run testは独立worker停止中に実行。pnpm run build → pnpm run start → 別ターミナルでpnpm run test:e2e。
4. このPCのURL：Portal http://localhost:3100、EC http://localhost:3001、API http://localhost:4000。標準3000は他アプリ使用中。.env/.localはGit対象外。
5. 残存プロセスは.local/dev-processes.jsonのPIDと実プロセスを照合し、ExPressのものだけを停止。他のNodeアプリを停止しない。

初回引き継ぎではコードが未コミット・未pushだったためクラウドに届かなかった。ユーザーの追加依頼により、実装・仕様原文・引き継ぎ資料をcommit `c47113f`でGitHub mainへpushし、別cloneで107ファイルと原仕様の一致を検証済み。[移管記録](TRANSFER-VERIFIED.md)、[取得手順](CLOUD-START.md)、[仕様原文](SPECIFICATION.md)、[元PCの試験要約](verification-record.md)を参照。Windowsパスや元PCの秘密鍵は不要。アプリ公開・実課金・外部メール送信・有料契約は実施しない。

移管時の変更：Linux/macOSでPlaywrightの既定を管理Chromiumにし、PLAYWRIGHT_CHANNELで変更可能にした。Windowsの既定Edgeは維持。Linuxブラウザ実行は未検証。既知のアプリ不具合2件とcurl表示の修正は次担当に残っている。
