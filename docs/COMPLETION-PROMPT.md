# ExPress — 最終完成・納品までの実行プロンプト

**完成作業後の更新（2026-09-13）：本プロンプトの作業は実施済みです。結果は [completion-report.md](completion-report.md) と [final-review-guide.md](final-review-guide.md) を参照してください。以下は実行指示の原文です。**
あなたはExPressの開発を引き継ぐエンジニアです。既存実装のレビュー、不具合修正、不足機能の実装、受入検証、ドキュメント、デモ手順、完成品の納品まで担当してください。ユーザーはこのプロジェクトで完成させた成果物を、後から元担当エージェントへ提示して最終確認を依頼します。

レビュー報告や修正提案だけで終了せず、以下の完成条件までコードを実装・検証してください。通常の技術判断は自律的に行い、理由をdocs/decisions.mdへ記録してください。

## 作業の所在

- GitHub： https://github.com/Atsushi-Odajima/ExPress
- 現ローカル実装：`C:\Users\kuroa\Documents\Codex\2026-09-10\express-codex-0-ec-express-db`
- 引き継ぎ時のmain HEADは`8929459 Initial commit`。
- **初回引き継ぎでは実装が未pushでしたが、ソースcommit `c47113f`をGitHub mainへpushし別clone検証を完了しました。`docs/CLOUD-START.md`に従い最新mainをclone/pullしてください。** 上記Windowsパスは元PCの履歴です。クラウドからアクセスする必要はありません。検証は`docs/TRANSFER-VERIFIED.md`に記録しています。
- 最初に`docs/HANDOFF.md`と`docs/implementation-status.md`を読み、実装・残件・環境を把握してください。git statusと実ファイルで引き継げたことを確認します。
- 元の「ExPress — Codex向け開発指示書」は`docs/SPECIFICATION.md`へ原文のまま保存しています。これを要件の正本としてください。HANDOFFは前担当の状態説明であり、仕様縮小や独立した品質保証ではありません。
- 実装ファイルが届いていない場合は、初期リポジトリから別物を作り直さず、欠けているソースの所在を明確にしてください。

## 目的・境界

ExPressは、利用者が外部ECからホスト型checkoutへ移動して承認し、加盟店がAPIでcapture、署名Webhookと照会でEC注文を確定する決済プラットフォームの自作デモです。利用者wallet、加盟店・開発者portal、運営console、独立API・worker、複式台帳、SDK、別オリジン・別権限DBのECを完成させます。

表示名はExPress、識別子はexpress-wallet／@exw。金融境界はFundingProvider／PayoutProvider配下のMockProviderを使用し、内部の資金移動・状態遷移・非同期処理は実装します。実カード番号/CVV/実本人確認書類を収集しません。

公開・本番デプロイ、実課金、実送金、外部メール、有料契約、外部レジストリ公開は範囲外です。必要な公開手順は文書化します。別プロジェクトのwirepay／anypayや他のアプリのファイル・プロセスを変更しません。

## 使用量を抑える作業方法

- 既存コードとテストを活かし、関連箇所を読み、最小変更で進めてください。
- 既知の失敗から着手し、対象テスト→必要な回帰確認の順に実行。理由のない全件反復、全面リファクタリング、依存更新は不要です。
- ただし使用量節約を理由に必須機能・例外処理・最終受入を省略しないでください。
- 並列エージェントの自動起動は不要です。
- 区切りごとに実装状況を保存。会話や使用量の制限が近い場合も再開位置・変更・直近結果を残し、未完了を完了扱いにしないでください。

## 現在地点

詳細はHANDOFFを参照。Node24／pnpm、Next／React／Tailwind、独立Fastify、PostgreSQL、pg、独立workerのモノレポが実装されています。wallet・各portal・checkout・SDK・EC・定期課金・返金・出金・案件・デモ機能・文書まで主要コードがあります。

最新の確定記録：

- 単体／実DB統合／worker／SDK：33合格・0失敗。
- typecheckとproduction build：合格。
- 空DBmigration/seed、HTTP SDK決済／部分返金、DB権限分離：合格。
- desktop/mobile E2E：14件中12合格・2失敗。
- Docker Compose：Dockerがなく未検証。実PostgreSQL 18.4で検証。

## 実行順序

### 1. 要件と残作業を対応付ける

`docs/requirements-matrix.md`を作り、必須要件に対応コード、検証方法、結果、残件を記録してください。「実装済み」と「検証合格」を区別します。以下を全て対象にします。

- 利用者：登録／login／session失効、profile／言語／timezone、模擬KYC／制限表示、通知、残高／保留／履歴、模擬card／bank、topup／P2P／payment request／payout、checkout、同意管理、案件、明細／CSV／受領明細。
- 加盟店・開発者：profile／審査／5役割、実データ売上／手数料／残高、決済検索・capture／void／refund、支払リンク／QR、アプリ／scope／secret lifecycle、return/cancel完全一致、Webhook設定・鍵更新・配信／再送、APIログ／Playground／OpenAPI／SDK例、精算／出金、プラン／購読、案件対応。
- 運営：横断検索、能力別制限・模擬審査と理由／監査、risk rules、案件仲介、台帳整合性、理由・対向勘定付き調整／反対仕訳、設定、job／outbox／provider不明の調査、取引timeline。
- 共通：workspace/generation隔離・reset・業務時計、JPY整数・不変台帳・排他・永続冪等性、独立状態モデル、非同期回復、認証／CSRF／CORS／IDOR／URL／SSRF、API契約、EC、日英／dark／mobile／キーボード／失敗状態、静的資産限定PWA、文書・起動。

