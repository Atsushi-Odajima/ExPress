# 元担当向け 最終確認ガイド

完成版を短時間で確認するための入口です。数値・日時の正本は [completion-report.md](completion-report.md)、要件ごとの対応は [requirements-matrix.md](requirements-matrix.md)。

## 1. 完成品の所在と起動

- GitHub `https://github.com/Atsushi-Odajima/ExPress`、ブランチ `claude/express-completion-delivery-e92pt1`（実装コミット `1f1d5746b173`、詳細は completion-report）。`main` は移管時点（`430d918`）のままで、完成版は上記ブランチにあります。
- 起動は README の手順（`cp .env.example .env` → `pnpm install --frozen-lockfile` → `docker compose up -d` → `pnpm run db:migrate` → `pnpm run db:seed` → `pnpm run dev`）。Linux での実測手順は [CLOUD-START.md](CLOUD-START.md) 第7節。
- URL：Portal http://localhost:3000、NORTHSTAR EC http://localhost:3001、API http://localhost:4000（Swagger UI は `/docs`）。

## 2. 5分デモ（決済1件が API・DB・台帳・EC まで通ること）

1. `http://localhost:3000` →「デモウォレットをはじめる」。利用可能残高 30,000 円（サンプル）とデモ表示を確認。
2. 左下「サンプルECを開く」→ NORTHSTAR。`Studio One` を開き「バッグに追加」→ バッグで数量 2、売上確定のタイミング「出荷時に部分売上確定」→「ExPressで支払う」。
3. ホスト型チェックアウト：店舗・24,000 円・支払元（ウォレット）を確認、模擬追加認証にチェック →「この内容で支払いを承認」→ 内容を確認 → 確認して実行 →「店舗に戻って確認する」。EC の戻り画面は「確認中」を経てサーバー照会で `authorized` になる（URL パラメーターでは支払済みにしない）。
4. EC の注文詳細：一部出荷・売上確定に 12000、最終売上確定にチェック → `partially_paid`、発送処理 1 件。返品・部分返金に 1000 → `partially_refunded`。
5. Portal に戻り人物を `NORTHSTAR STORE / owner` へ切替 → 加盟店ダッシュボード：日次売上（実データ集計）、決済一覧の「詳細」でオーソリ・capture・返金の内訳、出金画面の「精算予定（未精算ロット）」。
6. 人物を `運営デモ担当` へ →「台帳・整合性」：借貸・残高一致の検査 OK、業務レコードとの照合、注文 ID で「注文を追跡」（timeline に配信・仕訳明細まで並ぶ）。

期待される数値：利用者の利用可能残高は 30,000 → 承認で 6,000（24,000 保留）→ 最終確定で未使用 12,000 が解放されて 18,000 → 1,000 返金で 19,000。加盟店は手数料 3%+30 円を差し引いた純額が未精算 → 精算待機（既定 60 秒）後に利用可能へ移動。

## 3. 15分デモ（障害・回復・認可）

7. デモ操作パネル（左下）：利用者で「同じ残高から2件を同時承認」に EC で作った 2 件の checkout URL を入力 → 内容を確認 → 同意 → 両方を同時承認 → 片方が `INSUFFICIENT_FUNDS`、`ledger_ok: true`。
8. 加盟店へ切替 → デモ操作パネル「100並列の売上確定を試す」：オーソリを選び、同じ冪等キーで実行 → `unique_captures: 1`。
9. EC 購入履歴「次の1回を500にする」→ 購入 → 開発者ポータル Webhook タブの配信履歴に失敗と再送成功。古い通知を「再送」しても発送件数は増えない。
10. デモ操作パネル「ジョブ取得を一時停止」→ ウォレットでチャージ → 「模擬プロバイダー」タブで対象 operation に「タイムアウト後成功」を設定 → 「ジョブ取得を再開」→ 結果不明から照会で成功、残高は 1 回だけ増える。
11. 加盟店：定期課金でプランと同意待ち購読を作成 → 利用者が同意 → 残高不足にして業務時計を 1 日進める → 加盟店画面「請求周期と再試行履歴」に同一周期の再試行。
12. 運営者：利用者・加盟店 → 審査・制限で `新規支払い` だけを外す → 利用者は新規承認が拒否され、過去明細と返金受取は可能。
13. 人物を `NORTHSTAR STORE / read_only` へ → 出金画面・開発者ポータルに「この画面を利用する権限がありません」（必要 scope を表示、操作ボタンなし）。
14. 開発者ポータル Playground：POST /v1/orders を実行 → request ID・latency・response と、POSIX / PowerShell の curl 例（token は環境変数参照、body と Content-Type を含む）。

