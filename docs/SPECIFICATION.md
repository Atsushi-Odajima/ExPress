# ExPress 開発仕様書（ユーザー原文）

この会話でユーザーから受け取った開発指示書を、内容を省略せず保存しています。以下は原文です。実装状況・不具合・検証結果は HANDOFF.md と implementation-status.md を参照してください。原文の「新規ならexpress-wallet/」について、既存の指定リポジトリルートに実装済みです。

---

ExPress — Codex向け開発指示書

0. このファイルを受け取った開発エージェントへの指示

あなたは決済基盤の設計とフルスタック実装を担当するエンジニアです。本書を仕様として、オンラインウォレットと外部EC向け決済プラットフォーム「ExPress」を実装してください。計画や画面モックの提示だけで止まらず、DB・API・認証・台帳・非同期処理・SDK・サンプルEC・テスト・ドキュメントまで完成させてください。

• 正式な表示名は必ず ExPress。コードの識別子は express-wallet や exw を使い、Express.jsというフレームワークと混同しないでください。
• 目的は、自作の公開デモを通して決済実務と開発能力を示すことです。実際の預金、送金、カード発行、本人確認審査は実行しません。
• 既存のwirepay、anypayとは別プロジェクトです。既存ファイルを上書きせず、新規なら express-wallet/ に作成してください。既存リポジトリが指定されている場合は、その構造とAGENTS.mdを先に確認してください。
• 通常の技術判断は自律的に行い、判断と理由を docs/decisions.md に記録してください。APIキー未提供を理由に止まらず、標準の模擬プロバイダーで全機能を完成させてください。
• 公開、実課金、外部へのメール送信、有料サービス契約はこの指示の対象外です。ローカルで完成・検証し、公開手順を用意してください。
• フェーズごとに動く状態を作り、未完了項目を docs/implementation-status.md に保存してください。会話が長くなったら進捗と再開手順を記録し、次回はそこから続行してください。
• ダミーの成功トースト、DBと連動しない残高、押しても処理されないボタン、未実装なのに完了と表示する機能は禁止です。模擬にするのは外部金融機関・カード会社等との境界です。内部処理は実装してください。

1. プロダクトの目的と完成イメージ

ExPressアカウントを持つ利用者が、外部ECの「ExPressで支払う」ボタンからExPressへ移動し、支払先・金額・支払元を確認して承認する。加盟店はサーバーAPIで売上を確定し、署名付きWebhookと照会APIで注文の支払状態を確認する。利用者は残高・保留・返金を確認し、加盟店は売上・手数料・返金・出金を管理し、運営者は制限・審査・台帳・通知障害を調査できる。

QR決済アプリとの違いは、外部加盟店向けAPI、ホスト型チェックアウト、SDK、支払承認、オーソリ、売上確定、加盟店精算を持つことです。PayPal等を参考概念としますが、ロゴ・文言・画面を複製せず、独自デザインとしてください。

完成必須の成果物

1. 利用者向けウォレットWebアプリ。スマートフォン優先、PWA対応。
2. 加盟店ポータルと開発者ポータル。
3. 運営者コンソール。
4. 外部ECから遷移するホスト型チェックアウト。
5. バージョン付きREST APIとOpenAPI仕様、対話型APIドキュメント。
6. ブラウザ用チェックアウトSDKとNode.js/TypeScript用サーバーSDK。
7. ExPressとは別オリジンで動くサンプルEC。
8. 台帳、Webhookワーカー、期限切れ・定期課金等のジョブ。
9. 障害シナリオを再現できるデモ操作パネル。
10. 自動テスト、起動手順、設計説明、面接用デモ手順。

2. 技術構成と実行環境

新規実装時の基準構成はTypeScriptのモノレポとします。バージョンは実装時に公式資料で互換性とサポートを確認し、lockfileに固定してください。

|領域     |基準                                                |
|-------|--------------------------------------------------|
|フロント   |Next.js、React、TypeScript、Tailwind CSS、アクセシブルなUI部品 |
|API    |独立したNode.js/TypeScriptサービス。Fastifyを基準とし、OpenAPIを公開|
|DB     |PostgreSQL。台帳・状態遷移・冪等性の永続化に使用                     |
|DBアクセス |Prisma等の型付き手段。排他制御に必要ならパラメーター化SQLを使用              |
|ワーカー   |PostgreSQLのoutbox/jobsを処理する独立Node.jsプロセス          |
|テスト    |単体・DB統合テスト、PlaywrightによるE2E                       |
|パッケージ管理|pnpm workspaces                                   |
|ローカル   |Docker ComposeでDB等を起動。Windows＋Docker Desktopから利用可能|

推奨ディレクトリ：

