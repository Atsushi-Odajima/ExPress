import {pool,transaction,type Context,type Row} from '../../database/src/index.ts';
export type ProviderResult='succeeded'|'failed'|'pending'|'unknown';
export interface FundingProvider {execute(attempt:Row):Promise<ProviderResult>;lookup(attempt:Row):Promise<ProviderResult>;}
export interface PayoutProvider extends FundingProvider {}
/** An independently committed simulated provider. This is the external boundary. */
export class MockProvider implements FundingProvider,PayoutProvider {
 async execute(attempt:Row):Promise<ProviderResult> {
  const old=(await pool.query('SELECT result FROM mock_provider_results WHERE id=$1',[attempt.id])).rows[0];if(old)return old.result;
  const scenario=(await pool.query("SELECT data FROM scenarios WHERE workspace_id=$1 AND generation=$2 AND parent_id=$3 AND status='active'",[attempt.workspace_id,attempt.generation,attempt.id])).rows[0]?.data;
  const mode=scenario?.mode??(String(attempt.data.provider_token).includes('decline')?'decline':'success');
  if(mode==='pending')return 'pending';
  const result=mode==='decline'?'failed':'succeeded';await pool.query('INSERT INTO mock_provider_results(id,workspace_id,generation,result,provider_token) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[attempt.id,attempt.workspace_id,attempt.generation,result,attempt.data.provider_token??null]);
  return mode==='timeout_success'||mode==='crash_after_success'?'unknown':result;
 }
 async lookup(attempt:Row):Promise<ProviderResult> {return (await pool.query('SELECT result FROM mock_provider_results WHERE id=$1',[attempt.id])).rows[0]?.result??this.execute(attempt);}
}
