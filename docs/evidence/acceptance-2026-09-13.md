# 受入検証の証跡（2026-09-13、Linuxクラウド環境）

`pnpm` スクリプトの実行ログから抜粋した。生ログ（`.local/*.log`、`test-results/`）はGit対象外。秘密情報は含まない。

## 環境

- 2026-09-13T07:15:59Z node=v24.21.0 pnpm=11.19.0 psql=PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
- Docker Compose: `express-postgres-1   postgres:18.6   Up 20 minutes (healthy)   127.0.0.1:54329->5432/tcp`
- PostgreSQL（Compose）: `PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit`
- Playwright 1.63.0 / 管理Chromium 1243（Chrome Headless Shell 153.0.8010.12）

## 受入チェーン（最終コード、production build）

```text
=== 2026-09-13T07:15:59Z node=v24.21.0 pnpm=11.19.0 psql=PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit ===
=== stop previous production services ===
=== typecheck ===
typecheck exit=0
=== unit/DB/worker/SDK/Playground suite (worker stopped) ===
test exit=0
=== verify:clean ===
Fresh PostgreSQL migration, seed, API/SDK payment, and database separation verified.
verify:clean exit=0
=== openapi ===
OpenAPI and endpoint reference generated from registered Fastify routes.
openapi exit=0
=== build ===
build exit=0
=== start (production) ===
services up after 2 checks
=== e2e desktop+mobile (production start, PostgreSQL 18.6) 2026-09-13T07:17:11Z ===
e2e exit=0
=== 2026-09-13T07:18:21Z done ===
```

## E2E（Playwright、desktop + mobile、production start、PostgreSQL 18.6）

```text
Running 14 tests using 1 worker
  ✓   1 [desktop] › tests/e2e/payment.spec.ts:3:1 › 別オリジンSDK購入 → 一部出荷 → 部分返金 (3.6s)
  ✓   2 [desktop] › tests/e2e/payment.spec.ts:19:1 › 英語切替・加盟店検索・共有QR・運営者の能力別設定 (2.9s)
  ✓   3 [desktop] › tests/e2e/payment.spec.ts:30:1 › WebhookでECが支払済みに収束、500再送・鍵更新・重複・順序逆転で二重発送なし (3.8s)
  ✓   4 [desktop] › tests/e2e/payment.spec.ts:51:1 › 加盟店・運営者・PWA・ダークモード (2.2s)
  ✓   5 [desktop] › tests/e2e/payment.spec.ts:61:1 › 模擬カード直接払いと元カード返金、英語ECでも財布は増減しない (9.2s)
  ✓   6 [desktop] › tests/e2e/payment.spec.ts:70:1 › Playgroundで実注文作成・APIログ・管理者の調整仕訳と反対仕訳 (8.1s)
  ✓   7 [desktop] › tests/e2e/payment.spec.ts:79:1 › デモパネルの同時承認で過剰使用を防ぎ、100重複captureが1回になる (3.2s)
  ✓   8 [mobile] › tests/e2e/payment.spec.ts:3:1 › 別オリジンSDK購入 → 一部出荷 → 部分返金 (3.8s)
  ✓   9 [mobile] › tests/e2e/payment.spec.ts:19:1 › 英語切替・加盟店検索・共有QR・運営者の能力別設定 (3.2s)
  ✓  10 [mobile] › tests/e2e/payment.spec.ts:30:1 › WebhookでECが支払済みに収束、500再送・鍵更新・重複・順序逆転で二重発送なし (4.0s)
  ✓  11 [mobile] › tests/e2e/payment.spec.ts:51:1 › 加盟店・運営者・PWA・ダークモード (2.4s)
  ✓  12 [mobile] › tests/e2e/payment.spec.ts:61:1 › 模擬カード直接払いと元カード返金、英語ECでも財布は増減しない (9.4s)
  ✓  13 [mobile] › tests/e2e/payment.spec.ts:70:1 › Playgroundで実注文作成・APIログ・管理者の調整仕訳と反対仕訳 (7.9s)
  ✓  14 [mobile] › tests/e2e/payment.spec.ts:79:1 › デモパネルの同時承認で過剰使用を防ぎ、100重複captureが1回になる (3.2s)
  14 passed (1.1m)
e2e exit=0
```

