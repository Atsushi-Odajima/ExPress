# 公開とスマートフォンからの画面確認

ExPress を自分のスマートフォンから触れる状態にする手順です。二つの方法があります。

|方法|必要なもの|費用|向いている用途|
|---|---|---|---|
|**A. PCで起動し、Cloudflare クイックトンネルで公開**|PC（Windows / macOS / Linux）、`cloudflared`|無料、アカウント不要|数分〜数時間のUI確認。PCを閉じると終了|
|**B. Docker イメージを Node ホスティングへ常時配備**|Render / Railway / Fly.io などのアカウント、PostgreSQL ×2（Supabase など）、任意で Cloudflare DNS|各社の無料枠または従量課金|URLを共有して常時確認|

どちらも実際の預金・送金・カード決済は行いません（外部金融境界は `MockProvider`）。有料契約を結ぶかどうかは利用者の判断で、このリポジトリのファイルは何も契約しません。

## 0. 仕組み：なぜ静的ホスティングだけでは動かないか、Cookieをどう守るか

ExPress は Next（Portal）・Fastify API・常駐 worker・別オリジンのサンプルEC（NORTHSTAR）・PostgreSQL 2系統（台帳 `exw` とEC `exw_store`、別role）で構成されます。Cloudflare Pages / Workers のような静的・エッジ実行だけでは動きません。Node プロセスと永続 PostgreSQL が必要です。

公開ホストの多くは **Public Suffix List** に登録されています（`trycloudflare.com`、`onrender.com`、`up.railway.app`、`fly.dev`、`pages.dev`、`workers.dev`、`supabase.co` など）。そのため `aaa.trycloudflare.com` と `bbb.trycloudflare.com` はブラウザから見て別サイトで、`SameSite=Lax` の Cookie は `fetch` で送られず、Safari はサードパーティ Cookie 自体を遮断します。Portal・API・EC を別ホストに置くと、ログイン Cookie が API に届きません。

そこで公開構成では次の二つでCookieを常にファーストパーティに保ちます。

1. **同一オリジンの `/api` プロキシ**：Portal（Next）が `/api/*` を `API_INTERNAL_URL`（APIサービスの内部アドレス）へ転送します（`apps/portal/next.config.ts` の `rewrites`）。`API_URL=<PORTAL_URL>/api` と設定すると、ブラウザはPortalと同じオリジンにしかアクセスしません。Swagger UI 用に `/docs` も転送します。
2. **ECへの引き渡しはトップレベル遷移**：「サンプルECを開く」は `GET <STORE_URL>/connect?code=...`（一度限り・5分で失効する接続コード）へページ遷移し、ECが自分のオリジンで Cookie を発行してからトップページへリダイレクトします。従来の `POST /connect`（同一サイト前提）も残しています。

結果として公開ホスト名は **Portal と EC の2つ** だけで済み、`COOKIE_SAMESITE` は既定の `lax` のままで動きます。`COOKIE_SAMESITE=none` は「HTTPSで、かつ Portal と API を別ホストに置きたい」ときだけの選択肢で、Safari では動かないため推奨しません。

## A. PCで起動して Cloudflare クイックトンネルで公開（アカウント不要）

`cloudflared tunnel --url http://localhost:PORT` は Cloudflare アカウントなしで `https://<ランダム>.trycloudflare.com` を発行します。`scripts/tunnel.ts` がこれを Portal と EC の2本分開き、URLを `.env` に書き込んで本番ビルド・起動まで行います。

### 準備（初回のみ）

1. `cloudflared` を入れる。
   - Windows（PowerShell）：`winget install --id Cloudflare.cloudflared`
   - macOS：`brew install cloudflared`
   - Linux：Cloudflare の apt / rpm リポジトリ、または GitHub Releases（cloudflare/cloudflared）のバイナリ
   - PATH に無い場合は環境変数 `CLOUDFLARED` に実行ファイルのフルパスを指定できます（例：`$env:CLOUDFLARED="C:\tools\cloudflared.exe"`）。
2. README の手順で PostgreSQL と依存関係を用意する。

```powershell
git clone https://github.com/Atsushi-Odajima/ExPress.git
cd ExPress
Copy-Item .env.example .env
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:migrate
```

### 公開する

```powershell
pnpm exec tsx scripts/tunnel.ts
```

スクリプトは次を行います。

