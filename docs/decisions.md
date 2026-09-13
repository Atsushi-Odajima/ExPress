# 設計判断

- 指定の ExPress リポジトリのルートをモノレポとする。既存 README の見出しを維持して追記する。
- Node 24 LTS、Next.js 16、React 19、Fastify 5、Tailwind 4、pnpm 11。レジストリの現行バージョンを確認して lockfile で固定。TypeScript 5.9 は依存エコシステムとの互換性を優先。
- PostgreSQL 18 を正本とする。Docker 未導入PCでの検証用に embedded-postgres を開発依存として使用する。SQLiteやインメモリーDBへの置換はしない。
- pg のパラメーター化SQLと型付きリポジトリを使用する。資金処理はworkspace行をロックして直列化し、勘定もID順にロックする。デモの正しさ・調査容易性を優先し、商用処理能力を主張しない。
- API・独立worker・別DBのEC・Next portalを別プロセスにする。ECにExPress DB権限を与えない。
- 返金原資は加盟店利用可能→未精算ロット（古い順）。手数料は返さない。1回のcaptureの手数料がcapture額を超える少額は拒否する。
- 新規支払いのcan_payと既存オーソリ確定のcan_captureを分ける。制限後も履歴閲覧・返金受取を許可する。
- JSON内の資金移動参照も、生成列とworkspace/generation複合外部キーで検証する。台帳のwriter_xidはトップレベルのpg_current_xact_idを保存し、購読処理のsavepointからの仕訳追加でも正しくコミット単位で封印する。
- 複数役割のAPI資格情報は、作成者のscopeを超えて発行・鍵更新できない。role変更を資格情報から迂回しない。
- レート制限は入口のIP制限（3,000/分、ログイン等20/分）と、認証後のworkspace/generation/主体制限（300/分）を分ける。制限時は429＋Retry-After。一つのデモ利用量を他workspaceへ波及させない。単一APIプロセス向けメモリー実装で、多インスタンス化には共有ストアが必要。
- 鍵更新後24時間はWebhookを新旧両鍵で署名する。SDKはどちらかを検証し、旧鍵だけの受信側にも切替時間を確保する。
- Node.jsのHTTP DNS lookupにall=trueが渡される場合は配列形式を返す。localhost名を用いた実HTTPテストで確認する。
- QRはqrcode 1.5.4を使用。固定決済リンクの共有補助だけで、QR自体から決済完了を判断しない。
- 日英の製品文言をソース内辞書で管理。利用者が入力した名前・メモは翻訳せず保存内容を表示する。
- 配備URLはビルド時にPortalへ埋め込むため、ルート.envを読み込むbuildスクリプトを設ける。API/EC/workerと、ビルド済みNextをまとめて起動するstartスクリプトも用意する。
- 固定デモ資料2点は許可ファイル名のみ受理し、案件参加者の認可後に取得する。任意URL/パスや実資料のアップロードは受け付けない。

公式資料（2026-09-10確認）:
- https://nextjs.org/docs/app/getting-started/installation
- https://fastify.dev/docs/latest/Reference/LTS/
- https://www.postgresql.org/support/versioning/
- https://pnpm.io/installation
- https://tailwindcss.com/docs/installation/framework-guides/nextjs
- https://github.com/leinelissen/embedded-postgres
- https://github.com/soldair/node-qrcode

追加の実装確認には、インストール済みNext.jsの同梱ドキュメントと@fastify/rate-limitの公式READMEを使用した。依存の正確なバージョンはpnpm-lock.yamlを正とする。

## 2026-09-13 完成作業（Linuxクラウド環境）での判断

- 実行環境：Node 24.21.0（nvm）、pnpm 11.19.0、Playwright 1.63.0＋管理Chromium 1243（Chrome 153）。最終受入はREADME標準手順のDocker Compose（PostgreSQL 18.6）で行い、システムのPostgreSQL 16.13でもmigration・seed・全テストが通ることを確認した。`xid8`／`pg_current_xact_id()`／生成列はPostgreSQL 13以降で利用できる。
- `pnpm-workspace.yaml` の allowBuilds に `@embedded-postgres/linux-x64` を追加した。Linuxで `pnpm db:local` を使う場合に配布バイナリのpostinstall（symlink作成）が必要なため。rootではinitdbが動かないので、この環境の実測はComposeとシステムPGで行った。
- 並列操作パネルE2E失敗の原因：`<label>` が `<select>` を内包していたため、Playwrightの `getByLabel('オーソリ',{exact:true})` が照合するラベル文字列にoptionテキストが含まれ、完全一致しなかった。修正は `htmlFor`／`id` による明示的な関連付け（読み上げ名も「オーソリ」だけになる）。テストは人物切替とパネル描画の完了を待つassertionを追加し、timeout延長やassertion削除はしていない。
- Playgroundのcurl例：tokenは `$EXW_ACCESS_TOKEN`（POSIX）／`$env:EXW_ACCESS_TOKEN`（PowerShell）を二重引用符内で参照し、URL・Idempotency-Key・JSON bodyは単一引用符でリテラル化する（POSIXは `'"'"'`、PowerShellは `''` と `\"`）。表示例に秘密を埋め込まない。POSIX例はテストで実際に `sh` で実行し、同じキーで同じ注文が再現されることを確認した。PowerShell例はquote規則の静的検証（Windows実機なし）。
- 加盟店APIの非金銭変更（Webhook登録・更新・停止・鍵更新・テスト・再送、購読pause/resume/cancel、支払リンク無効化、アプリ登録・rotate/revoke、案件回答、プロフィール・戻りURL）は Idempotency-Key を任意で受け付け、同じキー・同じ入力なら保存済み結果を返す。保存する応答から `client_secret`／`webhook_secret` を除外し、再表示しない（一度だけ表示の原則を維持）。
- 運営者向けに `/v1/admin/journals`（仕訳検索・cursor）、`/v1/admin/webhook-deliveries/:id/retry`、`/v1/admin/jobs/:id/retry` を追加。再送・再試行は理由必須で監査ログへ記録し、処理中（pending／running）の配信は再送しない。
- `/v1/admin/timeline/:id` に配信（deliveries）、仕訳明細（lines）、精算ロット、案件、請求周期を加え、EC注文→ExPress注文→承認→オーソリ→capture→仕訳→Webhook→返金を1応答で追跡できるようにした。
- 加盟店概要に `settlement_lots`（精算予定）と `billing_cycles`（失敗再試行履歴）を追加した（scopeは `balances:read`／`subscriptions:write`）。
- Portalに「権限なし」状態を追加：加盟店区画はsectionごとの必要scope、開発者ポータルは `webhooks:manage` を満たさないrole（read_onlyなど）でalertを表示し、操作ボタンを描画しない。
- E2E 3をimmediateモード＋ECサーバー照会（`/api/orders/:id/confirm`）によるcaptureへ変更し、シナリオ1・4をUI経由で検証する。500配信の出現は独立workerの配信完了を待つpollにした（支払済み判定が即時になり、配信履歴の読み取りと競合していたため）。
- シナリオ3（残高不足→チャージ→同じcheckoutを再承認）とシナリオ9（timeout_success→unknown→照会で1回だけ記帳）の自動テストを追加した。
