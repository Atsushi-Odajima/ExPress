import {type Tx,type Row,transaction,type Context} from '../../../packages/database/src/index.ts';
import {balances,journal,debit,credit} from '../../../packages/database/src/ledger.ts';
import {amount,money,min,fee,ensure,canonical} from '../../../packages/domain/src/index.ts';
import {hash,can,merchantOwn,userOwn,randomToken} from './security.ts';
import {config} from '../../../packages/database/src/config.ts';
export async function idempotent(tx:Tx,operation:string,target:string,key:string|undefined,input:unknown,fn:()=>Promise<unknown>) {
 ensure(key&&key.length>=8&&key.length<=200,'INVALID_REQUEST','Idempotency-Key（8〜200文字）が必要です。');
 const args=[tx.ctx.workspace,tx.ctx.generation,tx.ctx.actor,operation,target,key];const h=hash(canonical(input));
 const old=(await tx.db.query('SELECT * FROM idempotency_records WHERE workspace_id=$1 AND generation=$2 AND actor=$3 AND operation=$4 AND target=$5 AND key=$6',args)).rows[0];
 if(old){ensure(old.input_hash===h,'IDEMPOTENCY_CONFLICT','同じキーが異なる内容に使われています。',409);return old.response;}
 const result=await fn();await tx.db.query('INSERT INTO idempotency_records(workspace_id,generation,actor,operation,target,key,input_hash,response) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[...args,h,result]);return result;
}
export async function intent(tx:Tx,kind:string,resource:Row,token?:string) {
 const attempt=await tx.create('provider_attempts',{user_id:resource.user_id,merchant_id:resource.merchant_id,parent_id:resource.id,amount:resource.amount,status:'created',data:{kind,provider_token:token,resource_id:resource.id,operation_id:resource.id}});
 await tx.create('jobs',{parent_id:attempt.id,status:'pending',data:{kind:'provider',attempt_id:attempt.id,run_at:tx.now().toISOString(),tries:0}});return attempt;
}
export async function orderSummary(tx:Tx,id:string) {
 const order=await tx.get('orders',id),auths=await tx.rows('authorizations','AND parent_id=$3',[id]);
 const a=auths.find(a=>a.status!=='failed');const captures=a?await tx.rows('captures','AND parent_id=$3',[a.id]):[];
 const captured=captures.filter(c=>c.status==='succeeded').reduce((s,c)=>s+BigInt(c.amount),0n),refunded=captures.reduce((s,c)=>s+BigInt(c.refunded),0n);
 const held=a&&['authorized','partially_captured','pending'].includes(a.status)?BigInt(a.amount)-BigInt(a.captured)-BigInt(a.released):0n;
 const status=order.status==='cancelled'?'cancelled':captured>0n?(refunded===captured?'refunded':refunded>0n?'partially_refunded':captured===BigInt(order.amount)?'captured':'partially_captured'):a?.status==='authorized'?'authorized':a?.status==='pending'?'pending':a?.status==='expired'?'expired':a?.status==='voided'?'voided':'created';
 if(order.captured!==String(captured)||order.refunded!==String(refunded)||order.reserved!==String(held)||order.status!==status) await tx.update('orders',id,{captured:String(captured),refunded:String(refunded),reserved:String(held),status});
 return {...await tx.get('orders',id),authorizations:auths,captures};
}
export async function createOrder(tx:Tx,input:any) {
 ensure(tx.ctx.merchant,'FORBIDDEN',undefined,403);await can(tx,'merchants',tx.ctx.merchant,'can_receive');
 const n=amount(input.amount,BigInt(tx.workspace.settings.limit??'10000000'));ensure(typeof input.merchant_order_id==='string'&&input.merchant_order_id.length<=128&&input.merchant_order_id.length>0);
 ensure(Array.isArray(input.items)&&input.items.length>0&&input.items.length<=100,'INVALID_REQUEST','商品明細を指定してください。');
 let total=0n;for(const item of input.items){ensure(typeof item.name==='string'&&item.name.length<=200&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=100);total+=amount(item.unit_amount)*BigInt(item.quantity);}ensure(total===n,'INVALID_REQUEST','商品明細合計と注文金額が一致しません。');
 return tx.create('orders',{merchant_id:tx.ctx.merchant,owner_id:tx.ctx.merchant,business_key:input.merchant_order_id,amount:String(n),status:'created',data:{description:String(input.description??'').slice(0,500),items:input.items,metadata:input.metadata??{},entity:'order'}});
}
export async function createCheckout(tx:Tx,input:any) {
 const order=await tx.get('orders',input.order_id);merchantOwn(tx,order);ensure(order.status==='created','INVALID_STATE');
 const merchant=await tx.get('merchants',tx.ctx.merchant!);ensure(merchant.data.return_urls.includes(input.return_url)&&merchant.data.cancel_urls.includes(input.cancel_url),'INVALID_REQUEST','戻り先URLは登録値と完全一致する必要があります。');
 const row=await tx.create('checkouts',{parent_id:order.id,merchant_id:order.merchant_id,amount:order.amount,status:'created',data:{return_url:input.return_url,cancel_url:input.cancel_url,expires_at:new Date(tx.now().getTime()+1800000).toISOString(),nonce:randomToken(),order_id:order.id}});
 return {...row,checkout_url:`${config.portalUrl}/checkout/${row.id}`};
}
export async function approve(tx:Tx,id:string,input:any) {
 ensure(tx.ctx.user&&tx.ctx.role==='consumer','FORBIDDEN',undefined,403);const s=await tx.get('checkouts',id),o=await tx.get('orders',s.parent_id!);ensure(s.status==='created'&&o.status==='created','INVALID_STATE');ensure(new Date(s.data.expires_at)>tx.now(),'EXPIRED','チェックアウトの期限が切れています。',409);ensure(input.challenge===true,'INVALID_REQUEST','模擬追加認証の確認が必要です。');
 ensure(s.data.bound_session===tx.ctx.session,'FORBIDDEN','チェックアウト画面を開き直してください。',403);await can(tx,'users',tx.ctx.user,'can_pay');await can(tx,'merchants',o.merchant_id!,'can_receive');
 let method:Row|undefined;if(input.source!=='wallet'){method=await tx.get('payment_methods',input.source);userOwn(tx,method);ensure(method.status==='active'&&method.data.type==='card');}
 const n=BigInt(o.amount);if(!method){const b=await balances(tx,tx.ctx.user);ensure(BigInt(b.available)>=n,'INSUFFICIENT_FUNDS','利用可能残高が不足しています。',409);}
 await tx.update('checkouts',id,{user_id:tx.ctx.user,status:'approved',data:{...s.data,source:method?.id??'wallet',approved_at:tx.now().toISOString()}});await tx.event('checkout.approved',await tx.get('checkouts',id));
 const a=await tx.create('authorizations',{parent_id:o.id,user_id:tx.ctx.user,merchant_id:o.merchant_id,amount:o.amount,status:method?'pending':'authorized',data:{source:method?.id??'wallet',provider_token:method?.data.provider_token,order_id:o.id,checkout_id:id,expires_at:new Date(tx.now().getTime()+86400000).toISOString()}});
 if(method) await intent(tx,'authorize',a,method.data.provider_token);else {await journal(tx,'authorize:'+a.id,'残高支払いの保留',[debit(tx.ctx.user,'available',n),credit(tx.ctx.user,'held',n)],a.id);await tx.event('authorization.created',a);}
 if(n>=100000n)await tx.create('risk_reviews',{user_id:tx.ctx.user,merchant_id:o.merchant_id,parent_id:a.id,status:'pending',data:{rule:'high_amount',rule_version:tx.workspace.settings.risk_version,reason:'100,000円以上の模擬支払い'}});
 await orderSummary(tx,o.id);return a;
}
export async function capture(tx:Tx,id:string,input:any) {
 const a=await tx.get('authorizations',id);merchantOwn(tx,a);await can(tx,'merchants',a.merchant_id!,'can_capture');ensure(['authorized','partially_captured'].includes(a.status),'INVALID_STATE');ensure(new Date(a.data.expires_at)>tx.now(),'EXPIRED');ensure(a.reserved==='0','PROVIDER_PENDING','処理中の売上確定を照会してください。',409);
 const n=amount(input.amount),left=BigInt(a.amount)-BigInt(a.captured)-BigInt(a.released);ensure(n<=left,'CAPTURE_AMOUNT_EXCEEDED',undefined,409);
 const bps=BigInt(tx.workspace.settings.fee_bps??300),fixed=BigInt(tx.workspace.settings.fee_fixed??30),f=fee(n,bps,fixed);ensure(f<n,'INVALID_REQUEST','この金額では手数料が売上額以上になります。');
 const c=await tx.create('captures',{parent_id:a.id,merchant_id:a.merchant_id,user_id:a.user_id,amount:String(n),status:'pending',data:{order_id:a.parent_id,source:a.data.source,provider_token:a.data.provider_token,final_capture:input.final_capture===true,fee:String(f),fee_snapshot:{bps:String(bps),fixed:String(fixed),refundable:false}}});
 await tx.update('authorizations',a.id,{reserved:String(n)});
 if(a.data.source==='wallet')return finishCapture(tx,c,true);
 await intent(tx,'capture',c,a.data.provider_token);return c;
}
export async function finishCapture(tx:Tx,c:Row,success:boolean) {
 if(c.status!=='pending')return c;const a=await tx.get('authorizations',c.parent_id!),n=BigInt(c.amount),f=BigInt(c.data.fee);
 await tx.update('authorizations',a.id,{reserved:String(BigInt(a.reserved)-n)});
 c=await tx.update('captures',c.id,{status:success?'succeeded':'failed'});
 if(success){
  await journal(tx,'capture:'+c.id,'売上確定・手数料',[debit(a.data.source==='wallet'?a.user_id!:'platform',a.data.source==='wallet'?'held':'external',n),credit(a.merchant_id!,'unsettled',n-f),credit('platform','fees',f)],c.id);
  await tx.create('settlement_lots',{parent_id:c.id,merchant_id:c.merchant_id,amount:String(n-f),status:'pending',data:{settle_at:new Date(tx.now().getTime()+Number(tx.workspace.settings.settlement_seconds??config.settlementSeconds)*1000).toISOString()}});
  const captured=BigInt(a.captured)+n,unused=BigInt(a.amount)-captured-BigInt(a.released);
  const released=c.data.final_capture?unused:0n;
  if(released>0n&&a.data.source==='wallet')await journal(tx,'final-release:'+c.id,'最終確定時の未使用分解放',[debit(a.user_id!,'held',released),credit(a.user_id!,'available',released)],c.id);
  await tx.update('authorizations',a.id,{captured:String(captured),released:String(BigInt(a.released)+released),status:captured===BigInt(a.amount)?'captured':c.data.final_capture?'voided':'partially_captured'});
  await tx.notify(a.user_id!,'支払いが確定しました',`${c.amount}円の支払いが確定しました。`);
 }
 await tx.event(success?'capture.succeeded':'capture.failed',c);await orderSummary(tx,a.parent_id!);return c;
}
export async function voidAuthorization(tx:Tx,id:string,expired=false) {
 let a=await tx.get('authorizations',id);if(!expired)merchantOwn(tx,a);if(['voided','expired','captured','failed'].includes(a.status))return a;
 ensure(a.reserved==='0'&&a.status!=='pending','PROVIDER_PENDING','処理中の確定結果を待ってください。',409);
 const n=BigInt(a.amount)-BigInt(a.captured)-BigInt(a.released);
 if(n>0n&&a.data.source==='wallet')await journal(tx,(expired?'expire:':'void:')+a.id,'未確定残額の解放',[debit(a.user_id!,'held',n),credit(a.user_id!,'available',n)],a.id);
 a=await tx.update('authorizations',a.id,{status:expired?'expired':'voided',released:String(BigInt(a.released)+n)});await tx.event(expired?'authorization.expired':'authorization.voided',a);await orderSummary(tx,a.parent_id!);return a;
}
export async function refund(tx:Tx,id:string,input:any) {
 const c=await tx.get('captures',id);merchantOwn(tx,c);await can(tx,'merchants',c.merchant_id!,'can_refund');ensure(c.status==='succeeded','INVALID_STATE');const n=amount(input.amount);
 ensure(BigInt(c.refunded)+BigInt(c.reserved)+n<=BigInt(c.amount),'REFUND_AMOUNT_EXCEEDED',undefined,409);
 const b=await balances(tx,c.merchant_id!);ensure(BigInt(b.available)+BigInt(b.unsettled)>=n,'INSUFFICIENT_REFUND_FUNDS','加盟店の返金原資が不足しています。模擬追加入金を行ってください。',409);
 const allocations:{kind:'available'|'unsettled';amount:string;lot?:string}[]=[];let remaining=n;const avail=min(remaining,BigInt(b.available));if(avail>0n){allocations.push({kind:'available',amount:String(avail)});remaining-=avail;}
 const lots=await tx.rows('settlement_lots',"AND merchant_id=$3 AND status='pending' ORDER BY created_at,id",[c.merchant_id]);
 for(const lot of lots){const take=min(remaining,BigInt(lot.amount)-BigInt(lot.released)-BigInt(lot.reserved));if(take<=0n)continue;allocations.push({kind:'unsettled',amount:String(take),lot:lot.id});await tx.update('settlement_lots',lot.id,{reserved:String(BigInt(lot.reserved)+take)});remaining-=take;}
 ensure(remaining===0n,'INSUFFICIENT_REFUND_FUNDS',undefined,409);
 let r=await tx.create('refunds',{parent_id:c.id,merchant_id:c.merchant_id,user_id:c.user_id,amount:String(n),status:'pending',data:{order_id:c.data.order_id,source:c.data.source,provider_token:c.data.provider_token,allocations,reason:String(input.reason??'').slice(0,500)}});
 await journal(tx,'refund-reserve:'+r.id,'返金原資を確保',[...allocations.map(x=>debit(c.merchant_id!,x.kind,BigInt(x.amount))),credit(c.merchant_id!,'refund_held',n)],r.id);await tx.update('captures',c.id,{reserved:String(BigInt(c.reserved)+n)});await tx.event('refund.pending',r);
 if(c.data.source==='wallet')r=await finishRefund(tx,r,true);else await intent(tx,'refund',r,c.data.provider_token);return r;
}
export async function finishRefund(tx:Tx,r:Row,success:boolean) {
 if(r.status!=='pending')return r;const c=await tx.get('captures',r.parent_id!),n=BigInt(r.amount);
 if(success)await journal(tx,'refund:'+r.id,'元の支払元への返金',[debit(r.merchant_id!,'refund_held',n),credit(r.data.source==='wallet'?r.user_id!:'platform',r.data.source==='wallet'?'available':'external',n)],r.id);
 else await journal(tx,'refund-release:'+r.id,'返金失敗・原資を元勘定へ戻す',[debit(r.merchant_id!,'refund_held',n),...r.data.allocations.map((x:any)=>credit(r.merchant_id!,x.kind,BigInt(x.amount)))],r.id);
 for(const a of r.data.allocations)if(a.lot){const lot=await tx.get('settlement_lots',a.lot);await tx.update('settlement_lots',lot.id,{reserved:String(BigInt(lot.reserved)-BigInt(a.amount)),released:String(BigInt(lot.released)+(success?BigInt(a.amount):0n))});}
 await tx.update('captures',c.id,{reserved:String(BigInt(c.reserved)-n),refunded:String(BigInt(c.refunded)+(success?n:0n))});r=await tx.update('refunds',r.id,{status:success?'succeeded':'failed'});await tx.event(success?'refund.succeeded':'refund.failed',r);await orderSummary(tx,c.data.order_id);if(success)await tx.notify(r.user_id!,'返金が完了しました',`${r.amount}円を元の支払元に返金しました。`);return r;
}
export async function topup(tx:Tx,input:any,merchant=false) {
 const owner=merchant?tx.ctx.merchant:tx.ctx.user;ensure(owner,'FORBIDDEN',undefined,403);await can(tx,merchant?'merchants':'users',owner,'can_receive');const n=amount(input.amount);
 const r=await tx.create('topups',{user_id:merchant?null:owner,merchant_id:merchant?owner:null,amount:String(n),status:'pending',data:{owner}});await intent(tx,'topup',r,'mock_funding');return r;
}
export async function transfer(tx:Tx,input:any) {
 ensure(tx.ctx.user&&tx.ctx.role==='consumer','FORBIDDEN',undefined,403);const n=amount(input.amount,100000n);await can(tx,'users',tx.ctx.user,'can_pay');
 const recipient=(await tx.rows('users','AND id=$3',[input.recipient_id]))[0];ensure(recipient&&!recipient.data.admin&&recipient.id!==tx.ctx.user&&['consumer','friend'].includes(recipient.data.preset??'consumer'),'RESOURCE_NOT_FOUND','送金先を確認できません。',404);await can(tx,'users',recipient.id,'can_receive');
 const r=await tx.create('transfers',{user_id:tx.ctx.user,amount:String(n),status:'succeeded',data:{recipient_id:recipient.id,recipient_name:recipient.data.name,memo:String(input.memo??'').slice(0,200)}});await journal(tx,'transfer:'+r.id,'利用者間送金',[debit(tx.ctx.user,'available',n),credit(recipient.id,'available',n)],r.id);await tx.notify(recipient.id,'送金を受け取りました',`${n}円を受け取りました。`);return r;
}
export async function payout(tx:Tx,input:any,merchant=false) {
 const owner=merchant?tx.ctx.merchant:tx.ctx.user;ensure(owner,'FORBIDDEN',undefined,403);await can(tx,merchant?'merchants':'users',owner,'can_payout');const n=amount(input.amount);
 const bank=merchant?undefined:await tx.get('payment_methods',input.payment_method_id);if(bank){userOwn(tx,bank);ensure(bank.status==='active'&&bank.data.type==='bank');}
 const r=await tx.create('payouts',{user_id:merchant?null:owner,merchant_id:merchant?owner:null,amount:String(n),status:'requested',data:{owner,payment_method_id:bank?.id,provider_token:bank?.data.provider_token??('mock_'+((await tx.get('merchants',owner)).data.payout_bank??'demo-bank-a'))}});await journal(tx,'payout-reserve:'+r.id,'模擬銀行出金を申請',[debit(owner,'available',n),credit(owner,'payout_held',n)],r.id);await intent(tx,'payout',r,r.data.provider_token);return r;
}
