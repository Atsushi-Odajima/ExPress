import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migrate} from '../packages/database/src/migrate.ts';
import {pool,transaction,type Context,type Tx} from '../packages/database/src/index.ts';
import {balances,reconciliation,journal,debit,credit} from '../packages/database/src/ledger.ts';
import {createWorkspace} from '../apps/api/src/seed.ts';
import {createOrder,createCheckout,approve,capture,refund,voidAuthorization,idempotent,topup,payout} from '../apps/api/src/payments.ts';
import {amount,fee,money,nextMonth,csv,scopes} from '../packages/domain/src/index.ts';
import {sessionContext,hash,newSession} from '../apps/api/src/security.ts';
import {buildApp} from '../apps/api/src/app.ts';
import {applyProvider,maintenance} from '../apps/worker/src/worker.ts';
import {MockProvider} from '../packages/testkit/src/index.ts';
import {signWebhook,verifyWebhook,ExPressClient} from '../packages/sdk-server/src/index.ts';
import {checkoutExample} from '../packages/sdk-server/examples/checkout.ts';
import {privateAddress,webhookAddress} from '../apps/api/src/security.ts';
import {config} from '../packages/database/src/config.ts';
import {plan,subscription,consent,subscriptionAction,openDispute} from '../apps/api/src/services.ts';
const testWorkspaces:string[]=[];
before(migrate);after(async()=>{await pool.query("UPDATE demo_workspaces SET status='archived' WHERE id=ANY($1)",[testWorkspaces]);await pool.end();});
async function fixture(initial=30000n){
 const seed=await createWorkspace(true),ctx=(await sessionContext(seed.token,'test')).ctx;testWorkspaces.push(ctx.workspace);
 const merchant=(await transaction(ctx,tx=>tx.rows('merchants')))[0];
 const mc={...ctx,actor:'test-merchant',user:undefined,merchant:merchant.id,role:'owner',scopes:[...scopes]};
 if(initial!==30000n)await transaction(ctx,tx=>journal(tx,'test-initial:'+randomUUID(),'テスト初期残高',[debit(ctx.user!,'available',30000n-initial),credit('platform','external',30000n-initial)]));
 async function authorize(n=1000n,source='wallet'){
  const o=await transaction(mc,tx=>createOrder(tx,{merchant_order_id:randomUUID(),amount:money(n),items:[{name:'Test',quantity:1,unit_amount:money(n)}]}));
  const s=await transaction(mc,tx=>createCheckout(tx,{order_id:o.id,return_url:config.storeUrl+'/return',cancel_url:config.storeUrl+'/cancel'}));
  return transaction(ctx,async tx=>{await tx.update('checkouts',s.id,{data:{...s.data,bound_session:ctx.session}});return approve(tx,s.id,{source,challenge:true});});
 }
 return {ctx,mc,seed,authorize};
}
test('金額・手数料・月末アンカー・CSV注入',()=>{assert.equal(amount(money('1000')),1000n);assert.equal(fee(1000n),60n);for(const value of ['0','-1','1.5','01','1e3'])assert.throws(()=>amount({currency:'JPY',value}));assert.throws(()=>amount({currency:'USD',value:'1'}));const feb=nextMonth(new Date('2028-01-31T09:00:00Z'));assert.equal(feb.toISOString(),'2028-02-29T09:00:00.000Z');assert.equal(nextMonth(feb,31).toISOString(),'2028-03-31T09:00:00.000Z');assert.match(csv([{memo:'=HYPERLINK(1)'}]),/'=HYPERLINK/);});
test('100並列の同一冪等キーcaptureは1回・入力相違は409',async()=>{
 const {ctx,mc,authorize}=await fixture(),a=await authorize(10000n),body={amount:money(1000n),final_capture:false};
 const results=await Promise.all(Array.from({length:100},()=>transaction(mc,tx=>idempotent(tx,'capture',a.id,'same-key-100',body,()=>capture(tx,a.id,body)))));
 assert.equal(new Set(results.map((r:any)=>r.id)).size,1);
 assert.equal((await transaction(ctx,tx=>tx.rows('captures'))).length,1);
 await assert.rejects(transaction(mc,tx=>idempotent(tx,'capture',a.id,'same-key-100',{amount:money(2000n)},()=>capture(tx,a.id,{amount:money(2000n)}))),{code:'IDEMPOTENCY_CONFLICT'});
 assert.equal((await transaction(ctx,reconciliation)).ok,true);
});
test('異なるキーの100並列captureも累計を超えない',async()=>{const {ctx,mc,authorize}=await fixture(),a=await authorize(1000n);const out=await Promise.allSettled(Array.from({length:100},()=>transaction(mc,tx=>capture(tx,a.id,{amount:money(100n)}))));assert.equal(out.filter(x=>x.status==='fulfilled').length,10);const r=await transaction(ctx,tx=>tx.get('authorizations',a.id));assert.equal(r.captured,'1000');assert.equal((await transaction(ctx,reconciliation)).ok,true);});
test('残高10,000に対する8,000円同時支払いは一方だけ',async()=>{const f=await fixture(10000n);const out=await Promise.allSettled([f.authorize(8000n),f.authorize(8000n)]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);const b=await transaction(f.ctx,tx=>balances(tx,f.ctx.user!));assert.equal(b.available,'2000');assert.equal(b.held,'8000');});
test('部分capture・void競合・返金・未精算ロットの整合性',async()=>{
 const f=await fixture(),a=await f.authorize(10000n);const c=await transaction(f.mc,tx=>capture(tx,a.id,{amount:money(6000n)}));
 await Promise.allSettled([transaction(f.mc,tx=>voidAuthorization(tx,a.id)),transaction(f.mc,tx=>capture(tx,a.id,{amount:money(4000n)})),transaction(f.ctx,tx=>voidAuthorization(tx,a.id,true))]);
 const final=await transaction(f.ctx,tx=>tx.get('authorizations',a.id));assert.equal(BigInt(final.captured)+BigInt(final.released),10000n);
 const b=await transaction(f.ctx,tx=>balances(tx,f.ctx.user!));assert.equal(b.held,'0');
 await transaction(f.mc,tx=>refund(tx,c.id,{amount:money(1000n)}));await pool.query('UPDATE demo_workspaces SET clock_offset=100000 WHERE id=$1',[f.ctx.workspace]);await maintenance({...f.ctx,role:'system'});
 assert.equal((await transaction(f.ctx,reconciliation)).ok,true);const lots=await transaction(f.ctx,tx=>tx.rows('settlement_lots'));assert.ok(lots.every(l=>l.released===l.amount));
});
test('手数料返却なし・並列返金の予約上限・原資不足',async()=>{
 const f=await fixture(),a=await f.authorize(),c=await transaction(f.mc,tx=>capture(tx,a.id,{amount:money(1000n),final_capture:true}));
 await assert.rejects(transaction(f.mc,tx=>refund(tx,c.id,{amount:money(1000n)})),{code:'INSUFFICIENT_REFUND_FUNDS'});
 await transaction(f.mc,tx=>journal(tx,'merchant-fund:'+randomUUID(),'テスト加盟店入金',[debit('platform','external',1000n),credit(f.mc.merchant!,'available',1000n)]));
 const out=await Promise.allSettled(Array.from({length:5},()=>transaction(f.mc,tx=>refund(tx,c.id,{amount:money(300n)}))));assert.equal(out.filter(x=>x.status==='fulfilled').length,3);assert.equal((await transaction(f.ctx,tx=>tx.get('captures',c.id))).refunded,'900');assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
});
test('カード直払いは財布を増減せず削除済みカードへ返金できる',async()=>{
 const f=await fixture(),method=(await transaction(f.ctx,tx=>tx.rows('payment_methods',"AND user_id=$3 AND data->>'type'='card'",[f.ctx.user])))[0];
 const a=await f.authorize(1000n,method.id);let at=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[a.id])))[0];await transaction(f.ctx,tx=>applyProvider(tx,at,'succeeded'));
 const c=await transaction(f.mc,tx=>capture(tx,a.id,{amount:money(1000n)}));at=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[c.id])))[0];await transaction(f.ctx,tx=>applyProvider(tx,at,'succeeded'));
 await transaction(f.ctx,tx=>tx.update('payment_methods',method.id,{status:'deleted'}));const r=await transaction(f.mc,tx=>refund(tx,c.id,{amount:money(500n)}));assert.equal(r.data.provider_token,method.data.provider_token);
 at=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[r.id])))[0];await transaction(f.ctx,tx=>applyProvider(tx,at,'succeeded'));assert.equal((await transaction(f.ctx,tx=>balances(tx,f.ctx.user!))).available,'30000');assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
});
test('provider成功後結果保存前の停止から照会復旧・二重計上なし',async()=>{const f=await fixture();const t=await transaction(f.ctx,tx=>topup(tx,{amount:money(1000n)}));const a=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[t.id])))[0];const mock=new MockProvider();assert.equal(await mock.execute(a),'succeeded');assert.equal((await transaction(f.ctx,tx=>tx.get('topups',t.id))).status,'pending');const result=await mock.lookup(a);await transaction(f.ctx,tx=>applyProvider(tx,a,result));await transaction(f.ctx,async tx=>applyProvider(tx,await tx.get('provider_attempts',a.id),result));assert.equal((await transaction(f.ctx,tx=>balances(tx,f.ctx.user!))).available,'31000');});
test('出金失敗は出金保留を解放',async()=>{const f=await fixture();const bank=(await transaction(f.ctx,tx=>tx.rows('payment_methods',"AND user_id=$3 AND data->>'type'='bank'",[f.ctx.user])))[0];const p=await transaction(f.ctx,tx=>payout(tx,{amount:money(1000n),payment_method_id:bank.id}));const a=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[p.id])))[0];await transaction(f.ctx,tx=>applyProvider(tx,a,'failed'));const b=await transaction(f.ctx,tx=>balances(tx,f.ctx.user!));assert.equal(b.available,'30000');assert.equal(b.payout_held,'0');});
test('Webhook署名・期限・ローテーション・改ざん',()=>{const raw='{"event_id":"e1"}',sig=signWebhook(raw,'old');assert.equal(verifyWebhook(raw,sig,['new','old']),true);assert.equal(verifyWebhook(raw,sig,['new']),false);assert.equal(verifyWebhook(raw+' ',sig,['old']),false);assert.equal(verifyWebhook(raw,signWebhook(raw,'old',Math.floor(Date.now()/1000)-301),['old']),false);assert.equal(verifyWebhook(raw,'t=nan,v1=aa',['old']),false);});
test('DBがworkspace外部キー・台帳変更・不一致仕訳を拒否',async()=>{const f=await fixture(),other=await fixture();await assert.rejects(transaction(f.ctx,tx=>tx.create('topups',{user_id:other.ctx.user})),{code:'23503'});await assert.rejects(pool.query('UPDATE journal_entries SET description=\'tamper\' WHERE workspace_id=$1',[f.ctx.workspace]));await assert.rejects(transaction(f.ctx,tx=>tx.db.query('INSERT INTO journal_entries(id,workspace_id,generation,business_event,description) VALUES($1,$2,$3,$4,$5)',[randomUUID(),f.ctx.workspace,1,randomUUID(),'unbalanced'])));});
test('APIのCSRF・scope・IDOR・失効secret・他workspace・OpenAPI',async()=>{
 const f=await fixture(),other=await fixture(),app=await buildApp();try{
 const headers={cookie:'exw_session='+f.seed.token,origin:config.portalUrl,'x-csrf-token':f.seed.csrf,'idempotency-key':'api-test-0001'};
 assert.equal((await app.inject({method:'POST',url:'/v1/me/topups',headers:{cookie:headers.cookie},payload:{amount:money(1n)}})).statusCode,400);
 assert.equal((await app.inject({method:'POST',url:'/v1/me/topups',headers:{...headers,'x-csrf-token':'bad'},payload:{amount:money(1n)}})).statusCode,403);
 assert.equal((await app.inject({method:'GET',url:'/v1/admin/overview',headers})).statusCode,403);
 const secret=randomUUID(),credential=await transaction(f.mc,tx=>tx.create('credentials',{merchant_id:f.mc.merchant,data:{client_id:randomUUID(),secret_hash:hash(secret),scopes:['orders:read']}}));
 const token=(await app.inject({method:'POST',url:'/v1/oauth/token',payload:{grant_type:'client_credentials',client_id:credential.data.client_id,client_secret:secret}})).json().access_token;
 const bearer={authorization:'Bearer '+token,'idempotency-key':'api-key-0002'};
 assert.equal((await app.inject({method:'POST',url:'/v1/orders',headers:bearer,payload:{merchant_order_id:'a',amount:money(100n),items:[{name:'a',quantity:1,unit_amount:money(100n)}]}})).statusCode,403);
 const a=await other.authorize();assert.equal((await app.inject({method:'GET',url:'/v1/orders/'+a.parent_id,headers:bearer})).statusCode,404);
 await transaction(f.mc,tx=>tx.update('credentials',credential.id,{status:'revoked'}));assert.equal((await app.inject({method:'GET',url:'/v1/orders',headers:bearer})).statusCode,401);
 assert.equal((await app.inject('/v1/openapi.json')).statusCode,200);
 const spec=(await app.inject('/v1/openapi.json')).json();assert.ok(spec.paths['/v1/captures/{id}/refunds']);
 }finally{await app.close();}
});
test('定期課金の周期一意性・残高不足再試行・同意撤回',async()=>{
 const f=await fixture(0n);const p=await transaction(f.mc,tx=>plan(tx,{amount:money(1000n),name:'Monthly',interval:'month'}));const s=await transaction(f.mc,tx=>subscription(tx,{plan_id:p.id}));await transaction(f.ctx,tx=>consent(tx,s.id,{accept:true,source:'wallet'}));await maintenance(f.ctx);assert.equal((await transaction(f.ctx,tx=>tx.get('subscriptions',s.id))).status,'past_due');
 await transaction(f.ctx,tx=>journal(tx,'retry-fund:'+randomUUID(),'Test topup',[debit('platform','external',2000n),credit(f.ctx.user!,'available',2000n)]));await pool.query('UPDATE demo_workspaces SET clock_offset=86400001 WHERE id=$1',[f.ctx.workspace]);await Promise.all([maintenance(f.ctx),maintenance(f.ctx)]);
 assert.equal((await transaction(f.ctx,tx=>tx.rows('billing_cycles'))).length,1);assert.equal((await transaction(f.ctx,tx=>tx.rows('captures'))).length,1);
 await transaction(f.ctx,tx=>subscriptionAction(tx,s.id,'cancel',true));await pool.query('UPDATE demo_workspaces SET clock_offset=86400000*40::bigint WHERE id=$1',[f.ctx.workspace]);await maintenance(f.ctx);assert.equal((await transaction(f.ctx,tx=>tx.rows('billing_cycles'))).length,1);
});
test('SDK READMEのcheckout例を実HTTP APIで実行・冪等結果一致',async()=>{
 const f=await fixture(),secret=randomUUID(),c=await transaction(f.mc,tx=>tx.create('credentials',{merchant_id:f.mc.merchant,data:{client_id:randomUUID(),secret_hash:hash(secret),scopes:[...scopes]}}));const app=await buildApp();
 try{const base=await app.listen({host:'127.0.0.1',port:0});const sdk=new ExPressClient({baseUrl:base,clientId:c.data.client_id,clientSecret:secret});const reference='sdk-'+randomUUID();const first=await checkoutExample(sdk,reference,config.storeUrl),again=await checkoutExample(sdk,reference,config.storeUrl);assert.equal(first.order.id,again.order.id);assert.equal(first.checkout.id,again.checkout.id);assert.equal((await sdk.getOrder(first.order.id)).amount,'1000');assert.match(first.checkout.checkout_url,/\/checkout\//);}finally{await app.close();}
});
test('SSRF: loopback/private/link-local/任意ホストを拒否・ローカル例外はECのみ',async()=>{for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.2.2','169.254.169.254','::1','fe80::1','fc00::1','::ffff:127.0.0.1'])assert.equal(privateAddress(ip),true,ip);assert.equal(privateAddress('8.8.8.8'),false);for(const url of ['http://localhost:1234/','https://example.com/','http://169.254.169.254/','not a url'])await assert.rejects(webhookAddress(url));assert.equal((await webhookAddress(config.storeUrl+'/webhooks/express-wallet')).address,'127.0.0.1');});
test('処理中カード返金を含めた予約上限・失敗時の原資ロット復元',async()=>{
 const f=await fixture(),method=(await transaction(f.ctx,tx=>tx.rows('payment_methods',"AND user_id=$3 AND data->>'type'='card'",[f.ctx.user])))[0],a=await f.authorize(2000n,method.id);
 const apply=async(resourceId:string,result:'succeeded'|'failed')=>transaction(f.ctx,async tx=>{const at=(await tx.rows('provider_attempts','AND parent_id=$3',[resourceId]))[0];await applyProvider(tx,at,result);});
 await apply(a.id,'succeeded');const c=await transaction(f.mc,tx=>capture(tx,a.id,{amount:money(2000n)}));await apply(c.id,'succeeded');
 await transaction(f.mc,tx=>journal(tx,'refund-extra:'+randomUUID(),'Refund test funding',[debit('platform','external',200n),credit(f.mc.merchant!,'available',200n)]));
 const attempts=await Promise.allSettled(Array.from({length:3},()=>transaction(f.mc,tx=>refund(tx,c.id,{amount:money(900n)}))));const accepted=attempts.filter(a=>a.status==='fulfilled').map(a=>(a as PromiseFulfilledResult<any>).value);assert.equal(accepted.length,2);assert.equal((await transaction(f.ctx,tx=>tx.get('captures',c.id))).reserved,'1800');
 await apply(accepted[0].id,'failed');await apply(accepted[1].id,'succeeded');const cap=await transaction(f.ctx,tx=>tx.get('captures',c.id));assert.equal(cap.reserved,'0');assert.equal(cap.refunded,'900');assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
});
test('期限切れtoken・return URL完全一致・他加盟店のIDOR・利用者制限後も返金受取',async()=>{
 const f=await fixture(),a=await f.authorize();await transaction(f.ctx,async tx=>{const u=await tx.get('users',f.ctx.user!);await tx.update('users',u.id,{data:{...u.data,capabilities:{...u.data.capabilities,can_pay:false}}});});await assert.rejects(f.authorize(),{code:'ACCOUNT_RESTRICTED'});
 const c=await transaction(f.mc,tx=>capture(tx,a.id,{amount:money(1000n)}));await transaction(f.mc,tx=>refund(tx,c.id,{amount:money(100n)}));assert.equal((await transaction(f.ctx,tx=>balances(tx,f.ctx.user!))).available,'29100');
 const second=(await transaction(f.ctx,tx=>tx.rows('merchants'))).find(m=>m.id!==f.mc.merchant)!;await assert.rejects(transaction({...f.mc,merchant:second.id},tx=>refund(tx,c.id,{amount:money(100n)})),{code:'RESOURCE_NOT_FOUND'});
 const order=await transaction(f.mc,tx=>createOrder(tx,{merchant_order_id:randomUUID(),amount:money(1000n),items:[{name:'a',quantity:1,unit_amount:money(1000n)}]}));await assert.rejects(transaction(f.mc,tx=>createCheckout(tx,{order_id:order.id,return_url:config.storeUrl+'/return?malicious=1',cancel_url:config.storeUrl+'/cancel'})),{code:'INVALID_REQUEST'});
 const app=await buildApp(),secret=randomUUID(),credential=await transaction(f.mc,tx=>tx.create('credentials',{merchant_id:f.mc.merchant,data:{client_id:randomUUID(),secret_hash:hash(secret),scopes:['orders:read']}}));try{const token=(await app.inject({method:'POST',url:'/v1/oauth/token',payload:{grant_type:'client_credentials',client_id:credential.data.client_id,client_secret:secret}})).json().access_token;await pool.query("UPDATE access_tokens SET expires_at=now()-interval '1 second' WHERE id=$1",[hash(token)]);assert.equal((await app.inject({url:'/v1/orders',headers:{authorization:'Bearer '+token}})).statusCode,401);}finally{await app.close();}
});
test('resetはgenerationを更新し旧セッション・旧ジョブ結果を拒否、他workspaceは不変',async()=>{
 const f=await fixture(),other=await fixture();const old=await transaction(f.ctx,tx=>topup(tx,{amount:money(1000n)}));const a=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[old.id])))[0];await new MockProvider().execute(a);
 const app=await buildApp();try{const result=await app.inject({method:'POST',url:'/v1/demo/reset',headers:{cookie:'exw_session='+f.seed.token,origin:config.portalUrl,'x-csrf-token':f.seed.csrf},payload:{confirm:'RESET'}});assert.equal(result.statusCode,200);await assert.rejects(transaction(f.ctx,tx=>applyProvider(tx,a,'succeeded')),{code:'UNAUTHENTICATED'});assert.equal((await app.inject({url:'/v1/session',headers:{cookie:'exw_session='+f.seed.token}})).statusCode,401);assert.equal((await transaction(other.ctx,tx=>balances(tx,other.ctx.user!))).available,'30000');const w=(await pool.query('SELECT generation FROM demo_workspaces WHERE id=$1',[f.ctx.workspace])).rows[0];assert.equal(w.generation,2);}finally{await app.close();}
});
test('通常登録→ログアウト→同じ隔離環境へログイン、他端末セッションを失効',async()=>{
 const f=await fixture(),app=await buildApp(),password='sample-password-'+randomUUID(),email='new@example.test';
 const headers={cookie:'exw_session='+f.seed.token,origin:config.portalUrl,'x-csrf-token':f.seed.csrf};
 try{
  const registered=await app.inject({method:'POST',url:'/v1/auth/register',headers,payload:{name:'Demo user',email,password}});assert.equal(registered.statusCode,200);assert.equal(registered.json().user.data.admin,undefined);assert.equal(registered.body.includes('password_hash'),false);
  const cookie=registered.cookies.find(c=>c.name==='exw_session')!;const h={...headers,cookie:'exw_session='+cookie.value,'x-csrf-token':registered.json().csrf};
  assert.equal((await app.inject({method:'POST',url:'/v1/auth/logout',headers:h,payload:{}})).statusCode,200);
  assert.equal((await app.inject({url:'/v1/session',headers:h})).statusCode,401);
  const login=()=>app.inject({method:'POST',url:'/v1/auth/login',headers:{origin:config.portalUrl,cookie:'exw_demo='+f.seed.owner_token},payload:{email,password}});
  const a=await login(),b=await login();assert.equal(a.statusCode,200);assert.equal(b.statusCode,200);const ah={cookie:'exw_session='+a.cookies.find(c=>c.name==='exw_session')!.value,origin:config.portalUrl,'x-csrf-token':a.json().csrf};
  await app.inject({method:'POST',url:'/v1/me/sessions/revoke-others',headers:ah,payload:{}});
  assert.equal((await app.inject({url:'/v1/session',headers:ah})).statusCode,200);assert.equal((await app.inject({url:'/v1/session',headers:{cookie:'exw_session='+b.cookies.find(c=>c.name==='exw_session')!.value}})).statusCode,401);
  const other=await fixture();assert.equal((await app.inject({method:'POST',url:'/v1/auth/login',headers:{origin:config.portalUrl,cookie:'exw_demo='+other.seed.owner_token},payload:{email,password}})).statusCode,401);
 }finally{await app.close();}
});
test('同じ仕訳内の複数勘定もcursor明細で欠落しない、成功202をAPIログに保存',async()=>{
 const f=await fixture();await f.authorize(1000n);const app=await buildApp(),headers={cookie:'exw_session='+f.seed.token,origin:config.portalUrl,'x-csrf-token':f.seed.csrf};try{
  let cursor:string|null=null;const ids:string[]=[];do{const r:any=await app.inject({url:'/v1/me/transactions?limit=1'+(cursor?'&cursor='+cursor:''),headers});assert.equal(r.statusCode,200);const b=r.json();ids.push(...b.data.map((r:any)=>r.line_id));cursor=b.next_cursor;}while(cursor);
  assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);
  assert.equal((await app.inject({url:'/v1/me/transactions?cursor=invalid',headers})).statusCode,400);
  const r=await app.inject({url:'/v1/me/topups',method:'POST',headers:{...headers,'idempotency-key':randomUUID()},payload:{amount:money(1000n)}});assert.equal(r.statusCode,202);
  // Response delivery precedes completion of onResponse; wait for the committed audit row.
  let logs:any[]=[];for(let i=0;i<20&&!logs.length;i++){logs=await transaction(f.ctx,tx=>tx.rows('api_logs',"AND data->>'request_id'=$3",[r.headers['x-request-id']]));if(!logs.length)await new Promise(resolve=>setTimeout(resolve,25));}assert.equal(logs[0]?.data.status,202);
 }finally{await app.close();}
});
test('カード定期課金の拒否は同じ周期を1日後・3日後に再試行し最大3回で停止',async()=>{
 const f=await fixture();const method=(await transaction(f.ctx,tx=>tx.rows('payment_methods',"AND user_id=$3 AND data->>'type'='card'",[f.ctx.user])))[0];const p=await transaction(f.mc,tx=>plan(tx,{amount:money(1000n),name:'Card monthly',interval:'month'})),s=await transaction(f.mc,tx=>subscription(tx,{plan_id:p.id}));await transaction(f.ctx,tx=>consent(tx,s.id,{accept:true,source:method.id}));
 for(let i=0;i<3;i++){
  await pool.query('UPDATE demo_workspaces SET clock_offset=$2 WHERE id=$1',[f.ctx.workspace,i===0?0:(i===1?86400001:3*86400000+1)]);await maintenance(f.ctx);
  const cycles=await transaction(f.ctx,tx=>tx.rows('billing_cycles'));assert.equal(cycles.length,1);
  const auth=await transaction(f.ctx,tx=>tx.get('authorizations',cycles[0].data.authorization_id));const at=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[auth.id])))[0];await transaction(f.ctx,tx=>applyProvider(tx,at,'failed'));await maintenance(f.ctx);
  assert.equal((await transaction(f.ctx,tx=>tx.get('subscriptions',s.id))).status,i<2?'past_due':'paused');
 }
 assert.equal((await transaction(f.ctx,tx=>tx.rows('billing_cycles')))[0].data.attempts,3);assert.equal((await transaction(f.ctx,tx=>tx.rows('captures'))).length,0);assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
});
test('台帳から業務レコードまで照合し、集計の不一致を検出する',async()=>{
 const f=await fixture(),a=await f.authorize(1000n);await transaction(f.mc,tx=>capture(tx,a.id,{amount:money(500n)}));
 assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
 await assert.rejects(transaction(f.ctx,async tx=>{await tx.update('orders',a.parent_id!,{captured:'1'});const result=await reconciliation(tx);assert.equal(result.ok,false);assert.ok(result.business.some(c=>c.rule==='order.captured'&&!c.ok));throw Error('ROLLBACK_TEST_CHANGE');}),/ROLLBACK_TEST_CHANGE/);
 const other=await fixture();await assert.rejects(transaction(f.ctx,tx=>tx.create('transfers',{user_id:f.ctx.user,data:{recipient_id:other.ctx.user}})),{code:'23503'});
});

