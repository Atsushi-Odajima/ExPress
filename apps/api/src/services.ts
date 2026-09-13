import {type Tx,type Row} from '../../../packages/database/src/index.ts';
import {amount,ensure,money,nextMonth,scopes,capabilities} from '../../../packages/domain/src/index.ts';
import {balances,journal,debit,credit,reconciliation} from '../../../packages/database/src/ledger.ts';
import {can,merchantOwn,userOwn,hash,randomToken,encrypt,webhookAddress,sanitize} from './security.ts';
import {createOrder,capture,intent,transfer,orderSummary,voidAuthorization} from './payments.ts';
import {config} from '../../../packages/database/src/config.ts';
export async function credentialCreate(tx:Tx,input:any) {
 ensure(tx.ctx.merchant&&['owner','developer'].includes(tx.ctx.role),'FORBIDDEN',undefined,403);const secret=randomToken();
 ensure(Array.isArray(input.scopes)&&input.scopes.length&&input.scopes.every((s:string)=>scopes.includes(s as any)));
 ensure(input.scopes.every((s:string)=>tx.ctx.scopes.includes(s)),'FORBIDDEN','自分にない権限をアプリへ付与することはできません。',403);
 const r=await tx.create('credentials',{merchant_id:tx.ctx.merchant,data:{name:String(input.name??'Application').slice(0,100),client_id:'exw_'+randomToken().slice(0,24),secret_hash:hash(secret),scopes:input.scopes}});await tx.audit('credential.create',r.id,'加盟店アプリ登録');return {...sanitize(r),client_secret:secret};
}
export async function endpointCreate(tx:Tx,input:any) {
 await webhookAddress(input.url);ensure(Array.isArray(input.events)&&input.events.length>0&&input.events.every((e:any)=>typeof e==='string'));const secret=randomToken();
 const r=await tx.create('webhook_endpoints',{merchant_id:tx.ctx.merchant,data:{url:input.url,events:input.events,secret_encrypted:encrypt(secret)}});return {...sanitize(r),webhook_secret:secret};
}
export async function paymentRequest(tx:Tx,input:any) {
 ensure(tx.ctx.user);const n=amount(input.amount);return tx.create('payment_requests',{user_id:tx.ctx.user,amount:String(n),status:'created',data:{memo:String(input.memo??'').slice(0,200),expires_at:new Date(tx.now().getTime()+86400000).toISOString()}});
}
export async function payRequest(tx:Tx,id:string) {
 const r=await tx.get('payment_requests',id);ensure(r.status==='created','INVALID_STATE');ensure(new Date(r.data.expires_at)>tx.now(),'EXPIRED');const t=await transfer(tx,{recipient_id:r.user_id,amount:money(r.amount),memo:r.data.memo});return tx.update('payment_requests',id,{status:'approved',data:{...r.data,payer:tx.ctx.user,transfer_id:t.id}});
}
export async function plan(tx:Tx,input:any) {
 const n=amount(input.amount,BigInt(tx.workspace.settings.subscription_limit??100000));ensure(input.interval==='month');return tx.create('plans',{merchant_id:tx.ctx.merchant,amount:String(n),data:{name:String(input.name).slice(0,100),interval:'month'}});
}
export async function subscription(tx:Tx,input:any) {
 const p=await tx.get('plans',input.plan_id);merchantOwn(tx,p);ensure(p.status==='active','INVALID_STATE');
 return tx.create('subscriptions',{merchant_id:tx.ctx.merchant,parent_id:p.id,amount:p.amount,status:'pending_consent',data:{name:p.data.name,interval:'month',consent_url:config.portalUrl+'/wallet/subscriptions'}});
}
export async function consent(tx:Tx,id:string,input:any) {
 const s=await tx.get('subscriptions',id);ensure(s.status==='pending_consent','INVALID_STATE');ensure(tx.ctx.user&&tx.ctx.role==='consumer'&&input.accept===true,'FORBIDDEN',undefined,403);
 await can(tx,'users',tx.ctx.user,'can_pay');let token;if(input.source!=='wallet'){const m=await tx.get('payment_methods',input.source);userOwn(tx,m);ensure(m.status==='active'&&m.data.type==='card');token=m.data.provider_token;}
 const c=await tx.create('consents',{parent_id:s.id,user_id:tx.ctx.user,merchant_id:s.merchant_id,amount:s.amount,data:{source:input.source,provider_token:token,consented_at:tx.now().toISOString(),frequency:'month',merchant_id:s.merchant_id}});
 const now=tx.now();const result=await tx.update('subscriptions',id,{user_id:tx.ctx.user,status:'active',data:{...s.data,consent_id:c.id,source:input.source,provider_token:token,anchor_day:now.getUTCDate(),next_bill_at:now.toISOString()}});await tx.event('subscription.activated',result);return result;
}
export async function subscriptionAction(tx:Tx,id:string,action:string,consumer=false) {
 const s=await tx.get('subscriptions',id);if(consumer)userOwn(tx,s);else merchantOwn(tx,s);
 ensure(s.status!=='cancelled','INVALID_STATE');
 if(action==='resume'){ensure(s.status==='paused','INVALID_STATE');const c=await tx.get('consents',s.data.consent_id);ensure(c.status==='active','INVALID_STATE');}
 if(action==='cancel'&&s.data.consent_id)await tx.update('consents',s.data.consent_id,{status:'revoked'});
 const r=await tx.update('subscriptions',id,{status:action==='cancel'?'cancelled':action==='pause'?'paused':'active'});if(action==='cancel')await tx.event('subscription.cancelled',r);return r;
}
export async function openDispute(tx:Tx,input:any) {
 const o=await tx.get('orders',input.order_id);const auth=(await tx.rows('authorizations','AND parent_id=$3 AND user_id=$4',[o.id,tx.ctx.user]))[0];ensure(auth,'RESOURCE_NOT_FOUND',undefined,404);ensure(typeof input.message==='string'&&input.message.length>0&&input.message.length<=2000);
 const d=await tx.create('disputes',{parent_id:o.id,user_id:tx.ctx.user,merchant_id:o.merchant_id,status:'open',data:{subject:String(input.subject??'返金・購入トラブル').slice(0,200),order_id:o.id,network_chargeback:false}});await disputeMessage(tx,d.id,{message:input.message});await tx.event('dispute.opened',d);return d;
}
export async function disputeMessage(tx:Tx,id:string,input:any) {
 const d=await tx.get('disputes',id);ensure(tx.ctx.role==='admin'||d.user_id===tx.ctx.user||d.merchant_id===tx.ctx.merchant,'RESOURCE_NOT_FOUND',undefined,404);ensure(typeof input.message==='string'&&input.message.trim().length>0&&input.message.length<=2000);ensure(!input.attachment||['demo-receipt.txt','demo-shipping.txt'].includes(input.attachment));
 await tx.create('dispute_messages',{parent_id:id,user_id:d.user_id,merchant_id:d.merchant_id,data:{author:tx.ctx.actor,role:tx.ctx.role,message:input.message,attachment:input.attachment}});const r=await tx.update('disputes',id,{data:{...d.data,last_message_at:tx.now().toISOString()}});await tx.event('dispute.updated',r);return r;
}
export async function runBilling(tx:Tx) {
 const subscriptions=await tx.rows('subscriptions',"AND status IN ('active','past_due')");
 for(let s of subscriptions){
  if(new Date(s.data.next_bill_at)>tx.now())continue;
  const consent=await tx.get('consents',s.data.consent_id);if(consent.status!=='active')continue;
  const period=s.data.next_bill_at;let cycle=(await tx.rows('billing_cycles','AND parent_id=$3 AND business_key=$4',[s.id,period]))[0];
  if(cycle?.status==='succeeded')continue;
  if(!cycle)cycle=await tx.create('billing_cycles',{parent_id:s.id,user_id:s.user_id,merchant_id:s.merchant_id,business_key:period,amount:s.amount,status:'pending',data:{attempts:0,period_start:period}});
  if(cycle.data.retry_at&&new Date(cycle.data.retry_at)>tx.now())continue;
  if(cycle.data.authorization_id){
   const a=await tx.get('authorizations',cycle.data.authorization_id);
   const c=(await tx.rows('captures','AND parent_id=$3',[a.id]))[0];
   if(a.status==='pending'||c?.status==='pending')continue;
   if(c?.status==='succeeded'){await completeCycle(tx,s,cycle,true);continue;}
   if(a.status==='authorized'&&!c&&new Date(a.data.expires_at)>tx.now()){
    const original=tx.ctx;await tx.db.query('SAVEPOINT billing_capture');
    try{tx.ctx={...tx.ctx,merchant:s.merchant_id!,role:'system'};await capture(tx,a.id,{amount:money(s.amount),final_capture:true});await tx.db.query('RELEASE SAVEPOINT billing_capture');}
    catch(e:any){await tx.db.query('ROLLBACK TO SAVEPOINT billing_capture');if(!['ACCOUNT_RESTRICTED','INVALID_REQUEST'].includes(e.code))throw e;await voidAuthorization(tx,a.id);await completeCycle(tx,s,cycle,false,e.code);}
    finally{tx.ctx=original;}continue;
   }
   if(['failed','expired','voided'].includes(a.status)||c?.status==='failed'||new Date(a.data.expires_at)<=tx.now()){await voidAuthorization(tx,a.id,true);cycle=await completeCycle(tx,s,cycle,false);continue;}
  }
  await tx.db.query('SAVEPOINT billing_attempt');
  try {
   await can(tx,'users',s.user_id!,'can_pay');await can(tx,'merchants',s.merchant_id!,'can_receive');
   if(s.data.source!=='wallet'){const method=await tx.get('payment_methods',s.data.source);ensure(method.status==='active'&&method.user_id===s.user_id,'ACCOUNT_RESTRICTED','利用停止された模擬カードでは新しい定期課金を開始できません。',403);}
   const original=tx.ctx;let order:Row;
   try{tx.ctx={...tx.ctx,merchant:s.merchant_id!,role:'system'};order=await createOrder(tx,{merchant_order_id:`sub:${s.id}:${period}:${cycle.data.attempts}`,amount:money(s.amount),description:s.data.name,items:[{name:s.data.name,quantity:1,unit_amount:money(s.amount)}]});}finally{tx.ctx=original;}
   const a=await tx.create('authorizations',{parent_id:order.id,user_id:s.user_id,merchant_id:s.merchant_id,amount:s.amount,status:s.data.source==='wallet'?'authorized':'pending',data:{source:s.data.source,provider_token:s.data.provider_token,order_id:order.id,subscription_id:s.id,expires_at:new Date(tx.now().getTime()+86400000).toISOString()}});
   if(s.data.source==='wallet'){await journal(tx,'authorize:'+a.id,'同意済み定期課金の保留',[debit(s.user_id!,'available',BigInt(s.amount)),credit(s.user_id!,'held',BigInt(s.amount))],a.id);await tx.event('authorization.created',a);try{tx.ctx={...tx.ctx,merchant:s.merchant_id!,role:'system'};await capture(tx,a.id,{amount:money(s.amount),final_capture:true});}finally{tx.ctx=original;}}
   else {await intent(tx,'authorize',a,s.data.provider_token);await orderSummary(tx,order.id);}
   cycle=await tx.update('billing_cycles',cycle.id,{data:{...cycle.data,authorization_id:a.id,order_id:order.id}});
   if(s.data.source==='wallet')await completeCycle(tx,s,cycle,true);
   await tx.db.query('RELEASE SAVEPOINT billing_attempt');
  } catch(e:any){await tx.db.query('ROLLBACK TO SAVEPOINT billing_attempt');if(!['INSUFFICIENT_FUNDS','ACCOUNT_RESTRICTED','INVALID_REQUEST'].includes(e.code))throw e;await completeCycle(tx,s,cycle,false,e.code);}
 }
}
async function completeCycle(tx:Tx,s:Row,c:Row,success:boolean,reason='PROVIDER_DECLINED') {
 if(success){c=await tx.update('billing_cycles',c.id,{status:'succeeded'});const updated=await tx.update('subscriptions',s.id,{status:'active',data:{...s.data,next_bill_at:nextMonth(new Date(c.data.period_start),s.data.anchor_day).toISOString()}});await tx.event('subscription.payment_succeeded',updated);return c;}
 const attempts=Number(c.data.attempts)+1,retryAt=new Date(new Date(c.data.period_start).getTime()+(attempts===1?1:3)*86400000).toISOString();
 c=await tx.update('billing_cycles',c.id,{status:attempts>=3?'failed':'pending',data:{...c.data,attempts,reason,authorization_id:null,retry_at:retryAt,history:[...(c.data.history??[]),{at:tx.now().toISOString(),reason}]}});
 const updated=await tx.update('subscriptions',s.id,{status:attempts>=3?'paused':'past_due'});await tx.event('subscription.payment_failed',updated);return c;
}
