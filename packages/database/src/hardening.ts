import type {PoolClient} from 'pg';
/** Workspace-aware relationships for references stored alongside immutable snapshots. */
export async function hardenSchema(db:PoolClient){
 if((await db.query('SELECT 1 FROM schema_migrations WHERE version=4')).rowCount)return;
 const references:[string,string,string,string][]=[
  ['transfers','recipient_id',"data->>'recipient_id'",'users'],
  ['jobs','attempt_id',"data->>'attempt_id'",'provider_attempts'],
  ['webhook_deliveries','endpoint_id',"data->>'endpoint_id'",'webhook_endpoints'],
  ['payment_requests','transfer_id',"data->>'transfer_id'",'transfers'],
  ['authorizations','source_method_id',"CASE WHEN data->>'source'='wallet' THEN NULL ELSE data->>'source' END",'payment_methods'],
  ['captures','order_reference_id',"data->>'order_id'",'orders'],
  ['refunds','order_reference_id',"data->>'order_id'",'orders'],
  ['subscriptions','consent_reference_id',"data->>'consent_id'",'consents'],
  ['billing_cycles','authorization_reference_id',"data->>'authorization_id'",'authorizations'],
  ['billing_cycles','order_reference_id',"data->>'order_id'",'orders']
 ];
 for(const [table,column,expression,parent] of references)await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} text GENERATED ALWAYS AS (${expression}) STORED, ADD FOREIGN KEY(workspace_id,generation,${column}) REFERENCES ${parent}(workspace_id,generation,id)`);
 for(const [table,parent] of [['jobs','provider_attempts'],['scenarios','provider_attempts'],['webhook_deliveries','outbox']])await db.query(`ALTER TABLE ${table} ADD FOREIGN KEY(workspace_id,generation,parent_id) REFERENCES ${parent}(workspace_id,generation,id)`);
 const states:Record<string,string[]>={checkouts:['created','approved','cancelled','expired'],authorizations:['pending','authorized','partially_captured','captured','voided','expired','failed'],captures:['pending','succeeded','failed'],refunds:['pending','succeeded','failed'],provider_attempts:['created','pending','unknown','succeeded','failed'],payouts:['requested','processing','succeeded','failed','cancelled'],subscriptions:['pending_consent','active','past_due','paused','cancelled']};
 for(const [table,list] of Object.entries(states))await db.query(`ALTER TABLE ${table} ADD CHECK(status IN (${list.map(s=>"'"+s+"'").join(',')}))`);
 await db.query(`CREATE UNIQUE INDEX outbox_business_event_unique ON outbox(workspace_id,generation,business_key);
  CREATE UNIQUE INDEX user_email_unique ON users(workspace_id,generation,lower(data->>'email'));
  CREATE UNIQUE INDEX client_id_unique ON credentials((data->>'client_id'));
  INSERT INTO schema_migrations(version) VALUES(4)`);
}