test('運営者の調整反対仕訳・案件内資料・他workspace拒否',async()=>{
 const f=await fixture(),other=await fixture(),a=await f.authorize();const dispute=await transaction(f.ctx,tx=>openDispute(tx,{order_id:a.parent_id,message:'サンプル購入について確認',subject:'Sample case'}));
 const admin=await transaction(f.ctx,async tx=>newSession(tx,(await tx.rows('users',"AND data->>'preset'='admin'"))[0]));const headers={cookie:'exw_session='+admin.token,origin:config.portalUrl,'x-csrf-token':admin.csrf};const app=await buildApp();
 try{
  const adjustment=await app.inject({method:'POST',url:'/v1/admin/adjustments',headers:{...headers,'idempotency-key':randomUUID()},payload:{amount:money(500n),owner_id:f.ctx.user,type:'user',direction:'credit',counter_account:'mock_external',reason:'サンプル調整を確認'}});assert.equal(adjustment.statusCode,200);
  const entry=await app.inject({url:'/v1/admin/journals/'+adjustment.json().id,headers});assert.equal(entry.json().lines.length,2);
  const reverse={method:'POST' as const,url:'/v1/admin/journals/'+adjustment.json().id+'/reverse',headers:{...headers,'idempotency-key':randomUUID()},payload:{reason:'入力を訂正する反対仕訳'}};const reversed=await app.inject(reverse);assert.equal(reversed.statusCode,200);assert.equal((await app.inject(reverse)).json().id,reversed.json().id);assert.equal((await transaction(f.ctx,tx=>balances(tx,f.ctx.user!))).available,'29000');
  assert.equal((await app.inject({method:'POST',url:'/v1/admin/disputes/'+dispute.id+'/messages',headers,payload:{message:'模擬資料を添付して仲介',attachment:'demo-receipt.txt'}})).statusCode,200);
  const path='/v1/disputes/'+dispute.id+'/materials/demo-receipt.txt';const document=await app.inject({url:path,headers:{cookie:'exw_session='+f.seed.token}});assert.equal(document.statusCode,200);assert.match(document.json().content,/no real money/);assert.equal((await app.inject({url:path,headers:{cookie:'exw_session='+other.seed.token}})).statusCode,404);
  assert.equal((await app.inject({method:'POST',url:'/v1/admin/disputes/'+dispute.id+'/messages',headers,payload:{message:'拒否する資料',attachment:'../../.env'}})).statusCode,400);
  assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
 }finally{await app.close();}
});

