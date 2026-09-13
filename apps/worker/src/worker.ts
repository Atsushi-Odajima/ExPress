import {randomUUID} from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import {pool,transaction,type Context,type Row,type Tx} from '../../../packages/database/src/index.ts';
import {journal,debit,credit} from '../../../packages/database/src/ledger.ts';
import {MockProvider,type ProviderResult} from '../../../packages/testkit/src/index.ts';
import {finishCapture,finishRefund,orderSummary,voidAuthorization} from '../../api/src/payments.ts';
import {decrypt,webhookAddress} from '../../api/src/security.ts';
import {runBilling} from '../../api/src/services.ts';
import {signWebhook} from '../../../packages/sdk-server/src/index.ts';
export const workerId=randomUUID();
function context(r:{workspace_id:string;generation:number}):Context{return {workspace:r.workspace_id,generation:r.generation,actor:'worker:'+workerId,role:'system',scopes:[],requestId:randomUUID()};}
const provider=new MockProvider();
export async function applyProvider(tx:Tx,a:Row,result:ProviderResult) {
 if(['succeeded','failed'].includes(a.status))return;
 const success=result==='succeeded';
 if(result==='pending'||result==='unknown'){await tx.update('provider_attempts',a.id,{status:result});return;}
 const id=a.parent_id!,n=BigInt(a.amount);
 if(a.data.kind==='authorize'){
  let auth=await tx.get('authorizations',id);if(auth.status==='pending'){
   auth=await tx.update('authorizations',id,{status:success?'authorized':'failed'});await tx.event(success?'authorization.created':'authorization.failed',auth);await orderSummary(tx,auth.parent_id!);
   if(!success){
    await tx.create('risk_reviews',{user_id:auth.user_id,merchant_id:auth.merchant_id,parent_id:auth.id,status:'pending',data:{rule:'provider_decline',reason:'模擬プロバイダーが支払いを拒否',rule_version:tx.workspace.settings.risk_version}});
    const failures=await tx.rows('authorizations',"AND user_id=$3 AND status='failed' AND updated_at>=$4",[auth.user_id,new Date(tx.now().getTime()-600000)]),key='repeated-failures:'+auth.user_id+':'+Math.floor(tx.now().getTime()/600000);
    if(failures.length>=3&&!(await tx.rows('risk_reviews','AND business_key=$3',[key])).length)await tx.create('risk_reviews',{business_key:key,user_id:auth.user_id,merchant_id:auth.merchant_id,parent_id:auth.id,status:'pending',data:{rule:'repeated_failures',reason:'10分以内に3回以上の支払い失敗',rule_version:tx.workspace.settings.risk_version,count:failures.length,window_seconds:600}});
   }
  }
 }else if(a.data.kind==='capture')await finishCapture(tx,await tx.get('captures',id),success);
 else if(a.data.kind==='refund')await finishRefund(tx,await tx.get('refunds',id),success);
 else if(a.data.kind==='topup'){
  const top=await tx.get('topups',id);if(top.status==='pending'){
   if(success)await journal(tx,'topup:'+id,'模擬チャージ',[debit('platform','external',n),credit(top.data.owner,'available',n)],id);
   await tx.update('topups',id,{status:success?'succeeded':'failed'});if(top.user_id)await tx.notify(top.user_id,success?'チャージ完了':'チャージ失敗',`${top.amount}円の模擬チャージ`);
  }
 }else if(a.data.kind==='payout'){
  let p=await tx.get('payouts',id);if(['requested','processing'].includes(p.status)){
   await journal(tx,'payout-result:'+id,success?'模擬銀行へ出金':'出金失敗・保留解放',[debit(p.data.owner,'payout_held',n),credit(success?'platform':p.data.owner,success?'external':'available',n)],id);
   p=await tx.update('payouts',id,{status:success?'succeeded':'failed'});await tx.event(success?'payout.succeeded':'payout.failed',p);
  }
 }
 await tx.update('provider_attempts',a.id,{status:result,data:{...a.data,completed_at:tx.now().toISOString()}});
}
export async function claimJob(workspace?:string):Promise<Row|undefined> {
 const db=await pool.connect();try{await db.query('BEGIN');
 const r=(await db.query<Row>(`SELECT j.* FROM jobs j JOIN demo_workspaces w ON w.id=j.workspace_id AND w.generation=j.generation WHERE w.status='active' AND ($1::text IS NULL OR w.id=$1) AND coalesce(w.settings->>'worker_paused','false')<>'true' AND (j.status='pending' OR j.status='running' AND (j.data->>'lease_until')::timestamptz<now()) AND (j.data->>'run_at')::timestamptz<=now()+w.clock_offset*interval '1 millisecond' ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,[workspace??null])).rows[0];
 if(r){await db.query(`UPDATE jobs SET status='running',data=data||$2::jsonb WHERE id=$1`,[r.id,{lease_owner:workerId,lease_until:new Date(Date.now()+15000).toISOString()}]);}
 await db.query('COMMIT');return r;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function runJob(job:Row) {
 const ctx=context(job);
 try{
  const a=await transaction(ctx,async tx=>{const j=await tx.get('jobs',job.id);if(j.status!=='running'||j.data.lease_owner!==workerId)return;const a=await tx.get('provider_attempts',job.data.attempt_id);if(a.data.kind==='payout'){const p=await tx.get('payouts',a.parent_id!);if(p.status==='requested')await tx.update('payouts',p.id,{status:'processing'});}return a;});if(!a)return;
  // Provider I/O runs after the intent transaction has committed, with no DB lock held.
  const result=['pending','unknown'].includes(a.status)?await provider.lookup(a):await provider.execute(a);
  await transaction(ctx,async tx=>{const current=await tx.get('jobs',job.id);if(current.data.lease_owner!==workerId)return;await applyProvider(tx,await tx.get('provider_attempts',a.id),result);await tx.update('jobs',job.id,{status:['pending','unknown'].includes(result)?'pending':'succeeded',data:{...current.data,tries:Number(current.data.tries)+1,run_at:new Date(tx.now().getTime()+1000).toISOString()}});});
 }catch(e:any){if(e.code==='UNAUTHENTICATED')return;await transaction(ctx,async tx=>{const j=await tx.get('jobs',job.id);if(j.data.lease_owner!==workerId)return;await tx.update('jobs',j.id,{status:Number(j.data.tries)>=7?'failed':'pending',data:{...j.data,tries:Number(j.data.tries)+1,last_error:e.code??'WORKER_ERROR',run_at:new Date(tx.now().getTime()+5000).toISOString()}});});}
}
export async function maintenance(ctx:Context) {
 await transaction(ctx,async tx=>{
  const checkouts=await tx.rows('checkouts',"AND status='created'");for(const s of checkouts)if(new Date(s.data.expires_at)<=tx.now())await tx.update('checkouts',s.id,{status:'expired'});
  for(const a of await tx.rows('authorizations',"AND status IN ('authorized','partially_captured') AND reserved=0"))if(new Date(a.data.expires_at)<=tx.now())await voidAuthorization(tx,a.id,true);
  for(const r of await tx.rows('payment_requests',"AND status='created'"))if(new Date(r.data.expires_at)<=tx.now())await tx.update('payment_requests',r.id,{status:'expired'});
  for(const lot of await tx.rows('settlement_lots',"AND status='pending'")){
   if(new Date(lot.data.settle_at)>tx.now()||BigInt(lot.reserved)>0n)continue;
   const n=BigInt(lot.amount)-BigInt(lot.released);if(n>0n)await journal(tx,'settlement:'+lot.id,'精算待機期間の終了',[debit(lot.merchant_id!,'unsettled',n),credit(lot.merchant_id!,'available',n)],lot.id);
   await tx.update('settlement_lots',lot.id,{released:lot.amount,status:'settled'});
  }
  await runBilling(tx);
  for(const event of await tx.rows('outbox',"AND status='pending'")){
   const endpoints=await tx.rows('webhook_endpoints',"AND merchant_id=$3 AND status='active'",[event.merchant_id]);
   for(const ep of endpoints){if(event.data.type==='webhook.test'?event.parent_id!==ep.id:!ep.data.events.includes('*')&&!ep.data.events.includes(event.data.type))continue;await tx.create('webhook_deliveries',{merchant_id:event.merchant_id,parent_id:event.id,status:'pending',data:{endpoint_id:ep.id,event_id:event.data.event_id,attempt:1,run_at:tx.now().toISOString()}});}
   await tx.update('outbox',event.id,{status:'dispatched'});
  }
 });
}
export async function send(raw:string,target:string,secret:string|string[]):Promise<number> {
 const {url,address,family}=await webhookAddress(target);
 return new Promise((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).request(url,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(raw),'ExPress-Signature':signWebhook(raw,secret)},lookup:(_h,options:any,cb:any)=>options.all?cb(null,[{address,family}]):cb(null,address,family),timeout:5000},response=>{let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>65536)request.destroy(Error('RESPONSE_TOO_LARGE'));});response.on('end',()=>resolve(response.statusCode??500));});request.on('timeout',()=>request.destroy(Error('TIMEOUT')));request.on('error',reject);request.end(raw);
 });
}
export async function deliverOne(ctx:Context) {
 const delivery=await transaction(ctx,async tx=>{
  const ds=await tx.rows('webhook_deliveries',"AND (status='pending' OR status='running') ORDER BY created_at");
  const d=ds.find(d=>new Date(d.data.run_at)<=tx.now()&&(d.status!=='running'||new Date(d.data.lease_until)<new Date()));if(!d)return;
  const e=await tx.get('outbox',d.parent_id!),ep=await tx.get('webhook_endpoints',d.data.endpoint_id);
  if(ep.status!=='active'){await tx.update('webhook_deliveries',d.id,{status:'cancelled'});return;}
  await tx.update('webhook_deliveries',d.id,{status:'running',data:{...d.data,lease_owner:workerId,lease_until:new Date(Date.now()+10000).toISOString()}});return {d,e,ep};
 });if(!delivery)return;
 const keys=[decrypt(delivery.ep.data.secret_encrypted)];if(delivery.ep.data.previous_secret_encrypted&&new Date(delivery.ep.data.previous_valid_until)>new Date())keys.push(decrypt(delivery.ep.data.previous_secret_encrypted));
 let status=0,lastError:string|undefined;try{status=await send(JSON.stringify(delivery.e.data),delivery.ep.data.url,keys);}catch(e:any){lastError=e.code??'DELIVERY_NETWORK_ERROR';}
 await transaction(ctx,async tx=>{
  const d=await tx.get('webhook_deliveries',delivery.d.id);if(d.data.lease_owner!==workerId)return;
  const success=status>=200&&status<300;
  await tx.update('webhook_deliveries',d.id,{status:success?'succeeded':'failed',data:{...d.data,http_status:status,last_error:lastError,delivered_at:tx.now().toISOString()}});
  if(!success&&d.data.attempt<6)await tx.create('webhook_deliveries',{merchant_id:d.merchant_id,parent_id:d.parent_id,status:'pending',data:{endpoint_id:d.data.endpoint_id,event_id:d.data.event_id,attempt:d.data.attempt+1,run_at:new Date(tx.now().getTime()+Math.min(60000,1000*2**d.data.attempt)+Math.floor(Math.random()*500)).toISOString()}});
  if(!success&&d.data.attempt>=6)await tx.update('webhook_deliveries',d.id,{status:'dead_letter'});
 });
}
export async function tick() {
 for(let i=0;i<30;i++){const job=await claimJob();if(!job)break;await runJob(job);}
 const workspaces=(await pool.query("SELECT id AS workspace_id,generation FROM demo_workspaces WHERE status='active' AND coalesce(settings->>'worker_paused','false')<>'true'")).rows;
 for(const ws of workspaces){try{await maintenance(context(ws));for(let i=0;i<10;i++)await deliverOne(context(ws));}catch(e:any){if(e.code!=='UNAUTHENTICATED')console.error('ExPress worker',e.code??e.message);}}
}