## 4. 引き継ぎ後の変更点

|区分|内容|主なファイル|
|---|---|---|
|既知の失敗1|並列操作パネル E2E：label が select を内包し `getByLabel(exact)` が一致しなかった → `htmlFor`/`id` に修正、人物切替とパネル描画の完了待ちを追加|`apps/portal/components/concurrency-lab.tsx`、`tests/e2e/payment.spec.ts`|
|既知の失敗2|Playground curl 例：body・Content-Type、環境変数の二重引用符、シェルごとの quote、PowerShell 例、応答 schema|`apps/api/src/playground.ts`、`apps/api/src/app.ts`、`apps/portal/components/workspaces.tsx`、`tests/playground.test.ts`|
|API|加盟店の非金銭変更に任意 Idempotency-Key（秘密は再表示しない）、`/v1/admin/journals`、`/v1/admin/webhook-deliveries/:id/retry`、`/v1/admin/jobs/:id/retry`、timeline 拡張、加盟店概要の `settlement_lots`／`billing_cycles`|`apps/api/src/app.ts`、`apps/api/src/extensions.ts`、`apps/api/src/payments.ts`|
|UI|権限なし表示、精算予定、請求周期履歴、署名検証例、運営者の再送・再試行、仕訳検索、人物切替中の無効化|`apps/portal/components/portal.tsx`、`workspaces.tsx`、`packages/ui/src/messages.ts`|
|テスト|Playground 2件、任意冪等キー／運営者 API 1件、シナリオ3・9 各1件、E2E 3 をシナリオ1・4 に拡張、E2E 4 に権限なし、人物切替の完了待ち|`tests/*.test.ts`、`tests/e2e/payment.spec.ts`|
|環境|`pnpm-workspace.yaml` に `@embedded-postgres/linux-x64`、Linux 実測手順|`pnpm-workspace.yaml`、`docs/CLOUD-START.md`|
|文書|要件対応表、完成報告、本ガイド、README・API・Webhook・security・scenarios・decisions・implementation-status・portfolio・architecture・integration-guide・lifecycle の更新|`docs/`|

## 5. 証跡

- 自動テストの実行結果（件数・日時・環境）と Docker Compose クリーン起動の記録：[completion-report.md](completion-report.md)。実行ログの抜粋は `docs/evidence/` に保存。
- テストの再実行：`pnpm run test`（DB 起動・worker 停止）、`pnpm run test:e2e`（4 サービス起動後）。E2E のスクリーンショット・トレースは `test-results/`（Git 対象外）。
- OpenAPI：`packages/contracts/openapi/exw-v1.json` と `docs/api-endpoints.md` は `pnpm run openapi` の生成物で Git 管理。

## 6. 重点確認箇所

1. **資金の一貫性**：`packages/database/src/ledger.ts`（勘定ロック順・借貸検査・業務照合）、`apps/api/src/payments.ts`（capture／void／refund の予約・解放、返金原資の割当）。テスト `tests/core.test.ts` の 100 並列・同時残高・返金予約・原資不足。
2. **認可・隔離**：`apps/api/src/app.ts` `route()`（auth／scope／roles／CSRF）、`security.ts`（credential version、workspace 境界）、新規の任意 Idempotency-Key で秘密を再表示しない `withoutSecrets`。
3. **非同期回復**：`apps/worker/src/worker.ts`（lease、unknown→照会、dead-letter）、`tests/worker.test.ts` のシナリオ 9、`tests/process-recovery.test.ts`。
4. **EC 連携**：`apps/demo-store/src/index.ts` `sync()`（金額・通貨・加盟店・注文対応の照合、resource version、発送一意）、E2E 1・3・5。
5. **運営者ツール**：`apps/api/src/extensions.ts`（timeline、journals、再送・再試行の監査）。
6. **UI**：`apps/portal/components/portal.tsx` の `forbidden`、`concurrency-lab.tsx` のラベル関連付け、`switchRole` の切替中無効化。

## 7. 範囲外・未実施（正直な区分）

実預金・送金・カード・KYC・メール送信、公開配備、実 iOS Safari／Edge 以外の実ブラウザ（この環境は Playwright 管理 Chromium 153）、包括的アクセシビリティ監査、負荷性能、外部侵入試験。PowerShell の curl 例は quote 規則の静的検証のみ（POSIX 例は実行検証済み）。詳細は completion-report の「未実施検証・制約」。