test('カード課金確保後の加盟店制限でもジョブが停滞せず同周期の失敗に収束',async()=>{
 const f=await fixture(),method=(await transaction(f.ctx,tx=>tx.rows('payment_methods',"AND user_id=$3 AND data->>'type'='card'",[f.ctx.user])))[0];const p=await transaction(f.mc,tx=>plan(tx,{amount:money(1000n),name:'Restricted merchant',interval:'month'})),s=await transaction(f.mc,tx=>subscription(tx,{plan_id:p.id}));await transaction(f.ctx,tx=>consent(tx,s.id,{accept:true,source:method.id}));await maintenance(f.ctx);
 const cycle=(await transaction(f.ctx,tx=>tx.rows('billing_cycles')))[0],attempt=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[cycle.data.authorization_id])))[0];await transaction(f.ctx,tx=>applyProvider(tx,attempt,'succeeded'));
 await transaction(f.ctx,async tx=>{const m=await tx.get('merchants',f.mc.merchant);await tx.update('merchants',m.id,{data:{...m.data,capabilities:{...m.data.capabilities,can_capture:false}}});});await maintenance(f.ctx);
 assert.equal((await transaction(f.ctx,tx=>tx.get('subscriptions',s.id))).status,'past_due');assert.equal((await transaction(f.ctx,tx=>tx.get('authorizations',cycle.data.authorization_id))).status,'voided');assert.equal((await transaction(f.ctx,tx=>tx.rows('captures'))).length,0);assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
});

