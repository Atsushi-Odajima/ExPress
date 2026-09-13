import {randomBytes,createHash,scryptSync,timingSafeEqual,createCipheriv,createDecipheriv} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {config} from '../../../packages/database/src/config.ts';
import {ensure,scopes,DomainError} from '../../../packages/domain/src/index.ts';
import {type Context,type Row,type Tx,pool} from '../../../packages/database/src/index.ts';
export const randomToken=()=>randomBytes(32).toString('base64url');
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function passwordHash(s:string) {const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(s,salt,64,{N:16384,r:8,p:1}).toString('hex');}
export function passwordCheck(s:string,encoded:string) {const [salt,key]=encoded.split(':');if(!salt||!key)return false;const a=Buffer.from(key,'hex'),b=scryptSync(s,salt,64);return a.length===b.length&&timingSafeEqual(a,b);}
export function encrypt(s:string) {const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(config.key,'hex'),iv);const ciphertext=Buffer.concat([cipher.update(s,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');}
export function decrypt(s:string) {const b=Buffer.from(s,'base64'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(config.key,'hex'),b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8');}
export const roleScopes:Record<string,string[]>={owner:[...scopes],developer:['orders:read','orders:write','payments:read','webhooks:manage','subscriptions:write'],finance:['orders:read','payments:read','payments:write','refunds:write','balances:read','payouts:write'],support:['orders:read','payments:read','refunds:write'],read_only:['orders:read','payments:read','balances:read']};
export function sanitize(r:Row):Row {const clean=(value:any):any=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!/secret|password|_hash$|_encrypted$/.test(k)&&!['csrf','bound_session','claim_code'].includes(k)).map(([k,v])=>[k,clean(v)])):value;return {...r,data:clean(r.data)};}
export async function can(tx:Tx,table:'users'|'merchants',id:string,capability:string) {const row=await tx.get(table,id);ensure(row.data.capabilities?.[capability]!==false,'ACCOUNT_RESTRICTED',row.data.restriction_reason??'現在この操作は制限されています。',403);return row;}
export function merchantOwn(tx:Tx,r:Row) {ensure(!!tx.ctx.merchant&&r.merchant_id===tx.ctx.merchant,'RESOURCE_NOT_FOUND',undefined,404);}
export function userOwn(tx:Tx,r:Row) {ensure(!!tx.ctx.user&&r.user_id===tx.ctx.user,'RESOURCE_NOT_FOUND',undefined,404);}
export async function sessionContext(token:string,requestId:string):Promise<{ctx:Context;csrf:string}> {
 const r=(await pool.query(`SELECT s.*,w.generation AS current_generation,u.data FROM sessions s JOIN demo_workspaces w ON w.id=s.workspace_id JOIN users u ON (u.workspace_id,u.generation,u.id)=(s.workspace_id,s.generation,s.user_id) WHERE s.id=$1 AND NOT s.revoked AND s.expires_at>now()`,[hash(token)])).rows[0];
 ensure(r&&r.generation===r.current_generation,'UNAUTHENTICATED','ログインしてください。',401);
 return {ctx:{workspace:r.workspace_id,generation:r.generation,actor:r.user_id,user:r.user_id,merchant:r.merchant_id??undefined,role:r.role,scopes:roleScopes[r.role]??[],requestId,session:r.id},csrf:r.csrf};
}
export async function tokenContext(token:string,requestId:string):Promise<Context> {
 const r=(await pool.query(`SELECT t.*,c.status,c.merchant_id,c.version,w.generation AS current_generation FROM access_tokens t JOIN credentials c ON (c.workspace_id,c.generation,c.id)=(t.workspace_id,t.generation,t.credential_id) JOIN demo_workspaces w ON w.id=t.workspace_id WHERE t.id=$1 AND t.expires_at>now()`,[hash(token)])).rows[0];
 ensure(r&&r.status==='active'&&r.version===r.credential_version&&r.generation===r.current_generation,'UNAUTHENTICATED',undefined,401);
 return {workspace:r.workspace_id,generation:r.generation,actor:r.credential_id,merchant:r.merchant_id,role:'api',scopes:r.scopes,requestId,credential:r.credential_id};
}
export async function newSession(tx:Tx,user:Row) {
 const token=randomToken(),csrf=randomToken();const member=(await tx.rows('merchant_members','AND user_id=$3',[user.id]))[0];
 await tx.db.query('INSERT INTO sessions(id,workspace_id,generation,user_id,csrf,role,merchant_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[hash(token),tx.ctx.workspace,tx.ctx.generation,user.id,csrf,user.data.admin?'admin':member?.data.role??'consumer',member?.merchant_id??null,new Date(Date.now()+86400000)]);
 return {token,csrf,user:sanitize(user)};
}
export function privateAddress(address:string):boolean {
 const a=address.toLowerCase();if(a.includes(':')) {if(a.startsWith('::ffff:')) return privateAddress(a.slice(7));return a==='::'||a==='::1'||a.startsWith('fc')||a.startsWith('fd')||/^fe[89ab]/.test(a)||a.startsWith('ff')||!a.startsWith('2')&& !a.startsWith('3');}
 const p=a.split('.').map(Number);return p.length!==4||p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&(p[1]===168||p[1]===0)||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===198&&(p[1]===18||p[1]===19);
}
export async function webhookAddress(raw:string) {
 let url:URL;try{url=new URL(raw);}catch{throw new DomainError('INVALID_REQUEST','有効なURLを指定してください。');}
 ensure(config.webhookAllowlist.includes(url.href)&&!url.username&&!url.password&&!url.hash,'INVALID_REQUEST','許可された通知先URLを指定してください。');
 if(config.local&&url.href===`${config.storeUrl}/webhooks/express-wallet`&&['localhost','127.0.0.1'].includes(url.hostname))return {url,address:'127.0.0.1',family:4};
 ensure(url.protocol==='https:'&&!isIP(url.hostname),'INVALID_REQUEST','公開HTTPSの登録済みホストのみ利用できます。');
 const addresses=await lookup(url.hostname,{all:true});ensure(addresses.length&&addresses.every(a=>!privateAddress(a.address)),'INVALID_REQUEST','この通知先は利用できません。');return {url,...addresses[0]};
}
