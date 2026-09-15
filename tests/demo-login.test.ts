import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../apps/api/src/app.ts';
import {config} from '../packages/database/src/config.ts';
import {pool} from '../packages/database/src/index.ts';
import {migrate} from '../packages/database/src/migrate.ts';
const workspaces:string[]=[];
before(migrate);after(async()=>{await pool.query("UPDATE demo_workspaces SET status='archived' WHERE id=ANY($1)",[workspaces]);await pool.end();});
const origin={origin:config.portalUrl};
function cookies(response:any){const out:Record<string,string>={};for(const c of response.cookies as any[])out[c.name]=c.value;return out;}

test('組み込みデモアカウントは、環境が無くても自分専用のworkspaceを作って入れる',async()=>{
 const app=await buildApp();
 try{
  const login=await app.inject({method:'POST',url:'/v1/auth/login',headers:origin,payload:{email:config.demoLoginId,password:config.demoLoginPassword}});
  assert.equal(login.statusCode,200);
  const session=login.json();workspaces.push(session.user.workspace_id);
  assert.equal(session.user.business_key,'consumer','サンプル利用者として入る');
  const jar=cookies(login);assert.ok(jar.exw_session&&jar.exw_demo,'セッションとデモ環境のcookieを発行する');
  // The workspace is the same one the start button creates: the sample wallet with its opening balance.
  const balances=await app.inject({method:'GET',url:'/v1/me/balances',headers:{...origin,cookie:'exw_session='+jar.exw_session}});
  assert.equal(balances.statusCode,200);assert.equal(balances.json().available,'30000');
  // A second sign-in with no workspace cookie gets its own isolated workspace, not the first one.
  const second=await app.inject({method:'POST',url:'/v1/auth/login',headers:origin,payload:{email:'  KURO  '.replace('KURO',config.demoLoginId.toUpperCase()),password:config.demoLoginPassword}});
  assert.equal(second.statusCode,200);workspaces.push(second.json().user.workspace_id);
  assert.notEqual(second.json().user.workspace_id,session.user.workspace_id,'大文字・空白を許容しつつ、workspaceは訪問者ごと');
 }finally{await app.close();}
});

test('誤ったパスワード・未知のIDではworkspaceを作らず401',async()=>{
 const app=await buildApp();
 try{
  const before=Number((await pool.query('SELECT count(*) FROM demo_workspaces')).rows[0].count);
  for(const payload of [{email:config.demoLoginId,password:'0131'},{email:'unknown',password:config.demoLoginPassword},{email:config.demoLoginId,password:''}]){
   const r=await app.inject({method:'POST',url:'/v1/auth/login',headers:origin,payload});
   assert.equal(r.statusCode,401,JSON.stringify(payload));
   assert.equal(r.json().error.code,'UNAUTHENTICATED');
  }
  assert.equal(Number((await pool.query('SELECT count(*) FROM demo_workspaces')).rows[0].count),before,'失敗したログインはworkspaceを作らない');
  assert.equal((await app.inject({method:'POST',url:'/v1/auth/login',headers:{origin:'https://evil.test'},payload:{email:config.demoLoginId,password:config.demoLoginPassword}})).statusCode,403,'Origin不一致は403');
 }finally{await app.close();}
});

test('既存のデモ環境があるときは、その環境の利用者としてログインする',async()=>{
 const app=await buildApp();
 try{
  const started=await app.inject({method:'POST',url:'/v1/demo/start',headers:origin,payload:{}});
  assert.equal(started.statusCode,200);const workspace=started.json().user.workspace_id;workspaces.push(workspace);
  const jar=cookies(started);
  const login=await app.inject({method:'POST',url:'/v1/auth/login',headers:{...origin,cookie:'exw_demo='+jar.exw_demo},payload:{email:config.demoLoginId,password:config.demoLoginPassword}});
  assert.equal(login.statusCode,200);
  assert.equal(login.json().user.workspace_id,workspace,'新しい環境を作らず、cookieが指す環境に入る');
  // The display email of the sample user still works as the sign-in identifier.
  const byEmail=await app.inject({method:'POST',url:'/v1/auth/login',headers:{...origin,cookie:'exw_demo='+jar.exw_demo},payload:{email:'haruka@example.test',password:config.demoLoginPassword}});
  assert.equal(byEmail.statusCode,200);assert.equal(byEmail.json().user.workspace_id,workspace);
  assert.equal((await app.inject({method:'POST',url:'/v1/auth/login',headers:{...origin,cookie:'exw_demo='+jar.exw_demo},payload:{email:'haruka@example.test',password:'wrong-password'}})).statusCode,401);
 }finally{await app.close();}
});
