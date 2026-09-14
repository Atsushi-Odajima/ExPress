# ExPress — Claude Code 向けメモ

オンラインウォレット＋外部EC向けホスト型決済のデモ。実際の預金・送金・カード決済・有料契約は行わない（外部金融境界は `MockProvider`）。仕様の正本は `docs/SPECIFICATION.md`、状況は `docs/completion-report.md`、確認手順は `docs/final-review-guide.md`。

## 開発コマンド

- Node 24 / pnpm 11.19.0。`pnpm install --frozen-lockfile` → `docker compose up -d` → `pnpm db:migrate` → `pnpm dev`（または `pnpm run build` → `pnpm run start`）。
- 検証：`pnpm run typecheck`、`pnpm run test`（DB起動・通常worker停止）、`pnpm run verify:clean`、`pnpm run build`、`pnpm run test:e2e`（4サービス起動後。プロキシ環境では `NO_PROXY=localhost,127.0.0.1`）。
- `.env` は Git 対象外。`.env.example` が一覧。`ENCRYPTION_KEY` や DB パスワードをコミットしない。

## 公開・配備（docs/deploy.md）

- 手段A：PC で `pnpm exec tsx scripts/tunnel.ts`（cloudflared クイックトンネル、アカウント不要）。
- 手段B：`Dockerfile` ＋ `render.yaml`（Render Blueprint）＋ PostgreSQL 2系統（例：Render 無料 DB と Supabase 無料プロジェクト）。
- 公開構成では `API_URL=<PORTAL_URL>/api`（Portal が `/api` と `/docs` を `API_INTERNAL_URL` へ転送）、EC 引き渡しは `GET /connect?code=`。
- 配備用の資格情報は次の環境変数（またはクラウド環境の API credentials）にある前提で動く。存在しなければ利用者に設定を依頼し、チャットにトークンを貼らせない。
  - `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`（wrangler / Cloudflare API）
  - `SUPABASE_ACCESS_TOKEN`（Supabase Management API `https://api.supabase.com`）
  - `RENDER_API_KEY`（Render API `https://api.render.com/v1`）
  - `RAILWAY_TOKEN`（Railway CLI）
- 有料プランへの加入・課金・実資金の操作は行わない。無料枠の条件は各社の最新規約を確認し、確認できないことは「未確認」と報告する。
