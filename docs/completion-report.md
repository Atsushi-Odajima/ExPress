# 完成報告（completion-report）

作成日：2026-09-13（UTC）。対象：ExPress（express-wallet / @exw）完成版。ソースは GitHub `Atsushi-Odajima/ExPress` のブランチ `claude/express-completion-delivery-e92pt1`（Git保存状態は第8節）。要件ごとの対応は [requirements-matrix.md](requirements-matrix.md)、元担当向けの確認手順は [final-review-guide.md](final-review-guide.md)、実行ログの抜粋は [evidence/acceptance-2026-09-13.md](evidence/acceptance-2026-09-13.md)。

## 1. 完成範囲

[SPECIFICATION.md](SPECIFICATION.md) の必須範囲を、DB・API・複式台帳・独立worker・別オリジンEC・SDK・UI・テスト・文書まで実装し、この環境で受入検証した。

- 利用者ウォレット（登録／ログイン／セッション失効、プロフィール・言語・timezone、模擬KYC・制限表示、通知、残高・保留・履歴、模擬カード／銀行、チャージ・P2P・支払依頼・出金、ホスト型チェックアウト、同意管理、案件、明細CSV・受領明細）。
- 加盟店・開発者ポータル（プロフィール・審査・5役割、実データの日次売上・手数料・残高、精算予定、決済検索・capture／void／refund、支払リンク／QR、アプリ・scope・secret lifecycle、return／cancel URL完全一致、Webhook設定・鍵更新・配信／再送・テスト、APIログ、Playground（POSIX／PowerShell curl）、OpenAPI／Swagger UI、SDK例・署名検証例、精算／出金、プラン・購読・再試行履歴、案件対応、権限なし表示）。
- 運営者コンソール（横断検索・仕訳検索、能力別制限・模擬審査と理由／監査、riskルール、案件仲介、台帳整合性、調整仕訳／反対仕訳、設定、job／outbox／provider不明の調査と理由付き再試行・再送、注文timeline）。
- 共通（workspace／generation隔離・reset・業務時計、JPY整数・不変台帳・排他・永続冪等性（金銭POST必須、加盟店の非金銭変更は任意）、独立状態モデル、非同期回復、認証／CSRF／CORS／IDOR／URL／SSRF、API契約、EC連携、日英／dark／mobile／keyboard／失敗状態、静的資産限定PWA）。
- 引き継ぎ時の既知の失敗2件（並列操作パネルE2E、Playground curl例）は修正済み。

## 2. 起動方法と環境

README の手順で起動する（`cp .env.example .env` → `pnpm install --frozen-lockfile` → `docker compose up -d` → `pnpm run db:migrate` → `pnpm run db:seed` → `pnpm run dev`）。Portal http://localhost:3000、EC http://localhost:3001、API http://localhost:4000（Swagger UI `/docs`）。

検証環境：Linuxコンテナ（Ubuntu 24.04、x86_64、4 CPU、16 GB）、Node.js 24.21.0（nvm）、pnpm 11.19.0、Docker 29.3.1 / Compose v5.1.1、PostgreSQL 18.6（Compose、`postgres:18.6`）およびシステムPostgreSQL 16.13、Playwright 1.63.0 と管理Chromium 1243（Chrome Headless Shell 153）。

## 3. 実測結果（最終コード）

|検証|結果|日時（UTC）|備考|
|---|---|---|---|
|`pnpm install --frozen-lockfile`|成功|06:40頃|`@embedded-postgres/linux-x64` の postinstall 許可を追加|
|Docker Compose クリーン起動|成功|06:5x|`docker compose pull`／`up -d` → healthy。init SQL で `exw_store` role と `exw` DB の CONNECT 拒否を確認|
|`pnpm run typecheck`|合格|07:18:51|`tsc --noEmit`|
|`pnpm run test`|**39件合格・0失敗**（28.7秒）|07:18:51|PostgreSQL 18.6、通常worker停止。同スイートは PostgreSQL 16.13 でも（38件時点で）全件合格|
|`pnpm run verify:clean`|合格|07:16|新規の空DBへ migration 2回・seed・HTTP SDK 決済／部分返金・台帳照合・EC role の台帳DB接続拒否（42501）|
|`pnpm run openapi`|合格|07:16|`packages/contracts/openapi/exw-v1.json` と `docs/api-endpoints.md` を再生成しGit管理|
|`pnpm run build`|合格|07:16〜07:17|server tsc + Next production build|
|`pnpm run start`|合格|07:17|API・worker・EC・Portal の4プロセスが起動、health OK|
|`pnpm run test:e2e`|**14件合格・0失敗**（1.1分）|07:17:11〜07:18:21|desktop（Desktop Chrome）と mobile（iPhone 13 エミュレーション）各7件、production start、PostgreSQL 18.6|

