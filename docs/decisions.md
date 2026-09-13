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