```text
apps/
  portal/           # wallet・merchant・admin・checkout・developer docs
  api/              # REST API・認証・業務処理
  worker/           # outbox・Webhook配信・定期ジョブ
  demo-store/       # 独立したサンプルECとサーバー
packages/
  domain/           # 状態遷移・金額・台帳ルール
  database/         # スキーマ・migration・seed
  contracts/        # API schema・OpenAPI
  sdk-server/       # Node.js/TypeScript SDK
  sdk-browser/      # 公開チェックアウトSDK
  ui/               # 共通UI
  testkit/          # 模擬プロバイダー・時計・シナリオ
docs/
```

ローカル基準：portal http://localhost:3000、demo-store http://localhost:3001、API http://localhost:4000。ポートと公開URLは環境変数で変更可能にします。画面のパスを変えただけの同一ECではなく、別オリジン間の購入を実証してください。

• UIもAPIと同じ業務サービスを利用し、フロントに残高計算の正本を置かない。
• ワーカーはWebリクエスト終了後に消える処理として実装しない。配備先にワーカーまたは定期起動基盤が必要なことを説明する。
• 静的ホスティングだけで全体が動くとは説明しない。DB・API・ジョブの配備構成を示す。
• Redisは必要性がなければ追加不要。永続キューの正しさを優先する。

3. デモ環境と利用者の分離

• 全画面に控えめな「デモ・実際のお金は動きません」表示を置く。
• 外部金融連携は FundingProvider / PayoutProvider インターフェース配下の MockProvider で動作させる。
• 実カード番号・CVV・実際の本人確認書類は収集しない。カードは模擬カード選択UIで登録し、トークン・ブランド・下4桁・有効期限だけを保持する。
• デモ訪問者ごとに隔離された demo_workspace_id を発行し、その中に利用者、加盟店2社、運営者、ECデータを生成する。
• ロール切替はデモ内のプリセット人物に限定する。利用者アカウントを任意の実運営者へ昇格させる実装は禁止。
• Cookie、APIトークン、DBクエリ、ジョブ、Webhook、SDKを通じてworkspace境界を維持する。ブラウザ指定のworkspace IDをそのまま信用しない。
• リセットは現在のデモworkspaceだけを対象にする。リセット中は関連ジョブを停止し、新しいgenerationを発行して古い通知・処理を無効化する。
• ローカル単一workspaceモードも用意する。公開デモ時は固定の共通管理者パスワードや共通API秘密鍵を配布しない。

4. UI・UX

• 日本語を標準、英語の表示切替も実装。日時はDBではUTC、表示はタイムゾーン設定に従う。
• 独自のExPressロゴを文字・SVGで作成。ネイビー、ホワイト、ブルーまたはティールのアクセントを基調にする。
• 利用者画面は支払い・送金・残高・履歴がわかるモバイルUI。加盟店と運営者は情報密度のある業務UI。
• ダークモード、レスポンシブ、キーボード操作、フォーカス表示、読み上げラベルを用意。
• 残高の利用可能・保留・未精算・出金中を混同せず、金額の横に説明を付ける。
• データなし、読込中、権限なし、失敗、再試行、期限切れを設計する。
• 金額変更を伴う操作は金額・対象・結果を事前表示。失敗時に入力を失わない。
• CSV、検索、フィルター、ページング、期間指定を主要一覧に用意。CSV数式インジェクションを防止。
• 利用者向け画面へAPIやDBの説明を散らさない。技術詳細は開発者ポータルとデモ操作パネルへ置く。
• PWAのキャッシュは静的資産のみ。残高・支払API・個人情報はキャッシュせず、オフライン決済を成功扱いしない。

5. 利用者ウォレットの機能

5.1 アカウント

• デモアカウント作成、ログイン・ログアウト、プロフィール、言語・タイムゾーン。
• 通常ログイン用のパスワードは安全にハッシュ化。セッション失効と他端末ログアウト。
• 本人確認は「未提出／確認中／確認済み／要修正」の模擬状態。実書類をアップロードさせない。
• 利用制限の理由と、できる操作・できない操作を表示。
• 通知センター。メールはアプリ内送信箱またはローカル受信箱へ出力。

5.2 残高・支払手段

• JPY残高、利用可能額、保留額、チャージ・支払い・返金・送金・出金履歴。
• 模擬カード、模擬銀行口座の登録・削除・既定支払手段設定。
• 模擬チャージの成功・拒否・処理中・タイムアウト後成功。
• 銀行への模擬出金。申請時に残高を確保し、成功時に外部へ出金した帳簿処理、失敗時に解放。
• 支払元は「ウォレット残高」または「模擬カード」を選択。初版は混合払いをしない。カード直接払いをチャージと混同しない。
• 模擬カードの削除後も過去取引・返金先参照は保持。削除は新規利用の停止として扱う。

5.3 送金・支払依頼