E2E 7ケース：別オリジンSDK購入→一部出荷→部分返金／英語切替・加盟店検索・共有QR・運営者の能力別設定／WebhookでECが支払済みに収束（即時確定・ECサーバー照会capture・500再送・鍵更新・重複・順序逆転で二重発送なし）／加盟店・運営者・PWA・ダークモード（read_onlyの権限なし表示を含む）／模擬カード直接払いと元カード返金／Playground実注文・APIログ・管理者の調整仕訳と反対仕訳／デモパネルの同時承認と100重複captureが1回。

補足：受入チェーンの1回目（07:11〜07:13）はPC幅の「加盟店・運営者・PWA」1件が、人物切替の応答前に `page.goto` する競合で失敗した（13/14）。Portal の切替中無効化とテストの完了待ち（選択値の更新）を入れ、アプリ再ビルド後の2回目で 14/14 合格。unit suite は2回目チェーン内でも 38/38、シナリオ5のテスト追加後の最終実行で 39/39。

## 4. 必須16シナリオ

すべて再現手順を [demo-scenarios.md](demo-scenarios.md) に記載し、自動検証を紐付けた。結果は上記の最終実行によるもの。

|#|シナリオ|自動検証|結果|
|---|---|---|---|
|1|残高支払い→即時capture→Webhook→EC支払済み|E2E 3|合格|
|2|模擬カード支払い→capture→元カード返金|E2E 5、単体|合格|
|3|残高不足→模擬チャージ→再承認|単体（シナリオ3）|合格|
|4|承認後ブラウザ離脱→ECサーバー照会復旧|E2E 3|合格|
|5|未captureオーソリ期限切れ→保留解放|単体（シナリオ5）|合格|
|6|部分capture→残額解放→部分返金|E2E 1|合格|
|7|同capture並列・重複→1回だけ確定|単体、E2E 7|合格|
|8|同残高から異なる注文へ同時支払い→超過禁止|単体、E2E 7|合格|
|9|provider timeout後成功→照会復旧→二重計上なし|単体 worker（シナリオ9）、process-recovery|合格|
|10|Webhook500→自動再送→EC更新|E2E 3、単体 worker|合格|
|11|Webhook重複・順序逆転→後退／二重発送なし|E2E 3、単体 worker|合格|
|12|加盟店出金失敗→保留解放|単体|合格|
|13|出金後の返金原資不足→追加入金→返金|単体|合格|
|14|定期課金失敗→同周期再試行、または同意撤回で停止|単体|合格|
|15|can_pay制限→新規拒否、過去明細と返金受取は可|単体|合格|
|16|他加盟店・別workspaceアクセス→拒否|単体|合格|

手動操作の手順（デモ操作パネル・EC画面）は同じ結果を画面から再現するためのもので、上記の合格判定は自動テストによる。

## 5. 引き継ぎ後の主な変更

詳細は [final-review-guide.md](final-review-guide.md) 第4節と [decisions.md](decisions.md)。

1. 並列操作パネル E2E の修正（label の htmlFor/id、人物切替・描画の完了待ち）。
2. Playground curl 例の修正（body・Content-Type、環境変数の二重引用符、シェルごとの quote、PowerShell 例、応答 schema、実行テスト）。
3. API：加盟店の非金銭変更に任意 Idempotency-Key（秘密は再表示しない）、運営者の仕訳検索・通知再送・ジョブ再試行、timeline 拡張、加盟店概要の精算ロット・請求周期。
4. UI：権限なし表示、精算予定、請求周期履歴、署名検証例、運営者の再送・再試行、仕訳検索、人物切替中の無効化。
5. テスト：単体 6件追加（33→39）、E2E の拡張（シナリオ1・4・権限なし・切替完了待ち）。
6. 環境・文書：Linux 実測手順、README・API・Webhook・security・scenarios・decisions・implementation-status・portfolio・architecture・integration-guide・lifecycle の更新、要件対応表・完成報告・確認ガイド・証跡の新規作成。

## 6. 未実施検証・制約

