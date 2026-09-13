# クラウド／別PCからの取得と起動

この資料とアプリソースを含むGitコミットを取得して作業します。Windows端末へのリモート接続やCドライブのマウントは不要です。以前の引き継ぎ時点では実装が未pushで、クラウド側には初期READMEしかありませんでした。その問題を解消するための移管です。

## 1. ソースを取得

新規環境：

```sh
git clone https://github.com/Atsushi-Odajima/ExPress.git
cd ExPress
git status --short
git log -1 --oneline
```

既に`/home/user/ExPress`へ初期READMEだけcloneしてある場合：

```sh
cd /home/user/ExPress
git status --short
git remote -v
git fetch origin
git switch main
git pull --ff-only origin main
```

未コミット変更やローカル独自commitがある場合は保持してから統合してください。`reset --hard`、`clean -fd`、force pushで消さないでください。

取得後に`package.json`、`pnpm-lock.yaml`、`apps/api/src/app.ts`、`apps/portal/components/portal.tsx`、`packages/database/src/ledger.ts`、`docs/SPECIFICATION.md`、`docs/HANDOFF.md`、`docs/COMPLETION-PROMPT.md`が存在することを確認します。初期commit `8929459`だけならまだ更新できていません。

Gitの利用が難しい場合はGitHubのCode → Download ZIP、または https://github.com/Atsushi-Odajima/ExPress/archive/refs/heads/main.zip でソースを取得できます。非公開リポジトリの場合は権限のあるGitHub認証が必要です。

## 2. 最初に読む資料

1. [COMPLETION-PROMPT.md](COMPLETION-PROMPT.md)：最終完成までの実行指示。
2. [HANDOFF.md](HANDOFF.md)：実装・設計・既知の不具合と検証。
3. [SPECIFICATION.md](SPECIFICATION.md)：ユーザーの全体開発仕様の保存版。
4. [implementation-status.md](implementation-status.md)：現在の残項目。
5. [verification-record.md](verification-record.md)：移管前の試験結果。元PCの`.local`ログを探す必要はありません。

`HANDOFF.md`内のWindowsパスは元PCの実装所在地です。クラウド側では取得したリポジトリルートに読み替えます。日時と試験結果は履歴であり、クラウドで再試験済みという意味ではありません。

## 3. Linuxの準備と起動

Node.js 24系、pnpm 11.19.0、PostgreSQLを使用します。環境の既存ランタイムとDBを先に確認してください。依存の一律アップグレードは不要です。

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
# .envが存在しない初回のみ実行
cp -n .env.example .env
```

Dockerが利用可能なら：

```sh
docker compose up -d
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```

Dockerを利用しない場合、利用可能なPostgreSQLサービスに専用`exw`／`exw_store`の別DB・別roleを作り、`.env`の接続先を設定してください。`packages/database/init-store.sql`が権限分離の基準です。共有DBの既存role／DBは削除・変更しないでください。API用ロールでのみ台帳DBへ接続でき、EC roleは台帳DBのCONNECTが拒否される必要があります。

`pnpm run db:local`はembedded-postgresで実PostgreSQLを起動する代替です。前担当の実測はWindowsのみ。LinuxではCPU／配布バイナリ／OS依存ライブラリを確認してください。PostgreSQL initdbはroot実行不可のため、rootしかない環境では非rootの実行基盤か既存DBサービスが必要です。この事情を「実装ソースがない」と取り違えず、DB環境の課題として切り分けます。

embedded-postgresの同梱READMEではpostinstallによるsymlink作成が必要です。Linuxでpnpmがネイティブ配布パッケージのbuildを停止した場合は、実際のCPUに対応する`@embedded-postgres/linux-x64`等とその固定バージョンを確認し、`pnpm-workspace.yaml`のallowBuildsを必要なパッケージだけ追加してください。現在の明示設定は検証済みWindows用で、Linuxのpostinstallは未検証です。

標準URLはPortal `http://localhost:3000`、EC `http://localhost:3001`、API `http://localhost:4000`。3000が使用中なら`PORTAL_PORT`と`PORTAL_URL`を一緒に変更。origin末尾にスラッシュを付けません。

API・EC・Portalはloopback待受です。クラウド内Playwrightは同じ環境のlocalhostへ接続します。人がブラウザで触る場合はその環境のプレビュー／ポート転送を使います。別hostnameの公開URLへ変更する場合はCookie、CSRF、CORS、URL許可設定との整合が必要で、localhostのCookie設定のまま動くとは想定しないでください。公開配備は今回の依頼範囲外です。

## 4. Linuxの画面試験

Windows既定はEdge、Linux/macOS既定はPlaywright管理のChromiumへ切り替えられる設定です。Linux/ChromiumのE2E結果はまだありません。

```sh
pnpm exec playwright install chromium
# OSライブラリが不足し、環境管理上インストール可能な場合のみ
# pnpm exec playwright install --with-deps chromium
pnpm exec playwright test --list
# 4サービスを起動してから、まず現在失敗している対象だけ
pnpm run test:e2e --grep 'デモパネルの同時承認'
```

`PLAYWRIGHT_CHANNEL=chromium`で明示可能。`msedge`／`chrome`も指定できますが、そのブラウザが環境に必要です。mobileはiPhone13幅のChromiumエミュレーションで、実iOS Safariの検証ではありません。

## 5. DB試験・ビルドの順序

```sh
# DBは起動し、通常workerは停止した状態
pnpm run typecheck
pnpm run test
# 検証用DBの作成権限がある場合
pnpm run verify:clean
pnpm run openapi
pnpm run build
# 別ターミナルで起動し続ける
pnpm run start
# 4サービス稼働後
pnpm run test:e2e
```

provider成功直後にworkerを停止する試験があるため、DB試験を通常workerと競合させないでください。buildはルート.envのURLをPortalへ埋め込みます。URL変更後は再buildが必要です。

## 6. 引き継がないローカル情報

`.env`、`.local/keys.json`、元PCのPostgreSQLデータ、node_modules、dist、Next生成物、rawテストログ／トレースはGitに含めません。新環境では新しいデモ鍵・DB・workspaceを生成します。元PCの利用者データや秘密鍵は完成に不要です。Git管理の`.env.example`内のDBパスワードはローカルデモ専用の公開サンプル値です。

アプリは完成判定前です。移管したことと不具合を修正したことを区別し、COMPLETION-PROMPTに従って残りを完成させてください。
