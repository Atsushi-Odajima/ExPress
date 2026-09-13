import pg, {type PoolClient} from 'pg';
import { randomUUID } from 'node:crypto';
import { config } from './config.ts';
import { DomainError, ensure } from '../../domain/src/index.ts';
export const pool = new pg.Pool({connectionString:config.databaseUrl,max:25});
export const tables = ['users','merchants','merchant_members','merchant_applications','credentials','wallets','payment_methods','orders','checkouts','authorizations','captures','refunds','provider_attempts','topups','transfers','payment_requests','payouts','settlement_lots','outbox','webhook_endpoints','webhook_deliveries','jobs','plans','consents','subscriptions','billing_cycles','disputes','dispute_messages','notifications','risk_reviews','audit_logs','api_logs','scenarios','store_handoffs'] as const;
export type Table = typeof tables[number];
export interface Row {
 id:string; workspace_id:string; generation:number; owner_id:string|null; user_id:string|null; merchant_id:string|null; parent_id:string|null;
 business_key:string|null; status:string; currency:'JPY'; amount:string; captured:string; refunded:string; reserved:string; released:string;
 data:Record<string, any>; version:number; created_at:Date; updated_at:Date;
}
export interface Workspace { id:string; generation:number; clock_offset:string; status:string; settings:Record<string,any>; }
export type Context = {workspace:string; generation:number; actor:string; user?:string; merchant?:string; role:string; scopes:string[]; requestId:string; credential?:string; session?:string};
export class Tx {
 constructor(public db:PoolClient, public ctx:Context, public workspace:Workspace) {}
 now() { return new Date(Date.now()+Number(this.workspace.clock_offset)); }
 async rows(table:Table, extra='', values:unknown[]=[]):Promise<Row[]> {
  ensure(tables.includes(table)); return (await this.db.query<Row>(`SELECT * FROM ${table} WHERE workspace_id=$1 AND generation=$2 ${extra}`, [this.ctx.workspace,this.ctx.generation,...values])).rows;
 }
 async get(table:Table,id:string):Promise<Row> { const r=(await this.rows(table,'AND id=$3',[id]))[0]; ensure(r,'RESOURCE_NOT_FOUND',undefined,404); return r; }
 async create(table:Table, fields:Partial<Row>={}):Promise<Row> {
  const value={id:randomUUID(),workspace_id:this.ctx.workspace,generation:this.ctx.generation,created_at:this.now(),updated_at:this.now(),...fields};
  const keys=Object.keys(value); return (await this.db.query<Row>(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(value))).rows[0];
 }
 async update(table:Table,id:string,fields:Partial<Row>):Promise<Row> {
  const allowed=['owner_id','user_id','merchant_id','parent_id','business_key','status','amount','captured','refunded','reserved','released','data'];
  const keys=Object.keys(fields); ensure(keys.every(k=>allowed.includes(k))); const vals=Object.values(fields);
  return (await this.db.query<Row>(`UPDATE ${table} SET ${keys.map((k,i)=>k+'=$'+(i+4)).join(',')}, version=version+1,updated_at=$${keys.length+4} WHERE workspace_id=$1 AND generation=$2 AND id=$3 RETURNING *`,[this.ctx.workspace,this.ctx.generation,id,...vals,this.now()])).rows[0];
 }
 async event(type:string,r:Row) {
  return this.create('outbox',{merchant_id:r.merchant_id,user_id:r.user_id,parent_id:r.id,status:'pending',business_key:`${type}:${r.id}:${r.version}`,data:{event_id:randomUUID(),type,created_at:this.now().toISOString(),resource_id:r.id,resource_version:r.version,data:{id:r.id,order_id:r.data.order_id??(r.data.entity==='order'?r.id:undefined),status:r.status,currency:r.currency,amount:r.amount},generation:this.ctx.generation}});
 }
 async audit(action:string,target:string,reason:string,before:unknown={},after:unknown={}) { return this.create('audit_logs',{owner_id:this.ctx.actor,data:{actor:this.ctx.actor,action,target,reason,request_id:this.ctx.requestId,before,after}}); }
 async notify(user:string,title:string,detail:string) { return this.create('notifications',{user_id:user,status:'unread',data:{title,detail,channel:'in_app_outbox'}}); }
}
export async function transaction<T>(ctx:Context,fn:(tx:Tx)=>Promise<T>):Promise<T> {
 for(let attempt=0;;attempt++) {
  const db=await pool.connect();
  try {
   await db.query('BEGIN');
   const w=(await db.query<Workspace>('SELECT * FROM demo_workspaces WHERE id=$1 FOR UPDATE',[ctx.workspace])).rows[0];
   ensure(w&&w.generation===ctx.generation&&w.status==='active','UNAUTHENTICATED','デモセッションが失効しました。',401);
   const result=await fn(new Tx(db,ctx,w)); await db.query('COMMIT'); return result;
  } catch(e:any) { await db.query('ROLLBACK'); if(['40001','40P01'].includes(e.code)&&attempt<4) continue; if(e.code==='23505') throw new DomainError('INVALID_STATE','同じ業務処理は既に存在します。',409); throw e; }
  finally { db.release(); }
 }
}