• 同一workspace内のExPress利用者間送金。宛先確認、メモ、上限、同時実行時の残高保護。
• 支払依頼リンクの作成、期限、承認、取消。依頼だけでは資金移動しない。
• 別workspaceや存在しない利用者への送金は禁止。メール等の存在判定で過度な情報を返さない。

5.4 支払管理

• チェックアウト承認、追加認証の模擬ステップ、取消、承認・売上確定・返金の履歴。
• 店舗ごとの継続課金同意一覧、同意撤回、次回請求日。
• 購入トラブル申告、返金依頼、加盟店との案件内メッセージ。
• 明細CSV、取引詳細、印刷可能な受領明細。

6. 加盟店・開発者ポータル

• 加盟店プロフィール、店舗情報、ロゴ、表示名、問い合わせ先、審査状態。
• owner／developer／finance／support／read_onlyの役割と権限。
• 日次売上、確定額、返金、手数料、未精算・利用可能残高、出金予定。集計は実データから算出。
• 決済検索、外部注文番号検索、オーソリ・売上確定・取消・全額／部分返金。
• ホスト型支払リンクの作成、有効期限、固定金額、商品説明。QR生成はリンク共有用の補助機能。
• アプリ登録、公開client ID、秘密鍵の一度だけ表示、ローテーション、失効、スコープ。
• 許可return URL／cancel URLの登録と、完全一致による検証。
• Webhook登録、イベント選択、秘密鍵更新、配信履歴、再送、模擬テスト。
• APIリクエストログ：request ID、対象、結果、時間。秘密鍵・トークンはマスク。
• APIドキュメント、curl例、SDK導入例、署名検証例、API Playground。
• 手数料明細、出金申請、出金失敗、出金先口座変更。
• 定期課金プランと購読者一覧、停止、解約、失敗再試行履歴。
• 返金依頼・購入トラブル案件への回答と資料提出。資料はデモ用の許可ファイルに限定。

7. 運営者コンソール

• 利用者・加盟店・決済・台帳・出金・Webhook・ジョブの横断検索。
• 利用者と加盟店の模擬審査、差戻し、承認、制限、解除。全操作に理由と監査ログ。
• capabilitiesとして can_pay、can_receive、can_payout、can_refund 等を別管理する。
• 新規支払い停止でも閲覧と返金受取は可能とするなど、制限マトリクスを実装・文書化。既存オーソリ確定の可否も明示し、状態を一括凍結するだけにしない。
• 高額・連続失敗等の単純なリスクルールと手動審査キュー。判定理由・ルール版を記録。
• 購入トラブルの仲介。これはExPress内の案件管理であり、カードネットワークへの実際のチャージバック提出ではないと区別。
• 台帳の借貸一致、残高再計算、業務レコードとの対応の整合性レポート。
• 管理者の残高訂正は、理由・対向勘定を伴う調整仕訳。残高カラムの直接編集は禁止。
• 手数料設定、精算待機時間、取引限度額、同意済み定期課金の上限。
• outbox滞留、ジョブ失敗、Webhook失敗、模擬プロバイダーの結果不明案件。

8. 決済モデルと状態遷移

8.1 データを分離する

ECの注文、ExPressのPaymentOrder、CheckoutSession、Authorization、Capture、Refund、外部プロバイダー試行を別エンティティとします。1つの status だけで全工程を表現しないでください。

|エンティティ         |状態の基準                                                               |
|---------------|--------------------------------------------------------------------|
|CheckoutSession|created、approved、cancelled、expired                                  |
|Authorization  |pending、authorized、partially_captured、captured、voided、expired、failed|
|Capture        |pending、succeeded、failed                                            |
|Refund         |pending、succeeded、failed                                            |
|ProviderAttempt|created、pending、unknown、succeeded、failed                            |
|Payout         |requested、processing、succeeded、failed、cancelled                     |
|Subscription   |pending_consent、active、past_due、paused、cancelled                    |

• PaymentOrderの総額、確保額、確定額、返金額と要約状態は、関連データと矛盾しない方法で更新する。
• approved はユーザー同意、authorized は資金確保。意味を分ける。
• 承認時に利用者と支払元、金額、通貨、加盟店を固定する。承認後の金額増額は禁止し、新規承認を要求する。
• CheckoutSessionは初期30分、Authorizationは初期24時間のデモ用期限。実際のカード会社の期限を再現しているとは説明しない。
• 複数回の部分captureに対応し、累計がオーソリ額を超えないようにする。final_capture=true は残額を解放する。
• 部分capture後のvoid／期限切れは未確定分だけ解放し、確定済み分は戻さない。集計状態には一部確定済みであることを残す。
• Captureごとの部分返金に対応。処理中返金を含めた予約額で超過返金を防ぐ。
• 期限切れ・取消・captureが競合しても、同じ残高を二重に使用・解放しない。
• 外部呼出しはDBトランザクションを開いたまま行わない。intent保存→外部呼出し→結果反映の手順と照会ジョブで回復する。
• ネットワークタイムアウトは直ちに失敗にせず unknown として照会する。確定結果前に新しい資金移動を作らない。

