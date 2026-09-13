import { pool,tables } from './index.ts';
import { fileURLToPath } from 'node:url';
import {hardenSchema} from './hardening.ts';
export async function migrate() {
 const db=await pool.connect();
 try {
 await db.query('BEGIN'); await db.query('SELECT pg_advisory_xact_lock(17092026)');
 await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`);
 if((await db.query('SELECT 1 FROM schema_migrations WHERE version=1')).rowCount) {
  if(!(await db.query('SELECT 1 FROM schema_migrations WHERE version=2')).rowCount){
   await db.query(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS writer_xid xid8 NOT NULL DEFAULT pg_current_xact_id();
    CREATE OR REPLACE FUNCTION exw_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
     IF EXISTS (SELECT 1 FROM journal_entries WHERE workspace_id=NEW.workspace_id AND generation=NEW.generation AND id=NEW.journal_id AND writer_xid<>pg_current_xact_id()) THEN RAISE EXCEPTION 'Cannot append to a committed journal'; END IF; RETURN NEW; END $$;
    INSERT INTO schema_migrations VALUES(2,now());`);
  }
  if(!(await db.query('SELECT 1 FROM schema_migrations WHERE version=3')).rowCount){await db.query(`CREATE TABLE demo_access(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES demo_workspaces(id),expires_at timestamptz NOT NULL); INSERT INTO schema_migrations VALUES(3,now());`);}
  await hardenSchema(db);await db.query('COMMIT');return;
 }
 await db.query(`CREATE TABLE demo_workspaces(id text PRIMARY KEY,generation integer NOT NULL DEFAULT 1 CHECK(generation>0),clock_offset bigint NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'active',settings jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE workspace_generations(workspace_id text REFERENCES demo_workspaces(id),generation integer NOT NULL,PRIMARY KEY(workspace_id,generation));`);
 for(const table of tables) await db.query(`CREATE TABLE ${table} (
  id text NOT NULL,workspace_id text NOT NULL,generation integer NOT NULL,owner_id text,user_id text,merchant_id text,parent_id text,business_key text,
  status text NOT NULL DEFAULT 'active',currency text NOT NULL DEFAULT 'JPY' CHECK(currency='JPY'),
  amount bigint NOT NULL DEFAULT 0 CHECK(amount>=0),captured bigint NOT NULL DEFAULT 0 CHECK(captured>=0),refunded bigint NOT NULL DEFAULT 0 CHECK(refunded>=0),reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0),released bigint NOT NULL DEFAULT 0 CHECK(released>=0),
  data jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,generation,id),UNIQUE(id),UNIQUE(workspace_id,generation,owner_id,business_key),
  FOREIGN KEY(workspace_id,generation) REFERENCES workspace_generations(workspace_id,generation));
  CREATE INDEX ${table}_scope ON ${table}(workspace_id,generation,created_at,id);`);
 for(const table of tables) {
  if(table!=='users') await db.query(`ALTER TABLE ${table} ADD FOREIGN KEY(workspace_id,generation,user_id) REFERENCES users(workspace_id,generation,id);`);
  if(table!=='merchants') await db.query(`ALTER TABLE ${table} ADD FOREIGN KEY(workspace_id,generation,merchant_id) REFERENCES merchants(workspace_id,generation,id);`);
 }
 const parents:Record<string,string>={checkouts:'orders',authorizations:'orders',captures:'authorizations',refunds:'captures',settlement_lots:'captures',subscriptions:'plans',consents:'subscriptions',billing_cycles:'subscriptions',disputes:'orders',dispute_messages:'disputes',merchant_members:'merchants',merchant_applications:'merchants'};
 for(const [table,parent] of Object.entries(parents)) await db.query(`ALTER TABLE ${table} ADD FOREIGN KEY(workspace_id,generation,parent_id) REFERENCES ${parent}(workspace_id,generation,id);`);
 await db.query(`
 CREATE UNIQUE INDEX billing_period_unique ON billing_cycles(workspace_id,generation,parent_id,business_key);
 CREATE UNIQUE INDEX order_reference_unique ON orders(workspace_id,generation,merchant_id,business_key);
 CREATE UNIQUE INDEX live_order_authorization ON authorizations(workspace_id,generation,parent_id) WHERE status NOT IN ('failed');
 ALTER TABLE authorizations ADD CHECK(captured+reserved+released<=amount);
 ALTER TABLE captures ADD CHECK(refunded+reserved<=amount);
 ALTER TABLE settlement_lots ADD CHECK(released+reserved<=amount);
 CREATE TABLE sessions(id text PRIMARY KEY,workspace_id text NOT NULL,generation integer NOT NULL,user_id text NOT NULL,csrf text NOT NULL,role text NOT NULL,merchant_id text,expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,generation,user_id) REFERENCES users(workspace_id,generation,id));
 CREATE TABLE access_tokens(id text PRIMARY KEY,workspace_id text NOT NULL,generation integer NOT NULL,credential_id text NOT NULL,credential_version integer NOT NULL,scopes text[] NOT NULL,expires_at timestamptz NOT NULL,FOREIGN KEY(workspace_id,generation,credential_id) REFERENCES credentials(workspace_id,generation,id));
 CREATE TABLE idempotency_records(workspace_id text NOT NULL,generation integer NOT NULL,actor text NOT NULL,operation text NOT NULL,target text NOT NULL,key text NOT NULL,input_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,generation,actor,operation,target,key),FOREIGN KEY(workspace_id,generation) REFERENCES workspace_generations(workspace_id,generation));
 CREATE TABLE ledger_accounts(id text NOT NULL,workspace_id text NOT NULL,generation integer NOT NULL,owner_id text NOT NULL,kind text NOT NULL,currency text NOT NULL DEFAULT 'JPY' CHECK(currency='JPY'),normal_side text NOT NULL CHECK(normal_side IN ('debit','credit')),balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0),PRIMARY KEY(workspace_id,generation,id),UNIQUE(workspace_id,generation,owner_id,kind),FOREIGN KEY(workspace_id,generation) REFERENCES workspace_generations(workspace_id,generation));
 CREATE TABLE journal_entries(id text NOT NULL,workspace_id text NOT NULL,generation integer NOT NULL,business_event text NOT NULL,description text NOT NULL,reference_id text,writer_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,generation,id),UNIQUE(workspace_id,generation,business_event),FOREIGN KEY(workspace_id,generation) REFERENCES workspace_generations(workspace_id,generation));
 CREATE TABLE journal_lines(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,workspace_id text NOT NULL,generation integer NOT NULL,journal_id text NOT NULL,account_id text NOT NULL,currency text NOT NULL DEFAULT 'JPY' CHECK(currency='JPY'),side text NOT NULL CHECK(side IN ('debit','credit')),amount bigint NOT NULL CHECK(amount>0),FOREIGN KEY(workspace_id,generation,journal_id) REFERENCES journal_entries(workspace_id,generation,id),FOREIGN KEY(workspace_id,generation,account_id) REFERENCES ledger_accounts(workspace_id,generation,id));
 CREATE FUNCTION exw_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable journal: use a reversing journal'; END $$;
 CREATE TRIGGER immutable_entry BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION exw_immutable();
 CREATE TRIGGER immutable_line BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION exw_immutable();
 CREATE FUNCTION exw_balanced() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE net numeric; cnt integer; BEGIN
 SELECT coalesce(sum(CASE side WHEN 'debit' THEN amount ELSE -amount END),0),count(*) INTO net,cnt FROM journal_lines WHERE workspace_id=NEW.workspace_id AND generation=NEW.generation AND journal_id=NEW.id;
 IF net<>0 OR cnt<2 THEN RAISE EXCEPTION 'Unbalanced or empty journal'; END IF; RETURN NULL; END $$;
 CREATE CONSTRAINT TRIGGER journal_balanced AFTER INSERT ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION exw_balanced();
 CREATE FUNCTION exw_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS (SELECT 1 FROM journal_entries WHERE workspace_id=NEW.workspace_id AND generation=NEW.generation AND id=NEW.journal_id AND writer_xid<>pg_current_xact_id()) THEN RAISE EXCEPTION 'Cannot append to a committed journal'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER sealed_entry BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION exw_line_insert();
 CREATE TABLE mock_provider_results(id text PRIMARY KEY,workspace_id text NOT NULL,generation integer NOT NULL,result text NOT NULL,provider_token text,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE demo_access(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES demo_workspaces(id),expires_at timestamptz NOT NULL);
 INSERT INTO schema_migrations(version) VALUES(1),(2),(3);`);
 await hardenSchema(db);await db.query('COMMIT');
 } catch(e){await db.query('ROLLBACK');throw e;} finally{db.release();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {await migrate();console.log('ExPress migration complete');await pool.end();}
