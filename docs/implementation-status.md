# ExPress 実装状況

2026-09-13 更新（完成作業）。前担当からの引き継ぎ後、既知の失敗2件の修正、要件照合で見つけた不足の実装、最終受入検証、文書整備を行った。実測値の正本は [completion-report.md](completion-report.md)、要件ごとの対応は [requirements-matrix.md](requirements-matrix.md)。

## 実装済み（要件対応表で検証状態を区分）

- 基盤：pnpm/TypeScript、独立Fastify、PostgreSQL、migration v1〜4、セッション/CSRF、通常ログイン、資格情報失効、workspace/generation、OpenAPI（実装から生成）。
- 台帳：JPY整数、変更不可の複式仕訳、残高再計算、業務レコード照合、冪等性（金銭POSTは必須、加盟店の非金銭変更は任意キーで再生・秘密は再表示しない）、チャージ、P2P、100並列capture・同時残高保護。
- 決済：注文/承認/オーソリ/capture/refund/provider attemptを分離、部分確定、残額解放、元支払元返金、返金予約と精算ロット、結果不明の照会回復（timeout_success・成功後停止）。
- EC連携：独立worker、永続outbox/lease/再送/dead-letter、鍵更新時の二重署名、型付きサーバーSDK、redirect/popup SDK、別オリジン・別権限DBのEC、重複排除と発送一意性、ECサーバー照会によるcapture（即時／出荷時）。
- 運営：精算/出金、役割/能力別制限、審査と監査、実売上の日次集計、台帳と業務レコード照合、調整仕訳/反対仕訳、注文timeline（配信・仕訳明細・ロット・案件・請求周期を含む）、仕訳検索、理由付きの通知再送・ジョブ再試行。
- 補助業務：支払リンク/QR、支払依頼、月額同意/請求周期/再試行/撤回（加盟店画面に再試行履歴）、案件メッセージ/許可デモ資料、通知送信箱、高額/連続失敗の審査、精算予定の表示。
- デモ/UI：隔離reset、業務時計、operation単位の模擬障害、worker停止/再開、100並列captureパネル（htmlFor/idによるラベル）、同時承認パネル、操作前後比較、Playground（POSIX／PowerShellのcurl例）、日英/ダーク/レスポンシブ、権限なし表示、署名検証例、静的資産のみPWA、検索/期間/cursor/CSV。

## 引き継ぎ後の変更点

1. 並列操作パネルE2E（PC/mobile）：`<label>` が `<select>` を内包していたため `getByLabel('オーソリ',{exact:true})` が一致しなかった。`htmlFor`/`id` で関連付け、テストは人物切替・パネル描画の完了を待つassertionを追加。両幅で合格。
2. Playground curl例：POST body・Content-Typeを追加、tokenは環境変数参照（二重引用符）、URL・キー・bodyをシェルごとに安全にquote、PowerShell（curl.exe）例を併記。表示例をshで実行して同一注文を再現するテストを追加。
3. 加盟店APIの非金銭変更に任意 `Idempotency-Key`、運営者の仕訳検索・通知再送・ジョブ再試行API、timeline拡張、加盟店概要の精算ロット・請求周期、Portalの権限なし状態、開発者ポータルの署名検証例。
4. テスト追加：Playground 2件、任意冪等キー／運営者API 1件、シナリオ3（残高不足→チャージ→再承認）1件、シナリオ9（timeout_success）1件。E2E 3をシナリオ1・4（即時確定・ECサーバー照会）に拡張、E2E 4に権限なし表示を追加。
5. Linux環境の起動：`pnpm-workspace.yaml` に `@embedded-postgres/linux-x64` を追加、CLOUD-STARTに実測手順を追記。

## 確認済み結果（この環境、Linux）

- `pnpm run typecheck`：合格。
- `pnpm run test`：39件合格・失敗0（PostgreSQL 18.6 Compose、通常worker停止、2026-09-13T07:18:51Z）。PostgreSQL 16.13でも38件時点で全件合格。
- `pnpm run verify:clean`、`pnpm run openapi`、`pnpm run build`、`pnpm run start`、`pnpm run test:e2e`（desktop/mobile 14件）：結果は [completion-report.md](completion-report.md) に日時付きで記録。
- Docker Compose：`docker compose up -d` でPostgreSQL 18.6が healthy、init SQLによるrole分離（exw_storeはexw DBへCONNECT不可）を確認。

## 制約・未実施検証

- JPYのみ。外部金融機関はMockProvider。実預金・送金・カード・KYC・メール送信は行わない。
- 公開配備、実iOS端末、Edge／Chromium以外の実ブラウザ（この環境はPlaywright管理Chromium 153）、包括的アクセシビリティ監査、負荷性能、外部侵入試験は未実施。PowerShellのcurl例はquote規則の静的検証のみ。
- workspace内の金銭操作は直列化。商用TPSや実運用の可用性を主張しない。複数APIプロセスの共有レート制限ストアは未実装。
- 主要明細CSVは最大10,000行まで期間を絞って取得。他の一覧CSVは表示ページを明示して出力する。
- デモ資料は固定の2テキストのみ。店舗ロゴは1〜4文字の独自マーク。利用者入力の名称・メモは機械翻訳しない。

## 再開手順（保守時）

1. [CLOUD-START.md](CLOUD-START.md) 第7節または README に従い、Node 24・pnpm・DB（Compose推奨）を用意。
2. `pnpm run db:migrate` → `pnpm run dev`。テストは通常workerを止めて `pnpm run test`、E2Eは4サービス起動後に `pnpm run test:e2e`。
3. 変更時は `pnpm run openapi` でOpenAPIとエンドポイント一覧を再生成し、requirements-matrix と completion-report の該当行を更新する。