8.2 外部ECの購入シーケンス

1. ECサーバーが商品価格・数量を検証し、EC注文を作成。
2. ECサーバーが秘密鍵からアクセストークンを取得。
3. ECサーバーがExPress注文とCheckoutSessionを冪等に作成。
4. ブラウザSDKがホスト型チェックアウトを開く。リダイレクトを標準とする。
5. ExPress上で利用者がログインし、金額・加盟店・支払元を確認して承認。
6. ExPressがオーソリを行い、結果をDBと台帳へ反映し、outboxにイベントを保存。
7. ECへの戻り画面では「確認中」を表示。URLパラメーターやSDKのコールバックだけで支払済みにしない。
8. ECサーバーがAPIで状態・金額・通貨・加盟店・注文対応を照合し、captureを要求。即時販売ならここで実行、出荷時確定モードなら保留。
9. capture成功の署名付きWebhookをECサーバーが受信。イベント重複を排除し、注文状態を更新。
10. Webhookが遅延した場合はサーバー照会でも確認可能。どちらが先でも同じ結果になる。

ポップアップは追加対応し、ブロック時はリダイレクトへフォールバック。postMessage のorigin・source・nonceを検証し、メッセージを資金確定の証拠として扱わない。

9. 台帳・残高・手数料の必須仕様

9.1 金額と一貫性

• 初版はJPYのみで全機能を完成させる。通貨コードは全金額に持たせ、USD等の未対応通貨は明確に拒否する。為替・混合通貨決済は今回の範囲外。
• 金額は最小通貨単位の整数。APIでは10進整数文字列、DBではBIGINT等。JSの浮動小数で金額を計算しない。
• 正の金額、上限、ゼロ拒否、通貨一致をサーバーで検証する。
• 複式台帳を正本にする。1仕訳内、通貨ごとに借方合計＝貸方合計。
• 仕訳は確定後に変更・削除しない。訂正は参照付きの反対仕訳と新規仕訳。
• 残高キャッシュを持つ場合は同じDBトランザクション内で更新し、再計算で検証可能にする。
• 残高ロック、一定順序での勘定ロック、適切な分離レベルとリトライで競合を処理。APIの事前残高確認だけで済ませない。
• 台帳と業務状態とoutbox保存を1トランザクションにまとめる。業務イベントに対応する仕訳へ一意制約を付ける。

9.2 必須勘定

模擬外部資金（資産）、利用者利用可能残高（負債）、利用者保留残高（負債）、加盟店未精算残高（負債）、加盟店利用可能残高（負債）、出金保留（負債）、返金保留（負債）、手数料収益を持つ。利用者・加盟店ごとに補助勘定を作る。

最低限、次の仕訳を実装・文書化する。

|操作         |借方       |貸方              |
|-----------|---------|----------------|
|模擬チャージ成功   |模擬外部資金   |利用者利用可能         |
|残高払いオーソリ   |利用者利用可能  |利用者保留           |
|残高払いcapture|利用者保留（総額）|加盟店未精算（純額）＋手数料収益|
|オーソリ未使用分解放 |利用者保留    |利用者利用可能         |
|精算待機時間経過   |加盟店未精算   |加盟店利用可能         |
|P2P送金      |送金者利用可能  |受取人利用可能         |
|出金申請       |申請者利用可能  |出金保留            |
|出金成功       |出金保留     |模擬外部資金          |
|出金失敗       |出金保留     |申請者利用可能         |

模擬カード直接払いではオーソリはプロバイダー側の保留として記録し、利用者ウォレットを増減させない。capture成功で模擬外部資金を借方、加盟店未精算と手数料収益を貸方にする。

9.3 返金

• 返金先は元の支払元。残高払いは元の利用者残高、カード直接払いは元のプロバイダートークンへ戻す。
• 初期手数料は模擬設定として「3%＋30円」、率部分は切捨て。capture単位で計算し、当時の条件をsnapshot保存。実サービスの料率ではない。
• 初版の返金ポリシーは「手数料は返却しない」。例えば1,000円captureで60円手数料なら加盟店純額940円。全額返金には加盟店が1,000円分を確保できる必要がある。
• 返金原資は対象加盟店の利用可能・未精算勘定から明示した優先順で確保する。出金中など既に拘束された資金は使わない。不足なら INSUFFICIENT_REFUND_FUNDS とし、加盟店の模擬追加入金で回復可能にする。無断で運営者が立て替えない。
• 返金要求で加盟店残高を借方、返金保留を貸方にして予約。残高払い成功なら返金保留を借方、利用者利用可能を貸方。カード返金成功なら返金保留を借方、模擬外部資金を貸方。
• 返金失敗時は予約時の元勘定に戻す。プロバイダー結果不明の間は予約を保持し、照会で確定。
• capture直後の返金で精算ジョブが二重解放しないよう、未精算の各ロットと消費額を追跡する。