### 2. 既知の失敗・不備を直す

1. `tests/e2e/payment.spec.ts:75〜81`の並列操作パネルが両幅で失敗。80行の`getByLabel('オーソリ', {exact:true}).selectOption`がtimeout。snapshotにはselectとoptionがある。label解決やrole変更後の画面遷移をtraceで診断し、原因に対応する修正を行う。timeout延長やassertion削除で通さない。関連UIは`apps/portal/components/concurrency-lab.tsx`。修正後、まずこの2件を実行。
2. `apps/api/src/app.ts:156`付近のPlayground curl表示にPOST body／Content-Typeがなく、単一引用符内のtoken環境変数がPOSIX shellで展開されない。秘密を埋めず、シェルごとの引用と入力escapeを正しく実装して検証する。

### 3. 全必須範囲の不足を実装する

既知の2件修正後も、要件表の残項目がなくなるまで続けます。優先度は資金の一貫性→認可／隔離→worker／provider回復→EC連携→補助業務→UI／文書です。

必ず維持・検証する条件：

- 金額はJPY整数文字列／BIGINT、通貨・正値・上限・明細合計をサーバー検証。
- 台帳の借貸一致・不変性、業務状態と残高とoutboxのatomic commit、同一キーの重複防止、異なるキーでの累計上限。
- approved／authorizedを区別、複数部分capture、final／void／expiryで未確定分だけ解放。
- 返金は元支払元、pendingも上限予約、手数料非返却、加盟店available→unsettled lotの原資、不足時は追加入金、settlementとの二重解放禁止。
- card直接払いでwalletを増減しない。deleted cardは新規利用不可でも過去返金先を保持。
- provider unknownは照会で回復し、新規重複資金移動を作らない。外部呼出し中に業務DB transactionを開かない。
- job/outbox lease・retry/dead-letter・プロセス停止回復、Webhook raw body署名・5分許容・二重署名移行・重複／順序逆転・SSRF。
- 明示同意の固定月額、UTC月末丸め、周期一意、同周期1日／3日後再試行、同意撤回後新規課金禁止。
- 利用者／加盟店／運営の認証分離、credential version失効、scopeを超える鍵発行不可、workspace越境／CSRF／open redirect禁止。
- ECはserver正価とSDK/API/Webhookだけを使い、URLやcallbackで支払済みにしない。発送重複を防止。

APIは元仕様の全`/v1`必須endpointとUI用APIを照合し、OpenAPIに認証・scope・body・response・error・例が実装と一致することを確認してください。生成ルート一覧の存在だけをもって完成にしません。

UIは利用者・加盟店・運営の実操作がAPIとDBに反映され、金額／対象／結果の事前確認、失敗入力保持、read/loading/empty/forbidden/expired/retry、日英、timezone、mobile/desktop、keyboard/focus/label、CSV注入対策まで仕上げます。静的に盛った売上・成功率、未接続ボタン、金融データのPWA cacheは禁止。

### 4. 完成版を受入検証する

HANDOFF第10節／docs/demo-scenarios.mdの16シナリオを全て再現可能にし、それぞれの実行手順・期待結果・検証結果を記録してください。自動試験と手動試験を区別し、シナリオ説明を表示しただけで検証済みにしません。

最終状態で必要な確認：

```powershell
pnpm run typecheck
pnpm run test
pnpm run verify:clean
pnpm run openapi
pnpm run build
# 別ターミナルでproductionサービスを起動
pnpm run start
# サービス起動後
pnpm run test:e2e
```

通常workerはDBプロセス停止試験と競合させないこと。DBは試験中起動しておくこと。E2E時はAPI/worker/EC/Portal全て起動します。起動・停止の詳しい順序とこのPCのURLはHANDOFFを確認してください。ExPressのPIDを確認して操作し、他アプリを止めないでください。

クリーン環境のmigration・seed・起動、SDK README例とPlayground、別オリジン購入→部分返金、100並列／同時残高／返金／失効／復旧を最終コードで検証。Docker利用可ならComposeも実行。利用不能なら代替実DBの結果とDocker未検証を明示し、未検証を成功扱いにしません。

### 5. 文書と完成品を納品する

- README／.env.example／全設計・API・Webhook・integration・security・ledger・lifecycle・scenarios・portfolioを最終実装に同期。
- requirements-matrixとimplementation-statusに全要件と実測検証を反映。
- `docs/completion-report.md`を作成：完成範囲、起動、環境、テスト日時・件数・結果、16シナリオ、未実施検証、制約、Git保存状態。
- `docs/final-review-guide.md`を作成：元担当へ完成品を見せるためのURL／画面／5分・15分手順、引き継ぎ後の変更、重要コード／証跡、重点確認箇所。
- 完成品ソースの場所とcommit/pushの実施有無を明記。未pushのコードをGitHubにあると案内しないこと。必要ならsecretを含めないローカル納品アーカイブを用意し、未追跡ソースの取り漏れを防ぐ。

## 終了条件

計画、レビュー、既知の失敗修正だけで止めず、全必須機能の実装、必要な受入検証、文書と完成品の納品まで継続してください。修正できる失敗・不足は修正します。通常の判断を確認待ちにしません。

全必須要件を確認できた範囲で完成と報告してください。外部環境が必要な未実施検証は別記し、全検証済みや未計測性能を主張しないこと。ローカルで実行可能な作業を残したまま、「主要部分ができた」ことだけを終了理由にしないでください。

このプロンプトを受け取ったら、現実装の所在を確認し、完成までの作業を直ちに開始してください。
