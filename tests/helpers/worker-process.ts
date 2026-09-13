import {claimJob,runJob} from '../../apps/worker/src/worker.ts';
import {pool,transaction,type Context} from '../../packages/database/src/index.ts';
import {MockProvider} from '../../packages/testkit/src/index.ts';
const [mode,workspace]=process.argv.slice(2),ctx:Context={workspace,generation:1,actor:'recovery-test',role:'system',scopes:[],requestId:'process-test'};
const job=await claimJob(workspace);if(!job)process.exit(74);
if(mode==='crash-after-provider'){
 const attempt=await transaction(ctx,tx=>tx.get('provider_attempts',job.data.attempt_id));await new MockProvider().execute(attempt);
 // Abrupt termination: no business result commit, no graceful worker cleanup.
 process.exit(73);
}
await runJob(job);await pool.end();