10. REST API — 必須契約

すべて /v1 配下。OpenAPIを実装と同期し、認証方式・スコープ・例・エラー・状態遷移を明記する。以下は最低限のAPIであり、UIに必要な一覧・詳細・操作も実装する。

10.1 加盟店認証

• POST /v1/oauth/token：client_credentials方式。短命アクセストークン発行。
• client IDは公開可能、client secretはサーバー専用。secretはハッシュ保存し、一度だけ表示。
• scope例：orders:read/write、payments:read/write、refunds:write、webhooks:manage、balances:read、payouts:write、subscriptions:write。
• secret失効時に既発行トークンをどう失効させるか実装する。短命であることだけに依存せず、クライアント状態やversionを検証。
• 利用者セッションAPIと加盟店APIを分ける。加盟店トークンで利用者の支払承認や任意ウォレット操作はできない。

10.2 加盟店API一覧

|Method        |Path                                      |内容                |
|--------------|------------------------------------------|------------------|
|POST / GET    |`/v1/orders`                              |決済注文作成／一覧         |
|GET           |`/v1/orders/{id}`                         |注文詳細・各金額・状態       |
|POST          |`/v1/orders/{id}/cancel`                  |未処理注文の取消          |
|POST          |`/v1/checkout-sessions`                   |承認用セッション作成        |
|GET           |`/v1/checkout-sessions/{id}`              |状態照会。秘密承認トークンは返さない|
|GET           |`/v1/authorizations/{id}`                 |資金確保状態            |
|POST          |`/v1/authorizations/{id}/capture`         |全額・部分売上確定         |
|POST          |`/v1/authorizations/{id}/void`            |未確定残額の解放          |
|GET           |`/v1/captures/{id}`                       |売上確定詳細            |
|POST          |`/v1/captures/{id}/refunds`               |全額・部分返金           |
|GET           |`/v1/refunds/{id}`                        |返金状態              |
|GET           |`/v1/balances`                            |加盟店残高             |
|GET           |`/v1/transactions`                        |取引明細              |
|POST / GET    |`/v1/payouts`                             |模擬出金作成／一覧         |
|GET           |`/v1/payouts/{id}`                        |出金詳細              |
|POST / GET    |`/v1/payment-links`                       |支払リンク作成／一覧        |
|POST          |`/v1/payment-links/{id}/deactivate`       |リンク無効化            |
|POST / GET    |`/v1/webhook-endpoints`                   |通知先作成／一覧          |
|PATCH / DELETE|`/v1/webhook-endpoints/{id}`              |通知先更新／停止          |
|POST          |`/v1/webhook-endpoints/{id}/rotate-secret`|署名鍵更新             |
|GET           |`/v1/webhook-deliveries`                  |配信履歴              |
|POST          |`/v1/webhook-deliveries/{id}/retry`       |配信再試行             |
|POST / GET    |`/v1/plans`                               |定期課金プラン           |
|POST / GET    |`/v1/subscriptions`                       |同意待ち購読作成／一覧       |
|POST          |`/v1/subscriptions/{id}/pause`            |次回課金停止            |
|POST          |`/v1/subscriptions/{id}/resume`           |有効な同意の範囲内で再開      |
|POST          |`/v1/subscriptions/{id}/cancel`           |解約                |
|GET           |`/v1/disputes`                            |ExPress内購入トラブル一覧  |
|POST          |`/v1/disputes/{id}/messages`              |案件への回答            |

