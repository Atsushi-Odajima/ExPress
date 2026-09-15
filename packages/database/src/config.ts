import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const candidateRoot=resolve(import.meta.dirname,'../../..');
export const root = existsSync(resolve(candidateRoot,'pnpm-workspace.yaml'))?candidateRoot:resolve(candidateRoot,'..');
const local = process.env.DEMO_MODE !== 'public';
function encryptionKey() {
  if (process.env.ENCRYPTION_KEY) {
    const raw=process.env.ENCRYPTION_KEY.trim();
    if (/^[a-f0-9]{64}$/i.test(raw)) return raw.toLowerCase();
    // Hosts that generate secrets (Render generateValue) hand out base64 of 256 random bits; accept that and normalise to hex.
    const decoded=/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)?Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64'):Buffer.alloc(0);
    if (decoded.length===32) return decoded.toString('hex');
    throw Error('ENCRYPTION_KEY must be 32 bytes as 64 hex characters or base64');
  }
  if (!local) throw Error('Public demo requires ENCRYPTION_KEY');
  const file=resolve(root,'.local/keys.json'); mkdirSync(resolve(root,'.local'),{recursive:true});
  if (!existsSync(file)) { try { writeFileSync(file,JSON.stringify({key:randomBytes(32).toString('hex')}),{flag:'wx',mode:0o600}); } catch(e) { if(!existsSync(file)) throw e; } }
  return JSON.parse(readFileSync(file,'utf8')).key as string;
}
// Hosts such as Render generate STORE_DB_PASSWORD server-side and expose the database host separately; the store URL is then composed here (see packages/database/src/bootstrap-store.ts and render.yaml).
const composedStoreUrl=process.env.STORE_DB_HOST&&process.env.STORE_DB_PASSWORD?`postgresql://${encodeURIComponent(process.env.STORE_DB_ROLE||'exw_store')}:${encodeURIComponent(process.env.STORE_DB_PASSWORD)}@${process.env.STORE_DB_HOST}:${process.env.STORE_DB_PORT||'5432'}/${process.env.STORE_DB_NAME||'exw_store'}`:undefined;
export const config = {
  databaseUrl:process.env.DATABASE_URL??'postgresql://exw:exw_local_only@127.0.0.1:54329/exw',
  /** STORE_DATABASE_URL, or composed from STORE_DB_HOST / STORE_DB_PORT / STORE_DB_ROLE / STORE_DB_NAME / STORE_DB_PASSWORD for hosts that generate the password server-side (Render Blueprint) and run one PostgreSQL instance with bootstrap-store.ts. */
  storeDatabaseUrl:process.env.STORE_DATABASE_URL||composedStoreUrl||'postgresql://exw_store:exw_store_local_only@127.0.0.1:54329/exw_store',
  apiUrl:process.env.API_URL??'http://localhost:4000', portalUrl:process.env.PORTAL_URL??'http://localhost:3000', storeUrl:process.env.STORE_URL??'http://localhost:3001',
  /** Server-to-server address of the API (Playground, sample store). Defaults to the local listener; set it when API_URL is a public or proxied URL. */
  apiInternalUrl:process.env.API_INTERNAL_URL||(process.env.API_INTERNAL_HOSTPORT?`http://${process.env.API_INTERNAL_HOSTPORT}`:`http://127.0.0.1:${Number(process.env.API_PORT??process.env.PORT??4000)}`),
  /** PORT is honoured so that container hosts that inject one port per service work without extra settings. */
  apiPort:Number(process.env.API_PORT??process.env.PORT??4000), storePort:Number(process.env.STORE_PORT??process.env.PORT??3001), portalPort:Number(process.env.PORTAL_PORT??process.env.PORT??3000),
  /** Loopback by default; containers must bind 0.0.0.0. */
  listenHost:process.env.LISTEN_HOST??'127.0.0.1',
  workerInApi:process.env.WORKER_IN_API==='true',
  /** Built-in sign-in for the sample consumer account, shown on the welcome screen. It only opens the visitor's
   *  own isolated workspace, exactly what the "start a demo wallet" button creates, so it grants nothing extra.
   *  Set DEMO_LOGIN_PASSWORD to an empty value to remove the built-in sign-in. */
  demoLoginId:(process.env.DEMO_LOGIN_ID??'kuro').trim().toLowerCase(),
  demoLoginPassword:process.env.DEMO_LOGIN_PASSWORD??'0130',
  /** lax when Portal, API and store share one site (localhost ports, one custom domain, or the /api proxy); none only for HTTPS split-site setups. */
  cookieSameSite:(process.env.COOKIE_SAMESITE??'lax') as 'lax'|'none',
  local, key:encryptionKey(), singleWorkspace:process.env.SINGLE_WORKSPACE==='true',
  webhookAllowlist:(process.env.WEBHOOK_ALLOWLIST??'http://localhost:3001/webhooks/express-wallet').split(','),
  settlementSeconds:Number(process.env.SETTLEMENT_DELAY_SECONDS??60)
};
for(const port of [config.apiPort,config.storePort,config.portalPort])if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid service port');
for(const value of [config.portalUrl,config.storeUrl]){const url=new URL(value);if(url.origin!==value||!['http:','https:'].includes(url.protocol))throw Error('PORTAL_URL and STORE_URL must be origins without a trailing slash');if(!local&&url.protocol!=='https:')throw Error('Public demo requires HTTPS service origins');}
{const url=new URL(config.apiUrl);if(url.origin+url.pathname.replace(/\/$/,'')!==config.apiUrl||url.search||url.hash||!['http:','https:'].includes(url.protocol))throw Error('API_URL must be an origin, optionally with a path prefix such as https://portal.example/api, without a trailing slash');if(!local&&url.protocol!=='https:')throw Error('Public demo requires an HTTPS API URL');}
for(const value of [config.apiInternalUrl]){const url=new URL(value);if(url.origin+url.pathname.replace(/\/$/,'')!==value||!['http:','https:'].includes(url.protocol))throw Error('API_INTERNAL_URL must be an origin (optionally with a path prefix) without a trailing slash');}
if(!['lax','none'].includes(config.cookieSameSite))throw Error('COOKIE_SAMESITE must be lax or none');
if(config.cookieSameSite==='none'&&![config.apiUrl,config.portalUrl,config.storeUrl].every(v=>v.startsWith('https://'))&&!local)throw Error('COOKIE_SAMESITE=none requires HTTPS origins');
if(config.storeUrl===config.portalUrl)throw Error('The sample store must use a separate origin');
if(!local&&(config.singleWorkspace||!process.env.DATABASE_URL||!(process.env.STORE_DATABASE_URL||composedStoreUrl)||config.databaseUrl===config.storeDatabaseUrl))throw Error('Public demo requires isolated workspaces and explicitly configured separate database credentials');
