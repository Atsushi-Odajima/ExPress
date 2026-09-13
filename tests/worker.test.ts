import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {pool,transaction,type Context} from '../packages/database/src/index.ts';
import {migrate} from '../packages/database/src/migrate.ts';
import {balances,reconciliation} from '../packages/database/src/ledger.ts';
import {createWorkspace} from '../apps/api/src/seed.ts';
import {sessionContext,encrypt} from '../apps/api/src/security.ts';
import {config} from '../packages/database/src/config.ts';
import {claimJob,runJob,maintenance,deliverOne,workerId} from '../apps/worker/src/worker.ts';
import {topup,createOrder} from '../apps/api/src/payments.ts';
import {money,scopes} from '../packages/domain/src/index.ts';
import {verifyWebhook} from '../packages/sdk-server/src/index.ts';
const workspaces:string[]=[];
before(migrate);after(async()=>{await pool.query("UPDATE demo_workspaces SET status='archived' WHERE id=ANY($1)",[workspaces]);await pool.end();});
async function fixture(){const seed=await createWorkspace(true);workspaces.push(seed.workspace);return (await sessionContext(seed.token,'worker-test')).ctx;}
test('lease期限内は再取得せず、停止したworkerの期限切れジョブを新workerが回復',async()=>{
 const ctx=await fixture();const p=await transaction(ctx,tx=>topup(tx,{amount:money(1000n)}));
 const job=(await transaction(ctx,tx=>tx.rows('jobs')))[0];
 await transaction(ctx,async tx=>{await tx.db.query("UPDATE demo_workspaces SET settings=settings||'{\"worker_paused\":false}'::jsonb WHERE id=$1",[ctx.workspace]);await tx.update('jobs',job.id,{status:'running',data:{...job.data,lease_owner:'terminated-worker',lease_until:new Date(Date.now()+60000).toISOString()}});});
 assert.equal(await claimJob(ctx.workspace),undefined);
 await transaction(ctx,async tx=>{const j=await tx.get('jobs',job.id);await tx.update('jobs',j.id,{data:{...j.data,lease_until:new Date(Date.now()-1).toISOString()}});});
 const claimed=await claimJob(ctx.workspace);assert.equal(claimed?.id,job.id);assert.equal(await claimJob(ctx.workspace),undefined);
 await runJob(claimed!);await runJob(claimed!);
 assert.equal((await transaction(ctx,tx=>tx.get('topups',p.id))).status,'succeeded');assert.equal((await transaction(ctx,tx=>balances(tx,ctx.user!))).available,'31000');assert.equal((await transaction(ctx,reconciliation)).ok,true);
});
test('outbox commit後の停止・配信lease回復・500再送・移行中二重署名・dead-letter',async()=>{
 const ctx=await fixture(),secret='worker-test-'+randomUUID(),old='previous-'+randomUUID();const received:{raw:string;signature:string}[]=[];let responseCode=500;
 const server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received.push({raw,signature:String(req.headers['express-signature'])});res.writeHead(responseCode);res.end('accepted');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port,previousUrl=config.storeUrl;config.storeUrl='http://localhost:'+port;const url=config.storeUrl+'/webhooks/express-wallet';config.webhookAllowlist.push(url);
 try{
  await transaction(ctx,async tx=>{const ep=(await tx.rows('webhook_endpoints'))[0];await tx.update('webhook_endpoints',ep.id,{data:{...ep.data,url,secret_encrypted:encrypt(secret),previous_secret_encrypted:encrypt(old),previous_valid_until:new Date(Date.now()+86400000).toISOString()}});const mc={...ctx,merchant:ep.merchant_id!,scopes:[...scopes]};tx.ctx=mc;const order=await createOrder(tx,{merchant_order_id:randomUUID(),amount:money(1000n),items:[{name:'Outbox recovery',quantity:1,unit_amount:money(1000n)}]});await tx.event('capture.succeeded',order);});
  // No worker ran during the business commit. A later pass materializes its delivery.
  assert.equal((await transaction(ctx,tx=>tx.rows('webhook_deliveries'))).length,0);await maintenance(ctx);await maintenance(ctx);
  let deliveries=await transaction(ctx,tx=>tx.rows('webhook_deliveries'));assert.equal(deliveries.length,1);const eventId=deliveries[0].data.event_id;
  await transaction(ctx,tx=>tx.update('webhook_deliveries',deliveries[0].id,{status:'running',data:{...deliveries[0].data,lease_owner:'stopped-worker',lease_until:new Date(Date.now()-10).toISOString()}}));
  await deliverOne(ctx);assert.equal(received.length,1);assert.equal(verifyWebhook(received[0].raw,received[0].signature,[secret]),true);assert.equal(verifyWebhook(received[0].raw,received[0].signature,[old]),true);
  assert.equal(JSON.parse(received[0].raw).event_id,eventId);
  responseCode=200;await pool.query('UPDATE demo_workspaces SET clock_offset=10000 WHERE id=$1',[ctx.workspace]);await deliverOne(ctx);
  deliveries=await transaction(ctx,tx=>tx.rows('webhook_deliveries'));assert.deepEqual(deliveries.map(d=>d.status).sort(),['failed','succeeded']);assert.equal(new Set(deliveries.map(d=>d.id)).size,2);assert.equal(new Set(deliveries.map(d=>d.data.event_id)).size,1);
  // Expired rotation removes the old signature. Exhaustion is persisted, not lost.
  await transaction(ctx,async tx=>{const ep=(await tx.rows('webhook_endpoints'))[0];await tx.update('webhook_endpoints',ep.id,{data:{...ep.data,previous_valid_until:new Date(Date.now()-1000).toISOString()}});await tx.create('webhook_deliveries',{parent_id:deliveries[0].parent_id,merchant_id:ep.merchant_id,status:'pending',data:{...deliveries[0].data,attempt:6,run_at:tx.now().toISOString()}});});
  responseCode=500;await deliverOne(ctx);assert.equal(verifyWebhook(received.at(-1)!.raw,received.at(-1)!.signature,[old]),false);assert.equal(verifyWebhook(received.at(-1)!.raw,received.at(-1)!.signature,[secret]),true);assert.equal((await transaction(ctx,tx=>tx.rows('webhook_deliveries',"AND status='dead_letter'"))).length,1);
 }finally{config.storeUrl=previousUrl;config.webhookAllowlist.splice(config.webhookAllowlist.indexOf(url),1);await new Promise<void>(r=>server.close(()=>r()));}
});