別途、/v1/me/* に利用者API、/v1/admin/* に運営者API、/v1/demo/* に隔離されたデモ操作APIを実装。/v1/checkout/* の承認はログイン利用者・CSRF対策・セッションの束縛を必須とする。

10.3 共通仕様

• 金銭的な変更POSTは Idempotency-Key 必須。その他の変更も可能な限り対応。
• キーのスコープはworkspace、認証主体、操作種別、対象リソースで決定。同じキー・同じ内容は同じ操作結果を返し、異なる内容は409。
• 正規化した入力ハッシュと結果を永続保存。同時到着は一意制約とロックで1回にする。
• 処理中は202と照会可能なoperation ID、または明示的な競合エラー。再試行で別操作を生成しない。
• 金銭操作のキーと業務上の重複防止識別子をデモworkspace寿命中保持する。期限後に同じ注文・請求周期を再処理できない設計。
• cursor方式ページング、フィルター、UTC ISO 8601日時、request ID、429＋Retry-After。
• APIにスタックトレース、秘密鍵、他加盟店の情報を返さない。
• 注文IDを知っていても他加盟店の注文を操作・閲覧できない。

注文例：

```json
{
  "merchant_order_id": "SHOP-2026-0001",
  "amount": {"currency": "JPY", "value": "12000"},
  "description": "ワイヤレスヘッドホン",
  "items": [
    {"name": "ワイヤレスヘッドホン", "quantity": 1, "unit_amount": {"currency": "JPY", "value": "12000"}}
  ],
  "metadata": {"store_order_id": "demo_order_001"}
}
```

商品明細合計と注文金額を検証する。割引等を追加する場合は内訳も明示して一致させる。

エラー例：

```json
{
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "利用可能残高が不足しています。",
    "request_id": "req_example",
    "details": []
  }
}
```

最低限のエラー：INVALID_REQUEST、UNAUTHENTICATED、FORBIDDEN、RESOURCE_NOT_FOUND、INVALID_STATE、EXPIRED、INSUFFICIENT_FUNDS、INSUFFICIENT_REFUND_FUNDS、CAPTURE_AMOUNT_EXCEEDED、REFUND_AMOUNT_EXCEEDED、IDEMPOTENCY_CONFLICT、ACCOUNT_RESTRICTED、PROVIDER_PENDING、RATE_LIMITED。

11. Webhook・非同期処理

• at-least-once配信。exactly-once配信を保証すると記載しない。
• event_id は再配信でも同じ。配信試行ごとにdelivery IDを発行。
• payloadにはevent ID、type、created_at、resource ID、resource version、必要最小限のデータを含める。
• ExPress-Signature: t=...,v1=...。HMAC-SHA256で timestamp + "." + raw_body を署名。
• 受信側はraw bodyで検証、定時間比較、時刻許容幅5分、event IDの重複排除。再送時は新しいtimestampで再署名する。
• 署名鍵のローテーションは移行期間を定義し、旧鍵・新鍵の検証手順をSDKに用意する。
• DBコミット後にoutboxを配信。指数バックオフとjitter、最大回数、dead-letter、手動再送。
• ワーカーのclaimにleaseを使い、プロセス停止後に回復可能にする。再起動で通知を失わない。
• 順序逆転に備えてイベントから古い状態へ戻さず、resource versionまたは最新API照会で収束させる。
• Webhook失敗を理由に成功済み決済を失敗へ戻さない。
• URL登録時と配信時にSSRF対策。公開HTTPSのみ、プライベート／ループバック／リンクローカル／クラウドメタデータ宛て拒否、DNS再検証、リダイレクト禁止、送信タイムアウト・サイズ制限。localhost例外はローカル開発モードで登録済みサンプルECだけに限定。
• 公開デモのWebhook宛先は管理者が設定したサンプルEC／受信テスターの許可リスト内のみ。訪問者が任意外部ホストへ通信させられないようにする。

必須イベント：checkout.approved、authorization.created、authorization.failed、authorization.voided、authorization.expired、capture.succeeded、capture.failed、refund.pending、refund.succeeded、refund.failed、payout.succeeded、payout.failed、subscription.activated、subscription.payment_succeeded、subscription.payment_failed、subscription.cancelled、dispute.opened、dispute.updated、account.restricted。

12. 定期課金

• 月額固定のJPYプラン。加盟店・金額・頻度・支払元・同意日時を利用者が明示的に承認する。
• 初回は同意待ち。加盟店APIだけでactiveにできない。
• 課金周期はUTCを基準として定義し、月末日を超える場合は月末へ丸める。テスト時計を注入する。
• (subscription_id, period_start) に一意制約。ジョブの再実行や並列起動でも1周期1回の債務・決済となる。
• 残高不足／模擬カード拒否はpast_due。初期ルールとして1日後・3日後の再試行、最大回数到達後の停止を実装。
• 再試行は同じ請求周期を参照。結果不明時に新規請求しない。
• 同意撤回後は新規課金しない。処理中の決済は明示した境界で扱い、確定済み取引を自動取消しない。
• 初版では日割りと自動値上げは対象外。プラン変更は新たな同意を得る。

13. SDK・サンプルEC・API Playground

ブラウザSDK

• ExPressCheckout.redirect({ checkoutUrl }) とポップアップ補助を提供。
• checkout URLは許可ExPressオリジンのみ。秘密鍵を引数・bundle・localStorageへ入れない。
• 型定義、読み込み例、失敗／取消／期限切れの扱いを記載。

サーバーSDK

• token取得と更新、注文作成、チェックアウト作成、照会、capture、void、refund、Webhook検証を実装。
• タイムアウト、エラー型、冪等キー、request ID、限定的な再試行。金銭POSTを再試行するときは同じキーを維持する。
• READMEの例が実際に動くことをテストする。外部パッケージレジストリへの公開は不要。

サンプルEC

• 商品一覧、詳細、カート、注文、ExPressボタン、戻り画面、購入履歴、返品依頼。
• ヘッドホン・キーボード等の架空商品5点。価格はECサーバーで決定し、ブラウザから金額を改ざんできない。
• 「即時売上確定」と「出荷時売上確定」を切替可能。
• 商品2個購入→一部出荷→部分capture→部分返金を操作可能。
• ECはSDK／公開API／Webhook経由でのみExPressへ接続。ExPressのDBを直接読まない。
• ローカルで同じPostgreSQLを使う場合も、ECは別DBまたは別権限でExPressテーブルにアクセスできなくする。
• 支払確定で架空の発送処理を1度だけ生成。重複Webhookで二重発送しない。

Playground

• 加盟店のデモ資格情報を使い、実際のAPIを呼び出す。
• request／response／status／latency／request ID／curl例を表示。
• 外部の任意URLへプロキシする機能にしない。許可されたExPress APIパスだけに限定。

14. DBモデルと制約

少なくとも次の概念を永続化する。命名変更は可能だが関係と責務を省略しない。

DemoWorkspace, User, Session, Merchant, MerchantMember, MerchantApplication, ApiCredential, Wallet, PaymentMethod, PaymentOrder, CheckoutSession, Authorization, Capture, Refund, ProviderAttempt, Topup, P2PTransfer, PaymentRequest, Payout, LedgerAccount, JournalEntry, JournalLine, SettlementLot, IdempotencyRecord, OutboxEvent, WebhookEndpoint, WebhookDelivery, Job, Plan, Consent, Subscription, BillingCycle, Dispute, DisputeMessage, Notification, RiskReview, AuditLog。

• 業務エンティティの外部参照はworkspaceを含む複合外部キー等で境界を保証する。
• 金額の非負、通貨一致、外部注文番号と業務イベントの一意性などは可能な範囲でDB制約も使う。
• 残高・資金移動を伴う削除は通常操作として用意しない。リセットは隔離デモ全体の再生成に限定。
• 監査ログには主体、操作、対象、理由、時刻、request ID、変更前後の非機密情報。
• タイムラインで「EC注文→ExPress注文→承認→オーソリ→capture→仕訳→Webhook→返金」を追跡可能にする。

15. 認証・アクセス制御

• HttpOnly・Secure（HTTPS環境）・適切なSameSite Cookie、CSRF対策、ログインのレート制限。
• 同一localhostの複数ポートはCookieが共有され得るため、ECとExPressでCookie名・セッションストアを分離する。
• CORSは許可オリジンに限定。credentialsとワイルドカードを組み合わせない。
• return URL、cancel URL、checkout URLを検証し、オープンリダイレクトを防ぐ。
• ユーザーの承認権限、加盟店scope、加盟店所属、運営者権限を各APIで確認。
• 公開デモのロール切替やシナリオAPIはデモworkspaceに閉じ、通常認証のバックドアにしない。
• secret・アクセストークン・Webhook鍵はログとAPIレスポンスから除外。暗号化が必要な鍵の保存は環境鍵で保護し、サンプル鍵と実鍵を区別する。
• 金銭操作にワンクリックの「全部成功」ショートカットを用意しない。デモでも実際の業務処理を通す。

16. デモシナリオパネル

シナリオは対象workspace、対象operationに紐づけ、通常リクエストの任意パラメーターで他者の処理を失敗させられないようにする。日時を進める機能はシステム時計ではなくworkspace内の業務時計に適用する。

必須シナリオ：

1. 残高支払い→即時capture→Webhook→EC支払済み。
2. 模擬カード支払い→capture→元カードへの返金。
3. 残高不足→模擬チャージ→再承認。
4. ユーザー承認後にブラウザ離脱→ECサーバー照会で復旧。
5. オーソリ後に未captureのまま期限切れ→保留解放。
6. 部分capture→未使用残額解放→部分返金。
7. 同じcaptureを並列・重複送信→1回だけ確定。
8. 同じ残高から異なる注文へ同時支払い→超過使用を防止。
9. providerタイムアウト後成功→照会復旧→二重計上なし。
10. Webhook 500→自動再送→EC状態更新。
11. Webhook重複・順序逆転→状態が後退しない。
12. 加盟店出金失敗→出金保留解放。
13. 出金後の返金原資不足→模擬追加入金→返金成功。
14. 定期課金失敗→次回再試行→成功、または同意撤回で停止。
15. アカウント支払制限→新規支払い拒否、過去明細と返金受取は可能。
16. 他加盟店・別workspaceへのアクセス→拒否。

パネルに操作前後の残高、状態遷移、台帳、APIログ、イベント配信を並べる。seed済みの架空データは「サンプル」と明記し、自動生成された履歴を実顧客の実績のように表示しない。

17. テストと受け入れ条件

金銭の一貫性・認可境界・外部EC連携を優先して検証してください。見た目と同じ値を繰り返すだけのテストではなく、不変条件と例外経路をテストします。

必須自動テスト

• 仕訳ごとの借貸一致、正本からの残高再計算一致。
• 100並列要求でも同じ冪等キーのcaptureは1回、別キーでも確定累計上限を超えない。
• 残高10,000円に対する同時8,000円支払い2件は両方成功しない。
• 異なるキーの部分返金を同時実行しても、処理中分を含めてcapture額を超えない。
• capture・void・期限切れ競合で二重解放しない。
• provider処理成功後、結果保存前に停止したケースを照会で回復できる。
• outboxのcommit後にworker停止→再起動で配信回復。
• Webhook署名不一致、古い署名、重複、順序逆転、鍵更新。
• 期限切れトークン、失効secret、scope不足、IDOR、workspace越境、CSRF、URL検証。
• capture前後／精算前後／出金後の返金と原資不足。
• 定期課金の周期重複、月末、同意撤回、再試行。
• SDKを使った別オリジンECで、購入→部分返金までのE2E。
• スマートフォン幅とデスクトップ幅で主要フローが操作可能。

完成判定

• クリーンな環境でREADME通りに起動・migration・seedできる。
• 利用者・加盟店・運営者・ECの画面から実際にAPIを呼び、DBへ反映される。
• OpenAPIと実装が一致し、API PlaygroundとSDK例が動く。
• 必須シナリオを再現でき、主要テストが通る。
• 金額や成功率を静的に盛ったダッシュボードがない。
• フェーズ1だけ完成して「完成」と報告しない。本書の全必須範囲を満たすか、未完了を具体的に列挙する。
• 外部サービス連携なしでも、標準MockProviderで一通り利用できる。

18. 実装順序

1. リポジトリ・実行環境確認、モノレポ、DB、設定、認証、workspace境界、OpenAPIの基盤。
2. 金額型、台帳、冪等性、残高、チャージ、送金、同時実行テスト。
3. 注文、checkout、承認、オーソリ、capture、取消、期限切れ、返金。利用者・加盟店の最小画面。
4. outbox・Webhook・ワーカー、サーバーSDK、ブラウザSDK、別オリジンサンプルEC。
5. 精算、出金、加盟店審査、権限、運営者調査、APIログ、台帳照会。
6. 支払リンク、支払依頼、定期課金、購入トラブル、通知、模擬リスク審査。
7. デモ隔離・リセット・時計・障害シナリオ、Playground、UI仕上げ、PWA、英語表示。
8. 統合テスト、E2E、ドキュメント、デモ撮影用手順、完成判定。

画面を全部先に作る進め方ではなく、決済1件がAPI・DB・台帳・ECまで通る縦の機能単位で完成させてください。

19. ドキュメントと納品報告

以下を作成してください。

• README.md：概要、デモ範囲、必要環境、Windowsでの起動、環境変数、migration、seed、テスト、各URL。
• .env.example：説明付き。実secretを含めない。
• docs/architecture.md：構成図、信頼境界、APIとワーカー、配備案。
• docs/payment-lifecycle.md：状態遷移、競合、期限切れ、結果不明時の回復。
• docs/ledger.md：勘定体系、各操作の仕訳、手数料、返金原資、整合性。
• docs/api.md とOpenAPIファイル：認証、全endpoint、curl、エラー、冪等性。
• docs/webhooks.md：署名、再送、重複、順序逆転、SSRF対策。
• docs/integration-guide.md：外部ECへの導入とSDK。
• docs/demo-scenarios.md：16シナリオの実行手順と期待結果。
• docs/security.md：認証・権限・workspace分離・模擬連携の境界。
• docs/implementation-status.md：必須要件との対応、完了・未完了、再開地点。
• docs/decisions.md：仕様上の判断と技術選定理由。
• docs/portfolio.md：自作デモとして説明できる事実、実装範囲、5分／15分デモ手順、実資金運用していない範囲。

最終報告には、起動方法、動く機能、テスト結果、実施できなかった検証、既知の制約を記載。実装していない機能や未計測の性能を実績として書かないでください。

20. 開始指示

本書を最後まで読み、まず環境と既存ファイルを確認してください。その後、順番に計画を立てて計画通りに直ちにコード作成、アプリケーション作成へ進んでください。通常の実装判断で確認待ちにならず、全フェーズを順番に完了させてください。重要な設計上の疑問は合理的なデモ仕様を採用して記録し、実装を進めてください。