- 公開配備、実 iOS Safari と Edge 以外の実ブラウザ（この環境は Playwright 管理 Chromium 153。前担当の Windows Edge 実測は [verification-record.md](verification-record.md)）、包括的アクセシビリティ監査、負荷性能、外部侵入試験は未実施。
- PowerShell（curl.exe）の curl 例は quote 規則の静的検証のみ。POSIX 例は sh で実行検証済み。
- `pnpm db:local`（embedded-postgres 18.4）は root 環境の制約で Linux では未実行。Windows の実測は前担当記録による。
- 範囲外：実預金・送金・カード・KYC・メール送信、混合払い・FX・日割り、複数 API プロセスでの共有レート制限ストア。workspace 内の金銭操作は直列化しており、商用 TPS は主張しない。
- 手動確認のみの項目（支払依頼リンク、加盟店プロフィール・設定変更、SINGLE_WORKSPACE モード、印刷用受領明細）は API・DB 経由の実装があり、要件対応表で「手動確認」と区分した。

## 7. 納品物

- ソース一式：GitHub `https://github.com/Atsushi-Odajima/ExPress` ブランチ `claude/express-completion-delivery-e92pt1`。`main` は移管時点（`430d918`）のまま。作業環境のローカルパスは `/home/user/ExPress`（一時コンテナ。永続的な所在は GitHub）。
- 秘密を含まないアーカイブが必要な場合：`git archive --format=zip -o express-wallet.zip claude/express-completion-delivery-e92pt1`（`.env`・`.local`・`node_modules`・`dist`・`.next`・`test-results` は Git 対象外のため含まれない）。
- 文書：README、docs/（要件対応表、完成報告、確認ガイド、設計・API・Webhook・台帳・ライフサイクル・シナリオ・セキュリティ・判断記録・実装状況・証跡）。

## 8. Git 保存状態

- コミット対象：アプリ・API・テスト・OpenAPI 生成物・文書（第5節の変更）。`.env`、`.local/`、`node_modules`、`dist`、`apps/portal/.next`、`test-results`、`playwright-report` は含めない。
- コミット／push の実施状況と最終 commit ハッシュは本ファイル末尾の「Git 記録」に記載する。

## Git 記録

- 実装・文書のコミット：`1f1d5746b17337b87298dd278400981441ec8b1b`（ブランチ `claude/express-completion-delivery-e92pt1`、base `430d918`）。
- push：`git push -u origin claude/express-completion-delivery-e92pt1` を実施（結果は本ファイルを含む後続コミットと GitHub のブランチで確認できる）。
- `.env`・`.local`・`node_modules`・`dist`・`.next`・`test-results` はコミットに含まれない。

## 9. 追加依頼：公開デプロイと画面確認（2026-09-13 09:19〜09:40 UTC）

依頼：Cloudflare 等へデプロイし、ロゴを付けて、スマートフォンで画面UIを確認したい。

- **公開デプロイは未実施。** この作業環境は外向きの直接通信が遮断されており（TCP 7844・直接HTTPSとも不可）、Cloudflare Tunnel（cloudflared）はプロキシ経由のリリース取得も 403 で不可。Cloudflare アカウント・API トークンや Node 実行基盤・PostgreSQL ホストの資格情報もない。ExPress は Next Portal・Fastify API・独立 worker・別オリジン EC・PostgreSQL の常駐構成で、Cloudflare Workers／Pages 単体では動かない。
- **実施したこと（ロゴ）**：`scripts/icons.ts` で ExPress マークから PNG アイコン（`icon-192.png`、`icon-512.png`、`icon-maskable-512.png`、`apple-touch-icon.png`）を生成し、manifest・Next metadata（icons／appleWebApp）・viewport themeColor・service worker の静的キャッシュ一覧へ反映。NORTHSTAR EC にも favicon を追加。本番起動で各アイコンが 200 で配信されることを確認。
- **実施したこと（画面確認）**：`scripts/ui-gallery.ts` で本番ビルドを実操作しながら iPhone 13 幅 32 画面＋PC幅 5 画面を撮影し、スマートフォン閲覧用ギャラリーを Artifact として公開：https://claude.ai/code/artifact/c0707020-5e70-47a9-8cef-2370eab435fc（要 claude.ai ログイン、6.4 MB）。
- **検証**：`pnpm run typecheck` 合格、E2E サブセット（PWA・別オリジン購入）4件合格、アイコン変更後の全 E2E：14 passed (1.1m)（production start、PostgreSQL 18.6）。単体スイートは API 変更がないため再実行していない（直前の 39/39 が最終）。
- **実機で触るための選択肢**：(1) PC で `pnpm run start` を動かし、アカウント不要の `cloudflared tunnel --url` を Portal・API・EC の3つ分起動して得た URL を `.env` の `PORTAL_URL / API_URL / STORE_URL` に設定し再ビルド（Cookie は same-site、CSRF は Origin 完全一致で動作）。(2) Railway・Render・Fly.io などの Node ホスティング＋マネージド PostgreSQL に4サービスを配置し、Cloudflare は DNS／TLS の前段に置く（環境変数は `.env.example`、公開条件は `docs/security.md`）。(3) 同一 Wi-Fi の PC の LAN アドレスを各 URL に設定して起動し、スマートフォンから直接開く。

