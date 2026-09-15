import {randomUUID} from 'node:crypto';
import {pool,transaction,type Context,type Tx} from '../../../packages/database/src/index.ts';
import {journal,debit,credit} from '../../../packages/database/src/ledger.ts';
import {passwordHash,hash,randomToken,encrypt,newSession} from './security.ts';
import {scopes,capabilities} from '../../../packages/domain/src/index.ts';
import {config} from '../../../packages/database/src/config.ts';
export async function populate(tx:Tx) {
 const caps=Object.fromEntries(capabilities.map(c=>[c,true]));
 const user=await tx.create('users',{business_key:'consumer',owner_id:'preset',data:{name:'青山 はるか',email:'haruka@example.test',login_id:config.demoLoginId,preset:'consumer',language:'ja',timezone:'Asia/Tokyo',kyc:'verified',capabilities:caps,password_hash:passwordHash(config.demoLoginPassword||randomToken()),sample:true}});
 const friend=await tx.create('users',{owner_id:'preset',business_key:'friend',data:{name:'佐藤 りく',email:'riku@example.test',preset:'friend',language:'ja',timezone:'Asia/Tokyo',kyc:'verified',capabilities:caps,password_hash:passwordHash(randomToken()),sample:true}});
 const merchants=[];
 for(const [i,name] of ['NORTHSTAR STORE','BLUEBIRD COFFEE'].entries()){
  const merchant=await tx.create('merchants',{data:{name,display_name:name,contact:'support@example.test',logo:i?'☕':'N',review:'approved',capabilities:caps,sample:true,return_urls:[`${config.storeUrl}/return`],cancel_urls:[`${config.storeUrl}/cancel`]}});merchants.push(merchant);
  await tx.create('merchant_applications',{parent_id:merchant.id,merchant_id:merchant.id,status:'approved',data:{reason:'サンプル審査'}});
  for(const role of (i===0?['owner','developer','finance','support','read_only']:['owner'])){
   const staff=await tx.create('users',{owner_id:'preset',business_key:`merchant${i+1}_${role}`,data:{name:`${name} / ${role}`,preset:`merchant${i+1}_${role}`,language:'ja',timezone:'Asia/Tokyo',capabilities:caps,password_hash:passwordHash(randomToken()),sample:true}});
   await tx.create('merchant_members',{parent_id:merchant.id,user_id:staff.id,merchant_id:merchant.id,data:{role}});
  }
  await tx.create('wallets',{merchant_id:merchant.id,data:{currency:'JPY'}});
 }
 await tx.create('users',{owner_id:'preset',business_key:'admin',data:{name:'運営デモ担当',preset:'admin',admin:true,language:'ja',timezone:'Asia/Tokyo',capabilities:caps,password_hash:passwordHash(randomToken()),sample:true}});
 for(const u of [user,friend]){
  await tx.create('wallets',{user_id:u.id,data:{currency:'JPY'}});
  await tx.create('payment_methods',{user_id:u.id,status:'active',data:{type:'card',label:'デモ Visa',brand:'Visa',last4:'4242',expires:'2030-12',provider_token:'mock_card_'+randomUUID(),default:true}});
  await tx.create('payment_methods',{user_id:u.id,status:'active',data:{type:'bank',label:'デモ銀行 普通口座',last4:'0123',provider_token:'mock_bank_'+randomUUID()}});
 }
 for(const [u,n] of [[user,30000n],[friend,10000n]] as const){const top=await tx.create('topups',{user_id:u.id,amount:String(n),status:'succeeded',data:{sample:true}});await journal(tx,'seed:'+top.id,'サンプル初期チャージ',[debit('platform','external',n),credit(u.id,'available',n)],top.id);}
 await tx.notify(user.id,'ExPressへようこそ','これは隔離されたデモです。初期残高・人物はサンプルです。実際のお金は動きません。');
 const secret=randomToken();const credential=await tx.create('credentials',{merchant_id:merchants[0].id,data:{name:'サンプルEC専用',client_id:'exw_'+randomUUID(),secret_hash:hash(secret),scopes:[...scopes],internal_store:true}});
 const whSecret=randomToken();const endpoint=await tx.create('webhook_endpoints',{merchant_id:merchants[0].id,data:{url:`${config.storeUrl}/webhooks/express-wallet`,events:['*'],secret_encrypted:encrypt(whSecret),internal_store:true}});
 const handoff=randomToken(); await tx.create('store_handoffs',{user_id:user.id,merchant_id:merchants[0].id,status:'available',data:{claim_hash:hash(handoff),expires_at:new Date(Date.now()+300000).toISOString(),credential_id:credential.id,client_id:credential.data.client_id,store_secret:encrypt(secret),webhook_secret:encrypt(whSecret),endpoint_id:endpoint.id}});
 return {user,merchants,store_handoff:handoff};
}
export async function createWorkspace(workerPaused=false) {
 const id=randomUUID();await pool.query('INSERT INTO demo_workspaces(id,settings) VALUES($1,$2)',[id,{fee_bps:'300',fee_fixed:'30',limit:'10000000',subscription_limit:'100000',risk_version:'demo-v1',worker_paused:workerPaused}]);await pool.query('INSERT INTO workspace_generations VALUES($1,1)',[id]);
 const ctx:Context={workspace:id,generation:1,actor:'system',role:'system',scopes:[],requestId:randomUUID()};
 return transaction(ctx,async tx=>{const seed=await populate(tx);const session=await newSession(tx,seed.user);const ownerToken=randomToken();await tx.db.query('INSERT INTO demo_access VALUES($1,$2,$3)',[hash(ownerToken),id,new Date(Date.now()+7*86400000)]);return {...session,owner_token:ownerToken,workspace:id,generation:1,store_handoff:seed.store_handoff};});
}
