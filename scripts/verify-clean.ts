import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {config,root} from '../packages/database/src/config.ts';
// Creates and drops only freshly named verification databases, never the configured databases.
const suffix=randomUUID().replaceAll('-',''),names=['exw_verify_'+suffix,'store_verify_'+suffix];
const admin=new pg.Client({connectionString:config.databaseUrl});await admin.connect();
const url=(base:string,name:string)=>{const u=new URL(base);u.pathname='/'+name;return u.href;};
const role=(base:string)=>decodeURIComponent(new URL(base).username);
function identifier(value:string){if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))throw Error('Unexpected SQL identifier');return '"'+value+'"';}
const env={...process.env,DATABASE_URL:url(config.databaseUrl,names[0]),STORE_DATABASE_URL:url(config.storeDatabaseUrl,names[1])};
try{
 for(const [i,name] of names.entries()){await admin.query(`CREATE DATABASE ${identifier(name)} OWNER ${identifier(role(i?config.storeDatabaseUrl:config.databaseUrl))}`);await admin.query(`REVOKE CONNECT ON DATABASE ${identifier(name)} FROM PUBLIC`);await admin.query(`GRANT CONNECT ON DATABASE ${identifier(name)} TO ${identifier(role(i?config.storeDatabaseUrl:config.databaseUrl))}`);}
 await new Promise<void>((resolve,reject)=>{const p=spawn(process.execPath,['--import','tsx','scripts/verify-clean-child.ts'],{cwd:root,env,windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Fresh database verification failed')));});
 console.log('Fresh PostgreSQL migration, seed, API/SDK payment, and database separation verified.');
}finally{for(const name of names){if(!name.endsWith(suffix)||[new URL(config.databaseUrl).pathname.slice(1),new URL(config.storeDatabaseUrl).pathname.slice(1)].includes(name))throw Error('Refusing to remove a configured database');await admin.query(`DROP DATABASE IF EXISTS ${identifier(name)} WITH (FORCE)`);}await admin.end();}
