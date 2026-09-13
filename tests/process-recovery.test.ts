import {test,after} from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {pool,transaction} from '../packages/database/src/index.ts';import {createWorkspace} from '../apps/api/src/seed.ts';import {sessionContext} from '../apps/api/src/security.ts';import {topup} from '../apps/api/src/payments.ts';import {money} from '../packages/domain/src/index.ts';import {balances,reconciliation} from '../packages/database/src/ledger.ts';import {root} from '../packages/database/src/config.ts';
const workspaces:string[]=[];after(async()=>{await pool.query("UPDATE demo_workspaces SET status='archived' WHERE id=ANY($1)",[workspaces]);await pool.end();});
function child(mode:string,workspace:string){return new Promise<number|null>((resolve,reject)=>{const p=spawn(process.execPath,['--import','tsx','tests/helpers/worker-process.ts',mode,workspace],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let error='';p.stderr.on('data',b=>error+=b);p.on('error',reject);p.on('exit',code=>error?reject(Error(error)):resolve(code));});}
test('独立workerプロセスをprovider成功直後に停止し、新プロセスで1回だけ復旧',async()=>{
 const seed=await createWorkspace(true);workspaces.push(seed.workspace);const ctx=(await sessionContext(seed.token,'process-recovery')).ctx;const top=await transaction(ctx,tx=>topup(tx,{amount:money(1234n)}));
 await pool.query("UPDATE demo_workspaces SET settings=settings||'{\"worker_paused\":false}'::jsonb WHERE id=$1",[ctx.workspace]);
 assert.equal(await child('crash-after-provider',ctx.workspace),73);assert.equal((await transaction(ctx,tx=>tx.get('topups',top.id))).status,'pending');assert.equal((await transaction(ctx,tx=>balances(tx,ctx.user!))).available,'30000');
 await transaction(ctx,async tx=>{const job=(await tx.rows('jobs'))[0];await tx.update('jobs',job.id,{data:{...job.data,lease_until:new Date(Date.now()-1000).toISOString()}});});
 assert.equal(await child('recover',ctx.workspace),0);assert.equal((await transaction(ctx,tx=>balances(tx,ctx.user!))).available,'31234');assert.equal((await transaction(ctx,reconciliation)).ok,true);assert.equal(await child('recover',ctx.workspace),74);
});
