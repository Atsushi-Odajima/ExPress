import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {curlExamples,posixQuote,powershellQuote} from '../apps/api/src/playground.ts';
import {buildApp} from '../apps/api/src/app.ts';
import {config} from '../packages/database/src/config.ts';
import {pool,transaction} from '../packages/database/src/index.ts';
import {migrate} from '../packages/database/src/migrate.ts';
import {createWorkspace} from '../apps/api/src/seed.ts';
import {decrypt,newSession} from '../apps/api/src/security.ts';
import {money} from '../packages/domain/src/index.ts';
const run=promisify(execFile);
const workspaces:string[]=[];
before(migrate);after(async()=>{await pool.query("UPDATE demo_workspaces SET status='archived' WHERE id=ANY($1)",[workspaces]);await pool.end();});

test('Playgroundのcurl例はbody/Content-Typeを含み、シェルごとに安全にquoteし、秘密を埋め込まない',()=>{
 const hostile="key'; echo INJECTED #",body={merchant_order_id:"it's \"quoted\" $(whoami) `id`",amount:money(1000n),items:[{name:'デモ商品',quantity:1,unit_amount:money(1000n)}]};
 const {posix,powershell}=curlExamples({method:'POST',url:'http://localhost:4000/v1/orders',idempotencyKey:hostile,body});
 assert.equal(posixQuote("a'b"),`'a'"'"'b'`);assert.equal(powershellQuote(`a'b"c`),`'a''b\\"c'`);
 assert.match(posix,/^curl -X POST 'http:\/\/localhost:4000\/v1\/orders' \\\n/);
 assert.ok(posix.includes('-H "Authorization: Bearer $EXW_ACCESS_TOKEN"'),'POSIX token variable must be inside double quotes so the shell expands it');
 assert.ok(posix.includes(`-H 'Idempotency-Key: key'"'"'; echo INJECTED #'`));
 assert.ok(posix.includes("-H 'Content-Type: application/json'"));
 assert.ok(posix.includes(`--data-binary '${JSON.stringify(body).replace(/'/g,`'"'"'`)}'`));
 assert.ok(powershell.startsWith("curl.exe -X POST 'http://localhost:4000/v1/orders' `\n"));
 assert.ok(powershell.includes('-H "Authorization: Bearer $env:EXW_ACCESS_TOKEN"'));
 assert.ok(powershell.includes("-H 'Idempotency-Key: key''; echo INJECTED #'"));
 assert.ok(powershell.includes(`--data-binary '${JSON.stringify(body).replace(/'/g,"''").replace(/"/g,'\\"')}'`));
 const get=curlExamples({method:'GET',url:'http://localhost:4000/v1/balances',idempotencyKey:'read-0001'});
 assert.ok(!get.posix.includes('--data-binary')&&!get.posix.includes('Content-Type'));assert.ok(get.posix.includes("'Idempotency-Key: read-0001'"));
 for(const text of [posix,powershell,get.posix,get.powershell])assert.ok(!/exw_[A-Za-z0-9_-]{10,}|Bearer [A-Za-z0-9_-]{20,}/.test(text),'no credential material in examples');
});

test('Playground APIは実注文を作成し、返したPOSIX curl例はそのまま実行できる',async()=>{
 const seed=await createWorkspace(true);workspaces.push(seed.workspace);
 const app=await buildApp(),previousApiUrl=config.apiUrl;
 try{
  const base=await app.listen({host:'127.0.0.1',port:0});config.apiUrl=base;
  const owner=await transaction({workspace:seed.workspace,generation:1,actor:'test',role:'system',scopes:[],requestId:'playground-test'},async tx=>newSession(tx,(await tx.rows('users',"AND data->>'preset'='merchant1_owner'"))[0]));
  const headers={cookie:'exw_session='+owner.token,origin:config.portalUrl,'x-csrf-token':owner.csrf};
  const key="pg-'quoted'-"+randomUUID(),body={merchant_order_id:"PLAYGROUND-IT'S-001",amount:money(1000n),items:[{name:'デモ商品',quantity:1,unit_amount:money(1000n)}]};
  const executed=await app.inject({method:'POST',url:'/v1/merchant/playground',headers,payload:{method:'POST',path:'/v1/orders',body,idempotency_key:key}});
  assert.equal(executed.statusCode,200);const result=executed.json();assert.equal(result.status,200);assert.equal(result.response.business_key,"PLAYGROUND-IT'S-001");assert.match(result.request_id,/^req_/);
  assert.ok(result.curl.includes('--data-binary')&&result.curl.includes("'Content-Type: application/json'"));assert.ok(result.curl_powershell.includes('curl.exe'));
  assert.equal((await app.inject({method:'POST',url:'/v1/merchant/playground',headers,payload:{method:'POST',path:'/v1/balances',body:{},idempotency_key:randomUUID()}})).statusCode,403);
  if(process.platform==='win32')return;
  // Execute the displayed example verbatim with the Playground credential's own token: the same key replays the same order.
  const playgroundCredential=(await transaction({workspace:seed.workspace,generation:1,actor:'test',role:'system',scopes:[],requestId:'playground-test'},tx=>tx.rows('credentials',"AND data->>'internal_playground'='true'")))[0];
  const token=(await app.inject({method:'POST',url:'/v1/oauth/token',payload:{grant_type:'client_credentials',client_id:playgroundCredential.data.client_id,client_secret:decrypt(playgroundCredential.data.secret_encrypted)}})).json().access_token;
  const env={...process.env,EXW_ACCESS_TOKEN:token,NO_PROXY:'*',no_proxy:'*'};
  const first=JSON.parse((await run('sh',['-c',result.curl+' -sS'],{env})).stdout),second=JSON.parse((await run('sh',['-c',result.curl+' -sS'],{env})).stdout);
  assert.equal(first.business_key,"PLAYGROUND-IT'S-001");assert.equal(first.id,result.response.id,'the displayed example reproduces the Playground operation');assert.equal(second.id,first.id,'same Idempotency-Key replays the same order');
  assert.equal((await transaction({workspace:seed.workspace,generation:1,actor:'test',role:'system',scopes:[],requestId:'playground-test'},tx=>tx.rows('orders',"AND business_key=$3",["PLAYGROUND-IT'S-001"]))).length,1);
  const unauthenticated=JSON.parse((await run('sh',['-c',result.curl+' -sS'],{env:{...env,EXW_ACCESS_TOKEN:'missing'}})).stdout);assert.equal(unauthenticated.error.code,'UNAUTHENTICATED');
  // A different key with the same input creates a second order only if the merchant reference differs; the same reference is rejected as a duplicate business event.
  const duplicate=JSON.parse((await run('sh',['-c',result.curl.replace("'Idempotency-Key: "+key.replace(/'/g,`'"'"'`)+"'","'Idempotency-Key: other-"+randomUUID()+"'")+' -sS'],{env})).stdout);assert.equal(duplicate.error?.code,'INVALID_STATE');
 }finally{config.apiUrl=previousApiUrl;await app.close();}
});