test('シナリオ9: providerのtimeout_successはunknownとして扱い、照会ジョブで1回だけ記帳する',async()=>{
 const ctx=await fixture();const t=await transaction(ctx,tx=>topup(tx,{amount:money(500n)}));
 const attempt=(await transaction(ctx,tx=>tx.rows('provider_attempts','AND parent_id=$3',[t.id])))[0];
 await transaction(ctx,async tx=>{await tx.create('scenarios',{parent_id:attempt.id,data:{mode:'timeout_success'}});await tx.db.query("UPDATE demo_workspaces SET settings=settings||'{\"worker_paused\":false}'::jsonb WHERE id=$1",[ctx.workspace]);});
 let job=await claimJob(ctx.workspace);assert.ok(job);await runJob(job!);
 assert.equal((await transaction(ctx,tx=>tx.get('provider_attempts',attempt.id))).status,'unknown');assert.equal((await transaction(ctx,tx=>tx.get('topups',t.id))).status,'pending');assert.equal((await transaction(ctx,tx=>balances(tx,ctx.user!))).available,'30000','no new funds movement while the result is unknown');
 await transaction(ctx,async tx=>{const j=await tx.get('jobs',job!.id);assert.equal(j.status,'pending');await tx.update('jobs',j.id,{data:{...j.data,run_at:new Date(Date.now()-1).toISOString()}});});
 job=await claimJob(ctx.workspace);assert.ok(job);await runJob(job!);
 assert.equal((await transaction(ctx,tx=>tx.get('provider_attempts',attempt.id))).status,'succeeded');assert.equal((await transaction(ctx,tx=>tx.get('topups',t.id))).status,'succeeded');assert.equal((await transaction(ctx,tx=>balances(tx,ctx.user!))).available,'30500');
 assert.equal((await transaction(ctx,tx=>tx.rows('jobs'))).length,1);assert.equal((await transaction(ctx,tx=>tx.get('jobs',job!.id))).status,'succeeded');assert.equal(await claimJob(ctx.workspace),undefined);assert.equal((await transaction(ctx,reconciliation)).ok,true);
});