test('連続失敗ルールとテストWebhookの対象endpoint限定',async()=>{
 const f=await fixture(),method=(await transaction(f.ctx,tx=>tx.rows('payment_methods',"AND user_id=$3 AND data->>'type'='card'",[f.ctx.user])))[0];
 for(let i=0;i<4;i++){const a=await f.authorize(1000n,method.id),attempt=(await transaction(f.ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[a.id])))[0];await transaction(f.ctx,tx=>applyProvider(tx,attempt,'failed'));}
 const risks=await transaction(f.ctx,tx=>tx.rows('risk_reviews',"AND data->>'rule'='repeated_failures'"));assert.equal(risks.length,1);assert.equal(risks[0].data.count,3);
 const endpoint=await transaction(f.ctx,async tx=>{const ep=(await tx.rows('webhook_endpoints'))[0];await tx.update('webhook_endpoints',ep.id,{data:{...ep.data,events:['capture.succeeded']}});await tx.event('webhook.test',ep);return ep;});await maintenance(f.ctx);const deliveries=await transaction(f.ctx,tx=>tx.rows('webhook_deliveries'));assert.equal(deliveries.length,1);assert.equal(deliveries[0].data.endpoint_id,endpoint.id);
});

test('開発者は自分のscopeを超えるAPI鍵の発行・更新ができない',async()=>{
 const f=await fixture(),dev=await transaction(f.ctx,async tx=>newSession(tx,(await tx.rows('users',"AND data->>'preset'='merchant1_developer'"))[0]));const app=await buildApp(),headers={cookie:'exw_session='+dev.token,origin:config.portalUrl,'x-csrf-token':dev.csrf};
 try{const allowed=await app.inject({method:'POST',url:'/v1/merchant/applications',headers,payload:{name:'Read orders',scopes:['orders:read']}});assert.equal(allowed.statusCode,200);assert.ok(allowed.json().client_secret);
 const denied=await app.inject({method:'POST',url:'/v1/merchant/applications',headers,payload:{name:'Forbidden privilege',scopes:['payouts:write']}});assert.equal(denied.statusCode,403);
 const store=(await transaction(f.ctx,tx=>tx.rows('credentials',"AND data->>'internal_store'='true'")))[0];assert.equal((await app.inject({method:'POST',url:'/v1/merchant/applications/'+store.id+'/rotate',headers,payload:{}})).statusCode,403);
 }finally{await app.close();}
});

