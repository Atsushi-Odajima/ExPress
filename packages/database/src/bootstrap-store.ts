import pg from 'pg';
import {config} from './config.ts';
/**
 * Creates the sample store's own PostgreSQL role and database on the ledger server.
 * For hosts that offer a single PostgreSQL instance (for example one free-tier database): the store must
 * still use its own role and its own database, and that role must not be able to connect to the ledger
 * database, exactly like packages/database/init-store.sql does for Docker Compose.
 *
 * Runs as the ledger database owner (DATABASE_URL). Idempotent; skipped when STORE_DB_PASSWORD is unset.
 * Env: STORE_DB_PASSWORD (required to run), STORE_DB_ROLE (default exw_store), STORE_DB_NAME (default exw_store).
 */
const password=process.env.STORE_DB_PASSWORD,role=process.env.STORE_DB_ROLE??'exw_store',dbName=process.env.STORE_DB_NAME??'exw_store';
if(!password){console.log('bootstrap-store: STORE_DB_PASSWORD is not set, nothing to do');process.exit(0);}
if(!/^[a-z_][a-z0-9_]*$/.test(role)||!/^[a-z_][a-z0-9_]*$/.test(dbName))throw Error('STORE_DB_ROLE and STORE_DB_NAME must be lowercase identifiers');
const admin=new pg.Client({connectionString:config.databaseUrl});await admin.connect();
const id=(s:string)=>admin.escapeIdentifier(s),lit=(s:string)=>admin.escapeLiteral(s);
try{
 const ledgerDb=(await admin.query('SELECT current_database() AS db')).rows[0].db as string;
 if(ledgerDb===dbName)throw Error('The store database must differ from the ledger database');
 const privileges=(await admin.query('SELECT rolcreaterole,rolcreatedb,rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];
 if(!privileges.rolsuper&&(!privileges.rolcreaterole||!privileges.rolcreatedb))throw Error('The ledger database user lacks CREATEROLE/CREATEDB; create the store role and database with an administrator account instead (see packages/database/init-store.sql)');
 if((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await admin.query(`ALTER ROLE ${id(role)} WITH LOGIN PASSWORD ${lit(password)}`);
 else await admin.query(`CREATE ROLE ${id(role)} WITH LOGIN PASSWORD ${lit(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
 if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[dbName])).rowCount)await admin.query(`CREATE DATABASE ${id(dbName)}`);
 await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${id(dbName)} TO ${id(role)}`);
 // The store role must never reach the ledger database.
 await admin.query(`REVOKE CONNECT ON DATABASE ${id(ledgerDb)} FROM PUBLIC`);
 await admin.query(`REVOKE ALL ON DATABASE ${id(ledgerDb)} FROM ${id(role)}`);
 // Inside the store database the role gets CREATE on the public schema so it can create its own tables (PostgreSQL 15+ removed CREATE for everyone).
 // Ownership is not transferred: managed hosts grant CREATEROLE/CREATEDB without SET ROLE on created roles, so ALTER ... OWNER would fail (42501).
 const storeUrl=new URL(config.databaseUrl);storeUrl.pathname='/'+dbName;
 const store=new pg.Client({connectionString:storeUrl.toString()});await store.connect();
 try{await store.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${id(role)}`);}finally{await store.end();}
 const denied=await admin.query('SELECT has_database_privilege($1,$2,$3) AS ok',[role,ledgerDb,'CONNECT']);
 if(denied.rows[0].ok)throw Error(`${role} can still connect to ${ledgerDb}`);
 console.log(`bootstrap-store: role ${role} owns database ${dbName}; CONNECT to ${ledgerDb} revoked`);
}finally{await admin.end();}