## 単体・実DB統合・worker・SDK・Playground（`pnpm run test`、通常worker停止、PostgreSQL 18.6）

最終実行 2026-09-13T07:18:51Z（シナリオ5テスト追加後）。

```text
ℹ tests 39
ℹ suites 0
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 28683.994718
```

```text
✔ ブラウザSDKは許可origin/source/nonceを検証し、popupブロック時はredirectする
✔ 金額・手数料・月末アンカー・CSV注入
✔ 100並列の同一冪等キーcaptureは1回・入力相違は409
✔ 異なるキーの100並列captureも累計を超えない
✔ 残高10,000に対する8,000円同時支払いは一方だけ
✔ 部分capture・void競合・返金・未精算ロットの整合性
✔ 手数料返却なし・並列返金の予約上限・原資不足
✔ カード直払いは財布を増減せず削除済みカードへ返金できる
✔ provider成功後結果保存前の停止から照会復旧・二重計上なし
✔ 出金失敗は出金保留を解放
✔ Webhook署名・期限・ローテーション・改ざん
✔ DBがworkspace外部キー・台帳変更・不一致仕訳を拒否
✔ APIのCSRF・scope・IDOR・失効secret・他workspace・OpenAPI
✔ 定期課金の周期一意性・残高不足再試行・同意撤回
✔ SDK READMEのcheckout例を実HTTP APIで実行・冪等結果一致
✔ SSRF: loopback/private/link-local/任意ホストを拒否・ローカル例外はECのみ
✔ 処理中カード返金を含めた予約上限・失敗時の原資ロット復元
✔ 期限切れtoken・return URL完全一致・他加盟店のIDOR・利用者制限後も返金受取
✔ resetはgenerationを更新し旧セッション・旧ジョブ結果を拒否、他workspaceは不変
✔ 通常登録→ログアウト→同じ隔離環境へログイン、他端末セッションを失効
✔ 同じ仕訳内の複数勘定もcursor明細で欠落しない、成功202をAPIログに保存
✔ カード定期課金の拒否は同じ周期を1日後・3日後に再試行し最大3回で停止
✔ 台帳から業務レコードまで照合し、集計の不一致を検出する
✔ 運営者の調整反対仕訳・案件内資料・他workspace拒否
✔ カード課金確保後の加盟店制限でもジョブが停滞せず同周期の失敗に収束
✔ 連続失敗ルールとテストWebhookの対象endpoint限定
✔ 開発者は自分のscopeを超えるAPI鍵の発行・更新ができない
✔ レート制限は429とRetry-After、別workspaceの認証主体へ波及しない
✔ 精算前返金→精算→加盟店出金失敗/成功→原資不足→追加入金で全額返金
✔ 削除済み模擬カードで新規継続課金を開始しない
✔ 任意Idempotency-Keyの再配信は1回、運営者の仕訳検索・通知再送・ジョブ再試行・timeline拡張、加盟店概要の精算ロット
✔ シナリオ3: 残高不足のcheckoutは承認失敗後もcreatedのまま、チャージ後に同じcheckoutを再承認できる
✔ シナリオ5: 未captureオーソリは業務時計の期限切れでworkerが解放し、authorization.expiredを配信する
✔ Playgroundのcurl例はbody/Content-Typeを含み、シェルごとに安全にquoteし、秘密を埋め込まない
✔ Playground APIは実注文を作成し、返したPOSIX curl例はそのまま実行できる
✔ 独立workerプロセスをprovider成功直後に停止し、新プロセスで1回だけ復旧
✔ lease期限内は再取得せず、停止したworkerの期限切れジョブを新workerが回復
✔ outbox commit後の停止・配信lease回復・500再送・移行中二重署名・dead-letter
✔ シナリオ9: providerのtimeout_successはunknownとして扱い、照会ジョブで1回だけ記帳する
```

同じスイートは受入チェーン内（07:16Z、38件時点）とシステムPostgreSQL 16.13（07:06Z、38件時点）でも全件合格した。