1. `cloudflared` を2本起動し、Portal（`PORTAL_PORT`、既定3000）と EC（`STORE_PORT`、既定3001）の公開URLを受け取る。
2. `.env` を `.env.tunnel-backup` に退避し、`PORTAL_URL` / `API_URL=<Portal>/api` / `STORE_URL` / `API_INTERNAL_URL=http://127.0.0.1:<API_PORT>` / `WEBHOOK_ALLOWLIST=<EC>/webhooks/express-wallet` / `DEMO_MODE=local` を書き込む。
3. `pnpm run build` 相当（Portal に公開URLを埋め込む）→ `pnpm run start` 相当（API・worker・EC・Portal）を起動する。
4. 端末に **QRコード** と URL を表示する。スマートフォンのカメラで読むだけで `https://<ランダム>.trycloudflare.com/wallet` が開きます。

Ctrl+C で全プロセスを止め、`.env` を元に戻します。フラグ：`--skip-build`（前回のビルドを再利用。URLは毎回変わるので通常は再ビルドが必要）、`--skip-start`（トンネルを開いて `.env` を書くだけ）、`--keep-env`（終了時に `.env` を戻さない）。

### 注意

- URL は起動ごとに変わり、動作保証（SLA）はありません。発行直後は到達まで30秒程度かかることがあり、Cloudflare の 1033 エラーが出たら少し待って再読み込みしてください。
- URL を知っている人は誰でもデモを操作できます。デモ用ワークスペースは訪問者ごとに隔離され（`SINGLE_WORKSPACE=false`）、実資金・秘密鍵は含みませんが、確認が終わったらトンネルを閉じてください。
- PC 側の待ち受けは loopback のままです（`LISTEN_HOST=127.0.0.1`）。トンネルは同じPC内から接続するので、ファイアウォールの受信許可は不要です。
- 送信元 Origin の厳密一致（CSRF 対策）と Webhook 許可リストは公開URLに合わせて自動設定されます。

## B. Docker イメージを Node ホスティングへ常時配備

### イメージ

ルートの `Dockerfile` は multi-stage で 1 つのイメージを作り、起動コマンドで役割を選びます。

|役割|コマンド|
|---|---|
|API（先に migration）|`sh -c "node dist/packages/database/src/migrate.js && node dist/apps/api/src/index.js"`|
|worker|`node dist/apps/worker/src/index.js`|
|EC|`node dist/apps/demo-store/src/index.js`|
|Portal|`node node_modules/next/dist/bin/next start apps/portal --hostname 0.0.0.0 --port $PORT`|

Portal は **ビルド時**に `PORTAL_URL` / `API_URL` / `STORE_URL` / `API_INTERNAL_URL` を埋め込みます（`/api` と `/docs` の転送先も含む）。`docker build --build-arg API_URL=... --build-arg PORTAL_URL=... --build-arg STORE_URL=... --build-arg API_INTERNAL_URL=...` で渡すか、環境変数をビルド引数として渡すホスト（Render など）を使い、URLを変えたら再ビルドしてください。

### 環境変数（`DEMO_MODE=public`）

|変数|値|
|---|---|
|`DEMO_MODE`|`public`（HTTPS URL・隔離ワークスペース・別DBを強制）|
|`LISTEN_HOST`|`0.0.0.0`（コンテナ内では必須）|
|`PORT` / `API_PORT` / `STORE_PORT` / `PORTAL_PORT`|ホストが注入する `PORT` をそのまま使えます|
|`DATABASE_URL`|台帳DB（role `exw`）|
|`STORE_DATABASE_URL`|EC用DB（role `exw_store`）。`DATABASE_URL` と別サーバーまたは別DB・別role|
|`ENCRYPTION_KEY`|32バイトの hex（`openssl rand -hex 32`）。API と worker は同じ値|
|`PORTAL_URL`|`https://<Portalのホスト>`|
|`API_URL`|`https://<Portalのホスト>/api`|
|`STORE_URL`|`https://<ECのホスト>`|
|`API_INTERNAL_URL`|API サービスの内部アドレス（Render：`http://exw-api:10000`、Railway：`http://exw-api.railway.internal:<PORT>`、Fly：`http://exw-api.internal:<PORT>`）。単一ホストなら `http://127.0.0.1:4000`|
|`WEBHOOK_ALLOWLIST`|`https://<ECのホスト>/webhooks/express-wallet`|
|`WORKER_IN_API`|`true` にすると worker のループを API プロセス内で実行（無料枠に常駐 worker がないホスト向け）。既定 `false` は独立プロセス|
|`SETTLEMENT_DELAY_SECONDS`|精算待機秒数（例 `60`）|
|`COOKIE_SAMESITE`|既定 `lax` のまま|

DB接続文字列は各社が示す **SSL 必須**の形式（`?sslmode=require` など）をそのまま使います。Supabase は IPv4 環境から接続する場合「Session pooler」の接続文字列を選んでください（migration が `pg_advisory_xact_lock` を使うため、Transaction pooler ではなく Session モードを推奨）。

