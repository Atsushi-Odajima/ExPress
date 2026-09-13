import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import pg from 'pg';
import {randomBytes,randomUUID,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {ExPressClient,verifyWebhook,ExPressError} from '../../../packages/sdk-server/src/index.ts';
import {config,root} from '../../../packages/database/src/config.ts';
import {ensure,DomainError,money,canonical} from '../../../packages/domain/src/index.ts';
const db=new pg.Pool({connectionString:config.storeDatabaseUrl});
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function encrypt(s:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',Buffer.from(config.key,'hex'),iv),b=Buffer.concat([c.update(s),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64');}
function decrypt(s:string){const b=Buffer.from(s,'base64'),c=createDecipheriv('aes-256-gcm',Buffer.from(config.key,'hex'),b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString();}
await db.query(`CREATE TABLE IF NOT EXISTS store_workspaces(id text NOT NULL,generation integer NOT NULL,merchant_id text NOT NULL,credentials text NOT NULL,webhook_failures integer NOT NULL DEFAULT 0,PRIMARY KEY(id,generation));
CREATE TABLE IF NOT EXISTS store_sessions(id text PRIMARY KEY,workspace_id text NOT NULL,generation integer NOT NULL,csrf text NOT NULL,expires_at timestamptz NOT NULL,FOREIGN KEY(workspace_id,generation) REFERENCES store_workspaces(id,generation));
CREATE TABLE IF NOT EXISTS store_orders(id text PRIMARY KEY,workspace_id text NOT NULL,generation integer NOT NULL,input_key text NOT NULL,input_hash text NOT NULL,amount bigint NOT NULL CHECK(amount>0),currency text NOT NULL DEFAULT 'JPY' CHECK(currency='JPY'),mode text NOT NULL,status text NOT NULL DEFAULT 'created',items jsonb NOT NULL,exw_order_id text,checkout_url text,authorization_id text,captured bigint NOT NULL DEFAULT 0,refunded bigint NOT NULL DEFAULT 0,resource_version integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,generation,input_key),FOREIGN KEY(workspace_id,generation) REFERENCES store_workspaces(id,generation));
CREATE TABLE IF NOT EXISTS store_events(workspace_id text NOT NULL,generation integer NOT NULL,event_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,generation,event_id));
CREATE TABLE IF NOT EXISTS shipments(id text PRIMARY KEY,workspace_id text NOT NULL,generation integer NOT NULL,order_id text NOT NULL REFERENCES store_orders(id),capture_id text NOT NULL UNIQUE,amount bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS return_requests(id text PRIMARY KEY,workspace_id text NOT NULL,generation integer NOT NULL,order_id text NOT NULL REFERENCES store_orders(id),capture_id text NOT NULL,refund_id text,status text NOT NULL,amount bigint NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());`);
export const catalog=[
 {id:'headphones',name:'Studio One',category:'ワイヤレスヘッドホン',price:'12000',color:'#dae5e9',icon:'headphones',description:'静けさと、あなたの好きな音。毎日に寄り添う架空のワイヤレスヘッドホン。'},
 {id:'keyboard',name:'Type 75',category:'メカニカルキーボード',price:'8900',color:'#e8e5de',icon:'keyboard',description:'書く時間を、もっと心地よく。コンパクトな架空のキーボード。'},
 {id:'speaker',name:'Sound Pebble',category:'ポータブルスピーカー',price:'6800',color:'#dce4d9',icon:'speaker',description:'小さなボディに広がる音。架空のポータブルスピーカー。'},
 {id:'charger',name:'Daily Charge',category:'ワイヤレス充電器',price:'3200',color:'#eee0d5',icon:'charger',description:'デスクの上をすっきりと。架空のワイヤレス充電器。'},
 {id:'mouse',name:'Arc Mini',category:'ワイヤレスマウス',price:'4500',color:'#e2deea',icon:'mouse',description:'手のひらになじむ、やわらかな形。架空のワイヤレスマウス。'}
];
const app=Fastify({logger:false,bodyLimit:65536});await app.register(cookie);
await app.register(cors,{origin:config.portalUrl,credentials:true});
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json',{parseAs:'string'},(_req,body,done)=>{try{done(null,JSON.parse(body as string));}catch(e){done(e as Error);}});
app.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string'},(_req,body,done)=>done(null,Object.fromEntries(new URLSearchParams(body as string))));
app.addHook('onRequest',async(req,reply)=>{reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');});
app.setErrorHandler((e:any,_req,reply)=>reply.code(e.status??e.statusCode??500).send({error:{code:e.code??'STORE_ERROR',message:e instanceof DomainError||e instanceof ExPressError?e.message:'処理を完了できませんでした。再試行してください。'}}));
async function session(req:any,mutation=false){const s=(await db.query(`SELECT s.*,w.credentials,w.merchant_id FROM store_sessions s JOIN store_workspaces w ON w.id=s.workspace_id AND w.generation=s.generation WHERE s.id=$1 AND s.expires_at>now()`,[hash(req.cookies.exw_store_session??'')])).rows[0];ensure(s,'UNAUTHENTICATED','ExPressからサンプルECを接続してください。',401);if(mutation)ensure(req.headers.origin===config.storeUrl&&req.headers['x-csrf-token']===s.csrf,'FORBIDDEN',undefined,403);return s;}
const client=(s:any)=>new ExPressClient({baseUrl:config.apiInternalUrl,...JSON.parse(decrypt(s.credentials))});
const storeCookie={httpOnly:true,secure:!config.local||config.cookieSameSite==='none',sameSite:config.cookieSameSite,path:'/',maxAge:86400} as const;
async function getOrder(s:any,id:string){const o=(await db.query('SELECT * FROM store_orders WHERE id=$1 AND workspace_id=$2 AND generation=$3',[id,s.workspace_id,s.generation])).rows[0];ensure(o,'RESOURCE_NOT_FOUND',undefined,404);return o;}
async function sync(s:any,id:string,captureNow=false){
 let o=await getOrder(s,id);if(!o.exw_order_id)return o;const sdk=client(s);let remote=await sdk.getOrder(o.exw_order_id);
 function validate(r:any){ensure(r.amount===o.amount&&r.currency==='JPY'&&r.merchant_id===s.merchant_id&&r.business_key===o.id,'INVALID_STATE','決済とEC注文の照合に失敗しました。',409);}validate(remote);
 const a=remote.authorizations.find((a:any)=>['authorized','partially_captured','captured','voided','expired'].includes(a.status));
 if(a&&o.mode==='immediate'&&captureNow&&remote.captured==='0'&&a.status==='authorized'){
  await sdk.capture(a.id,{amount:money(o.amount),final_capture:true},o.id+':automatic-capture');remote=await sdk.getOrder(o.exw_order_id);validate(remote);
 }
 const connection=await db.connect();try{await connection.query('BEGIN');o=(await connection.query('SELECT * FROM store_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(remote.version>=o.resource_version){const captured=BigInt(remote.captured),refunded=BigInt(remote.refunded);const status=refunded>0n?(refunded===captured?'refunded':'partially_refunded'):captured===BigInt(o.amount)?'paid':captured>0n?'partially_paid':remote.status==='authorized'?'authorized':remote.status==='expired'?'expired':['voided','cancelled'].includes(remote.status)?'cancelled':remote.authorizations.length&&remote.authorizations.every((a:any)=>a.status==='failed')?'payment_failed':'confirming';await connection.query('UPDATE store_orders SET status=$2,authorization_id=$3,captured=$4,refunded=$5,resource_version=$6 WHERE id=$1',[id,status,a?.id,remote.captured,remote.refunded,remote.version]);
 for(const c of remote.captures.filter((c:any)=>c.status==='succeeded'))await connection.query('INSERT INTO shipments(id,workspace_id,generation,order_id,capture_id,amount) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(capture_id) DO NOTHING',[randomUUID(),s.workspace_id,s.generation,id,c.id,c.amount]);}
 await connection.query('COMMIT');}catch(e){await connection.query('ROLLBACK');throw e;}finally{connection.release();}
 return {...await getOrder(s,id),payment:remote,shipments:(await db.query('SELECT * FROM shipments WHERE order_id=$1',[id])).rows};
}
// Exchanges the one-time handoff code with the ExPress API and opens a store session. Used by the POST (API clients, tests) and the GET (top-level browser navigation) below.
async function connect(code:string,reply:any){const response=await fetch(config.apiInternalUrl+'/v1/demo/claim-store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),signal:AbortSignal.timeout(5000)});const c=await response.json();ensure(response.ok,'UNAUTHENTICATED','接続コードが失効しています。ExPressからやり直してください。',401);await db.query('INSERT INTO store_workspaces(id,generation,merchant_id,credentials) VALUES($1,$2,$3,$4) ON CONFLICT(id,generation) DO UPDATE SET credentials=excluded.credentials',[c.workspace_id,c.generation,c.merchant_id,encrypt(JSON.stringify({clientId:c.client_id,clientSecret:c.client_secret,webhookSecret:c.webhook_secret}))]);const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');await db.query('INSERT INTO store_sessions VALUES($1,$2,$3,$4,$5)',[hash(token),c.workspace_id,c.generation,csrf,new Date(Date.now()+86400000)]);reply.setCookie('exw_store_session',token,storeCookie);}
app.post('/connect',async(req:any,reply)=>{ensure(req.headers.origin===config.portalUrl,'FORBIDDEN',undefined,403);ensure(typeof req.body?.code==='string');await connect(req.body.code,reply);return {connected:true};});
// Top-level navigation from the Portal: the cookie is set first-party on the store origin, so it also works where browsers block third-party cookies (Safari, split public suffixes). The code is single-use and expires in five minutes.
app.get('/connect',async(req:any,reply)=>{const code=req.query?.code;ensure(typeof code==='string'&&code.length>=16&&code.length<=200,'INVALID_REQUEST');try{await connect(code,reply);}catch(e:any){return reply.code(401).type('text/html').send(`<!doctype html><meta charset="utf-8"><title>NORTHSTAR</title><p style="font:15px system-ui;margin:40px">接続コードが失効しています。ExPressの「サンプルECを開く」からやり直してください。<br><a href="${config.portalUrl.replace(/"/g,'')}/wallet">ExPressへ戻る</a></p>`);}return reply.redirect('/',303);});
app.get('/api/session',async req=>{const s=await session(req);return {csrf:s.csrf,workspace_id:s.workspace_id,generation:s.generation};});
app.get('/api/products',async()=>({data:catalog}));
app.get('/api/orders',async req=>{const s=await session(req);return {data:(await db.query('SELECT * FROM store_orders WHERE workspace_id=$1 AND generation=$2 ORDER BY created_at DESC LIMIT 100',[s.workspace_id,s.generation])).rows};});
app.post('/api/orders',async(req:any)=>{
 const s=await session(req,true),input=req.body;ensure(['immediate','shipping'].includes(input.mode)&&Array.isArray(input.items)&&input.items.length>0&&input.items.length<=20);ensure(typeof req.headers['idempotency-key']==='string');
 const items=input.items.map((i:any)=>{const product=catalog.find(p=>p.id===i.id);ensure(product&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=10);return {...product,quantity:i.quantity};});const n=items.reduce((sum:bigint,i:any)=>sum+BigInt(i.price)*BigInt(i.quantity),0n);const ih=hash(canonical({items,mode:input.mode})),key=req.headers['idempotency-key'];
 const id=randomUUID();await db.query('INSERT INTO store_orders(id,workspace_id,generation,input_key,input_hash,amount,mode,items) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(workspace_id,generation,input_key) DO NOTHING',[id,s.workspace_id,s.generation,key,ih,String(n),input.mode,JSON.stringify(items)]);
 let o=(await db.query('SELECT * FROM store_orders WHERE workspace_id=$1 AND generation=$2 AND input_key=$3',[s.workspace_id,s.generation,key])).rows[0];ensure(o.input_hash===ih,'IDEMPOTENCY_CONFLICT',undefined,409);const sdk=client(s);
 if(!o.exw_order_id){const r=await sdk.createOrder({merchant_order_id:o.id,amount:money(n),description:items.map((x:any)=>x.name).join(' + '),items:items.map((x:any)=>({name:x.name,quantity:x.quantity,unit_amount:money(x.price)})),metadata:{store_order_id:o.id}},o.id+':order');await db.query('UPDATE store_orders SET exw_order_id=$2 WHERE id=$1',[o.id,r.id]);o.exw_order_id=r.id;}
 if(!o.checkout_url){const r=await sdk.createCheckout({order_id:o.exw_order_id,return_url:config.storeUrl+'/return',cancel_url:config.storeUrl+'/cancel'},o.id+':checkout');await db.query('UPDATE store_orders SET checkout_url=$2 WHERE id=$1',[o.id,r.checkout_url]);o.checkout_url=r.checkout_url;}
 return o;
});
app.get('/api/orders/:id',async(req:any)=>sync(await session(req),req.params.id));
app.post('/api/orders/:id/confirm',async(req:any)=>sync(await session(req,true),req.params.id,true));
app.post('/api/orders/:id/ship',async(req:any)=>{const s=await session(req,true),o=await sync(s,req.params.id);ensure(o.authorization_id,'INVALID_STATE');const n=amountSafe(req.body.amount);const r=await client(s).capture(o.authorization_id,{amount:money(n),final_capture:req.body.final_capture===true},requireKey(req));await sync(s,o.id);return r;});
app.post('/api/orders/:id/refund',async(req:any)=>{const s=await session(req,true),o=await sync(s,req.params.id),n=amountSafe(req.body.amount);const c=o.payment.captures.find((c:any)=>c.id===req.body.capture_id&&c.status==='succeeded');ensure(c,'RESOURCE_NOT_FOUND',undefined,404);const r=await client(s).refund(c.id,{amount:money(n),reason:req.body.reason??'サンプル返品'},requireKey(req));await db.query('INSERT INTO return_requests(id,workspace_id,generation,order_id,capture_id,refund_id,status,amount,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING',[r.id,s.workspace_id,s.generation,o.id,c.id,r.id,r.status,String(n),String(req.body.reason??'サンプル返品')]);await sync(s,o.id);return r;});
app.post('/api/demo/webhook-failures',async(req:any)=>{const s=await session(req,true);ensure(Number.isInteger(req.body.count)&&req.body.count>=0&&req.body.count<=5);await db.query('UPDATE store_workspaces SET webhook_failures=$3 WHERE id=$1 AND generation=$2',[s.workspace_id,s.generation,req.body.count]);return {failures_remaining:req.body.count};});
app.post('/api/demo/rotate-webhook',async(req:any)=>{const s=await session(req,true),sdk=client(s);const endpoints=await sdk.request('GET','/v1/webhook-endpoints');const endpoint=endpoints.data.find((e:any)=>e.data.internal_store);ensure(endpoint,'RESOURCE_NOT_FOUND',undefined,404);const result=await sdk.request('POST','/v1/webhook-endpoints/'+endpoint.id+'/rotate-secret',{});const credentials=JSON.parse(decrypt(s.credentials));await db.query('UPDATE store_workspaces SET credentials=$3 WHERE id=$1 AND generation=$2',[s.workspace_id,s.generation,encrypt(JSON.stringify({...credentials,previousWebhookSecret:credentials.webhookSecret,previousValidUntil:Date.now()+86400000,webhookSecret:result.webhook_secret}))]);return {status:'updated',previous_valid_until:new Date(Date.now()+86400000).toISOString()};});
app.post('/api/orders/:id/retry-checkout',async(req:any)=>{const s=await session(req,true),o=await getOrder(s,req.params.id),sdk=client(s),remote=await sdk.getOrder(o.exw_order_id);ensure(remote.status==='created'&&remote.amount===o.amount&&remote.currency===o.currency&&remote.merchant_id===s.merchant_id,'INVALID_STATE');const result=await sdk.createCheckout({order_id:o.exw_order_id,return_url:config.storeUrl+'/return',cancel_url:config.storeUrl+'/cancel'},requireKey(req));await db.query('UPDATE store_orders SET checkout_url=$2,status=\'confirming\' WHERE id=$1',[o.id,result.checkout_url]);return {checkout_url:result.checkout_url};});
function requireKey(req:any){const key=req.headers['idempotency-key'];ensure(typeof key==='string'&&key.length>=8);return key;}
function amountSafe(input:any){ensure(input?.currency==='JPY'&&typeof input.value==='string'&&/^[1-9]\d{0,7}$/.test(input.value));return BigInt(input.value);}
// Preserve raw body for HMAC; a nested parser overrides the normal JSON parser.
await app.register(async webhook=>{
 webhook.removeContentTypeParser('application/json');webhook.addContentTypeParser('application/json',{parseAs:'string'},(_r,b,d)=>d(null,b));
 webhook.post('/webhooks/express-wallet',async(req:any,reply)=>{
  const raw=req.body as string;let event;try{event=JSON.parse(raw);}catch{return reply.code(400).send({error:'INVALID_JSON'});}
  const ws=(await db.query('SELECT * FROM store_workspaces WHERE generation=$1',[event.generation])).rows;let current:any;
  for(const w of ws){const cred=JSON.parse(decrypt(w.credentials));if(verifyWebhook(raw,req.headers['express-signature']??'',[cred.webhookSecret,...(cred.previousWebhookSecret&&cred.previousValidUntil>Date.now()?[cred.previousWebhookSecret]:[])])){current={...w,workspace_id:w.id};break;}}
  ensure(current,'UNAUTHENTICATED',undefined,401);
  const latest=(await db.query('SELECT max(generation) AS generation FROM store_workspaces WHERE id=$1',[current.workspace_id])).rows[0];ensure(latest.generation===event.generation,'UNAUTHENTICATED',undefined,401);
  if(current.webhook_failures>0){await db.query('UPDATE store_workspaces SET webhook_failures=webhook_failures-1 WHERE id=$1 AND generation=$2',[current.workspace_id,current.generation]);return reply.code(500).send({error:'DEMO_FAILURE'});}
  if((await db.query('SELECT 1 FROM store_events WHERE workspace_id=$1 AND generation=$2 AND event_id=$3',[current.workspace_id,current.generation,event.event_id])).rowCount)return {received:true,duplicate:true};
  const order=(await db.query('SELECT id FROM store_orders WHERE workspace_id=$1 AND generation=$2 AND exw_order_id=$3',[current.workspace_id,current.generation,event.data?.order_id])).rows[0];if(order)await sync(current,order.id,false);
  await db.query('INSERT INTO store_events(workspace_id,generation,event_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[current.workspace_id,current.generation,event.event_id]);return {received:true};
 });
});
const browserSdk=ts.transpileModule(readFileSync(resolve(root,'packages/sdk-browser/src/index.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
app.get('/sdk/checkout.js',async(_r,p)=>p.type('application/javascript').send(browserSdk));
app.get('/store.js',async(_r,p)=>p.type('application/javascript').send(readFileSync(resolve(root,'apps/demo-store/public/store.js'),'utf8').replaceAll('__PORTAL_URL__',config.portalUrl)));
app.get('/store.css',async(_r,p)=>p.type('text/css').send(readFileSync(resolve(root,'apps/demo-store/public/store.css'),'utf8')));
app.get('/locales.js',async(_r,p)=>p.type('application/javascript').send(readFileSync(resolve(root,'apps/demo-store/public/locales.js'),'utf8')));
for(const path of ['/','/return','/cancel','/orders','/products/:id'])app.get(path,async(_r,p)=>p.type('text/html').send(readFileSync(resolve(root,'apps/demo-store/public/index.html'),'utf8')));
await app.listen({host:config.listenHost,port:config.storePort});console.log(`NORTHSTAR sample store ${config.storeUrl}`);process.on('SIGTERM',async()=>{await app.close();await db.end();});
