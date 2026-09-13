import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const candidateRoot=resolve(import.meta.dirname,'../../..');
export const root = existsSync(resolve(candidateRoot,'pnpm-workspace.yaml'))?candidateRoot:resolve(candidateRoot,'..');
const local = process.env.DEMO_MODE !== 'public';
function encryptionKey() {
  if (process.env.ENCRYPTION_KEY) { if (!/^[a-f0-9]{64}$/i.test(process.env.ENCRYPTION_KEY)) throw Error('ENCRYPTION_KEY must be 32 bytes hex'); return process.env.ENCRYPTION_KEY; }
  if (!local) throw Error('Public demo requires ENCRYPTION_KEY');
  const file=resolve(root,'.local/keys.json'); mkdirSync(resolve(root,'.local'),{recursive:true});
  if (!existsSync(file)) { try { writeFileSync(file,JSON.stringify({key:randomBytes(32).toString('hex')}),{flag:'wx',mode:0o600}); } catch(e) { if(!existsSync(file)) throw e; } }
  return JSON.parse(readFileSync(file,'utf8')).key as string;
}
export const config = {
  databaseUrl:process.env.DATABASE_URL??'postgresql://exw:exw_local_only@127.0.0.1:54329/exw',
  storeDatabaseUrl:process.env.STORE_DATABASE_URL??'postgresql://exw_store:exw_store_local_only@127.0.0.1:54329/exw_store',
  apiUrl:process.env.API_URL??'http://localhost:4000', portalUrl:process.env.PORTAL_URL??'http://localhost:3000', storeUrl:process.env.STORE_URL??'http://localhost:3001',
  apiPort:Number(process.env.API_PORT??4000), storePort:Number(process.env.STORE_PORT??3001), portalPort:Number(process.env.PORTAL_PORT??3000),
  local, key:encryptionKey(), singleWorkspace:process.env.SINGLE_WORKSPACE==='true',
  webhookAllowlist:(process.env.WEBHOOK_ALLOWLIST??'http://localhost:3001/webhooks/express-wallet').split(','),
  settlementSeconds:Number(process.env.SETTLEMENT_DELAY_SECONDS??60)
};
for(const port of [config.apiPort,config.storePort,config.portalPort])if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid service port');
for(const value of [config.apiUrl,config.portalUrl,config.storeUrl]){const url=new URL(value);if(url.origin!==value||!['http:','https:'].includes(url.protocol))throw Error('Service URLs must be origins without a trailing slash');if(!local&&url.protocol!=='https:')throw Error('Public demo requires HTTPS service origins');}
if(config.storeUrl===config.portalUrl)throw Error('The sample store must use a separate origin');
if(!local&&(config.singleWorkspace||!process.env.DATABASE_URL||!process.env.STORE_DATABASE_URL||config.databaseUrl===config.storeDatabaseUrl))throw Error('Public demo requires isolated workspaces and explicitly configured separate database credentials');