### PostgreSQL を2系統用意する

- 台帳 `exw` と EC `exw_store` は別 role で、EC role が台帳DBに接続できないことが要件です（ローカルでは `pnpm run verify:clean` が検証）。
- 別サーバー（別プロジェクト）にすれば自動的に満たされます。例：台帳＝ホスティング付属の PostgreSQL、EC＝Supabase の無料プロジェクト（または Supabase プロジェクト2つ）。
- 同一サーバーに置く場合は `packages/database/init-store.sql` と同じ内容（`exw_store` role 作成、`exw_store` DB 作成、`REVOKE CONNECT ON DATABASE exw FROM exw_store`）を管理者権限で実行します。
- 無料枠のDBには期限や自動停止の条件があります。各社の最新の条件を確認してください。

### Render（Blueprint）

`render.yaml` は無料枠向けの構成です：無料 PostgreSQL 1つ（台帳）、web サービス3つ（API + worker 内蔵、EC、Portal）。

1. GitHub にリポジトリを置き、Render ダッシュボードで **New → Blueprint** からリポジトリを選ぶ。
2. `sync: false` の値を聞かれる。初回は `STORE_DATABASE_URL`（Supabase などの接続文字列）と `ENCRYPTION_KEY` を入れ、URL 系は仮の値（`https://example.invalid` など）で作成する。
3. 作成後に各サービスの実ホスト名（`https://exw-portal-xxxx.onrender.com` など）を確認し、全サービスの `PORTAL_URL` / `API_URL`（`<Portal>/api`）/ `STORE_URL` / `API_INTERNAL_URL`（`http://exw-api:10000`）/ `WEBHOOK_ALLOWLIST` を実値に更新して **再デプロイ**する（Portal はビルドし直しが必要）。
4. `https://<Portal>/wallet` をスマートフォンで開く。

有料プランでは `render.yaml` 末尾のコメントの `exw-worker` を有効化し、API の `WORKER_IN_API` を `false` にすると独立 worker 構成になります。無料 web サービスはアイドル後に停止し、初回アクセスに1分程度かかります。

### Railway / Fly.io

- Railway：1プロジェクトに同じリポジトリから4サービス（API・worker・EC・Portal）を作り、各サービスの Start Command を上の表のコマンドにする。PostgreSQL を2つ追加（または片方を Supabase）。Private Networking の `http://<service>.railway.internal:<PORT>` を `API_INTERNAL_URL` に。URL は各サービスの Public Networking で発行してから環境変数に入れ、Portal を再ビルド。
- Fly.io：`fly launch` で Dockerfile からアプリを作り、`fly.toml` の `[processes]` に `api`・`worker`・`store`・`portal` を定義（または4アプリ）。内部アドレスは `http://<app>.internal:<port>`。`fly secrets set` で `ENCRYPTION_KEY` などを設定。
- どちらも従量課金または期限付き無料枠です。契約するかどうかは利用者の判断に委ねます。

### Cloudflare を前段に置く（任意）

Render などのホスト名のまま動きますが、独自ドメインを使う場合は Cloudflare DNS に `CNAME portal → <Portalのホスト>`、`CNAME shop → <ECのホスト>` を登録し（プロキシ有効、SSL/TLS は Full (strict)）、ホスト側でカスタムドメインを追加します。`PORTAL_URL` / `API_URL` / `STORE_URL` / `WEBHOOK_ALLOWLIST` を独自ドメインに変えて Portal を再ビルドしてください。独自ドメインは Public Suffix List に載らないため Cookie の制約は緩みますが、`/api` プロキシ構成をそのまま使うのが最も単純です。

## この環境で検証したこと・していないこと

- 検証済み：`API_URL=<Portal>/api` の同一オリジン構成で本番ビルド → 4サービス起動 → Playwright E2E（desktop・mobile）、Swagger UI（`/docs`）とアセットの転送、`Set-Cookie` の通過。`GET /connect?code=` によるEC引き渡し（E2E 1がPortalのボタン経由で実行）。`Dockerfile` のビルドと、イメージから API（migration 実行）・EC・Portal を起動して Compose の PostgreSQL に接続するスモーク。`scripts/tunnel.ts` はスタブの `cloudflared` で URL 解析・`.env` 書き換え・復元を確認。
- 未検証：実際の Cloudflare クイックトンネル（この作業環境は外向き通信が遮断されている）、Render / Railway / Fly.io / Supabase への実配備、独自ドメインと Cloudflare DNS。これらは利用者のアカウントで行う作業で、ここでは資格情報を扱っていません。実測結果は [completion-report.md](completion-report.md) を参照してください。