## 10. 追加依頼：公開手段の作成（2026-09-13 22:15〜22:45 UTC）

依頼：「Supabase等のPostgreSQL＋Node ホスティング（Cloudflare は前段）」または「PC＋cloudflared クイックトンネル」の計画で作成する。手順書は [deploy.md](deploy.md)。

- **追加したもの**：`scripts/tunnel.ts`（アカウント不要のクイックトンネル2本、`.env` 退避・書き換え・復元、再ビルド、起動、QR表示）、`Dockerfile`／`.dockerignore`（1イメージ4プロセス）、`render.yaml`（無料枠向け Blueprint）、`docs/deploy.md`。
- **アプリ側の変更**：Portal が `/api/*` と `/docs` を `API_INTERNAL_URL` へ同一オリジン転送（`API_URL=<PORTAL_URL>/api` を許可）。EC への引き渡しをトップレベル遷移 `GET /connect?code=`（一度限り・5分失効、無効時は 401 と戻りリンク）に変更し、`POST /connect` も維持。`LISTEN_HOST`・`PORT` フォールバック・`COOKIE_SAMESITE`・`WORKER_IN_API` を追加。Playground と EC のサーバー間呼び出しは `API_INTERNAL_URL` を使用。理由（Public Suffix List と Cookie）は [decisions.md](decisions.md) と [security.md](security.md)。
- **検証（同一オリジン構成）**：`.env` を `API_URL=http://localhost:3000/api`・`API_INTERNAL_URL=http://127.0.0.1:4000` にして `pnpm run build` → `pnpm run start` → `/api/v1/health` 200・`Set-Cookie` 通過・OpenAPI `servers` が `http://localhost:3000/api`・`/docs`／`/docs/static/*`／`/docs/json` 200 を確認 → `pnpm run test:e2e`：**14 passed (1.2m)**（desktop・mobile、production start、PostgreSQL 18.6、Playwright 管理 Chromium）。E2E 1 は Portal の「NORTHSTAR STOREへ」から `GET /connect` 経由で EC に接続し、無効コードの 401 も検証。途中、同じサービスに対する E2E を誤って2本同時に走らせた回は 2 件失敗（ダイアログ二重表示・trace ファイル競合）したが、単独で再実行した最終回は 14/14。
- **検証（Docker）**：`docker build`（node:24-bookworm-slim、この環境の代理CAを追加した一時変種で実行、本体の `Dockerfile` と差分は CA の3行のみ）成功。イメージから API（migration 実行後に起動）・EC・Portal を Compose の PostgreSQL 18.6 に接続して起動し、`/v1/health`・EC `/`・Portal `/wallet`・Portal 経由 `/api/v1/health`・`/docs` がすべて 200。`WORKER_IN_API=true` で API を起動すると worker ループ開始ログが出て、`POST /v1/demo/start` 200。
- **検証（トンネルスクリプト）**：スタブ `cloudflared`（実物と同じ形式で URL を stderr に出力）で `--skip-build --skip-start` を実行し、`PORTAL_URL`／`API_URL=<Portal>/api`／`STORE_URL`／`API_INTERNAL_URL`／`WEBHOOK_ALLOWLIST`／`DEMO_MODE` の書き込み、終了時の `.env` 復元とバックアップ削除、`--keep-env` 時の保持、バイナリ不在時のエラーメッセージを確認。
- **最終確認**：`pnpm run typecheck` 合格、`pnpm run test` **39/39**（22:39 UTC、PostgreSQL 18.6）、`.env` は作業前の内容に復元済み。
- **未実施（正直な区分）**：実際の Cloudflare クイックトンネル接続（この環境は外向き通信が遮断され、cloudflared の取得も 403）、Render／Railway／Fly.io／Supabase への実配備、独自ドメイン・Cloudflare DNS。無料枠の条件（常駐 worker の有無、DBの期限・停止）は各社の最新の規約を確認する必要があり、ここでは契約・課金を一切行っていない。