test('レート制限は429とRetry-After、別workspaceの認証主体へ波及しない',async()=>{
 const f=await fixture(),other=await fixture(),app=await buildApp();
 try{for(let i=0;i<300;i++)assert.equal((await app.inject({url:'/v1/session',headers:{cookie:'exw_session='+f.seed.token}})).statusCode,200);
 const denied=await app.inject({url:'/v1/session',headers:{cookie:'exw_session='+f.seed.token}});assert.equal(denied.statusCode,429);assert.equal(denied.json().error.code,'RATE_LIMITED');assert.ok(Number(denied.headers['retry-after'])>0);assert.equal((await app.inject({url:'/v1/session',headers:{cookie:'exw_session='+other.seed.token}})).statusCode,200);
 for(let i=0;i<20;i++)await app.inject({method:'POST',url:'/v1/auth/login',headers:{origin:config.portalUrl},payload:{email:'absent@example.test',password:'wrong'}});const login=await app.inject({method:'POST',url:'/v1/auth/login',headers:{origin:config.portalUrl},payload:{email:'absent@example.test',password:'wrong'}});assert.equal(login.statusCode,429);assert.equal(login.json().error.code,'RATE_LIMITED');assert.ok(login.headers['retry-after']);
 }finally{await app.close();}
});

test('精算前返金→精算→加盟店出金失敗/成功→原資不足→追加入金で全額返金',async()=>{
 const f=await fixture(),a=await f.authorize(1000n);await assert.rejects(transaction(f.mc,tx=>refund(tx,a.id,{amount:money(100n)})),{code:'RESOURCE_NOT_FOUND'});
 const c=await transaction(f.mc,tx=>capture(tx,a.id,{amount:money(1000n),final_capture:true}));await transaction(f.mc,tx=>refund(tx,c.id,{amount:money(200n)}));
 await pool.query('UPDATE demo_workspaces SET clock_offset=120000 WHERE id=$1',[f.ctx.workspace]);await maintenance(f.ctx);let b=await transaction(f.mc,tx=>balances(tx,f.mc.merchant));assert.equal(b.unsettled,'0');assert.equal(b.available,'740');
 const apply=async(id:string,result:'succeeded'|'failed')=>transaction(f.ctx,async tx=>{const attempt=(await tx.rows('provider_attempts','AND parent_id=$3',[id]))[0];await applyProvider(tx,attempt,result);});
 const failed=await transaction(f.mc,tx=>payout(tx,{amount:money(740n)},true));await apply(failed.id,'failed');b=await transaction(f.mc,tx=>balances(tx,f.mc.merchant));assert.equal(b.available,'740');assert.equal(b.payout_held,'0');
 const paid=await transaction(f.mc,tx=>payout(tx,{amount:money(740n)},true));await apply(paid.id,'succeeded');await assert.rejects(transaction(f.mc,tx=>refund(tx,c.id,{amount:money(800n)})),{code:'INSUFFICIENT_REFUND_FUNDS'});
 const t=await transaction(f.mc,tx=>topup(tx,{amount:money(800n)},true));await apply(t.id,'succeeded');await transaction(f.mc,tx=>refund(tx,c.id,{amount:money(800n)}));assert.equal((await transaction(f.ctx,tx=>balances(tx,f.ctx.user!))).available,'30000');assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
});

test('削除済み模擬カードで新規継続課金を開始しない',async()=>{
 const f=await fixture(),method=(await transaction(f.ctx,tx=>tx.rows('payment_methods',"AND user_id=$3 AND data->>'type'='card'",[f.ctx.user])))[0],p=await transaction(f.mc,tx=>plan(tx,{name:'Deleted source',amount:money(1000n),interval:'month'})),s=await transaction(f.mc,tx=>subscription(tx,{plan_id:p.id}));
 await transaction(f.ctx,tx=>consent(tx,s.id,{accept:true,source:method.id}));await transaction(f.ctx,tx=>tx.update('payment_methods',method.id,{status:'deleted'}));await maintenance(f.ctx);
 assert.equal((await transaction(f.ctx,tx=>tx.get('subscriptions',s.id))).status,'past_due');assert.equal((await transaction(f.ctx,tx=>tx.rows('provider_attempts'))).length,0);assert.equal((await transaction(f.ctx,tx=>balances(tx,f.ctx.user!))).available,'30000');assert.equal((await transaction(f.ctx,reconciliation)).ok,true);
});
