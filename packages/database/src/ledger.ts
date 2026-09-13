import { randomUUID } from 'node:crypto';
import { type Tx } from './index.ts';
import { ensure } from '../../domain/src/index.ts';
export type AccountKind='external'|'available'|'held'|'unsettled'|'payout_held'|'refund_held'|'fees';
export interface Account {id:string;owner_id:string;kind:AccountKind;balance:string;normal_side:'debit'|'credit'}
export async function account(tx:Tx,owner:string,kind:AccountKind):Promise<Account> {
 await tx.db.query(`INSERT INTO ledger_accounts(id,workspace_id,generation,owner_id,kind,normal_side) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id,generation,owner_id,kind) DO NOTHING`,[randomUUID(),tx.ctx.workspace,tx.ctx.generation,owner,kind,kind==='external'?'debit':'credit']);
 return (await tx.db.query<Account>('SELECT * FROM ledger_accounts WHERE workspace_id=$1 AND generation=$2 AND owner_id=$3 AND kind=$4',[tx.ctx.workspace,tx.ctx.generation,owner,kind])).rows[0];
}
export type Line={owner:string;kind:AccountKind;side:'debit'|'credit';amount:bigint};
export async function journal(tx:Tx,event:string,description:string,lines:Line[],reference?:string) {
 const valid=lines.filter(l=>l.amount>0n); ensure(valid.length>=2); ensure(valid.reduce((s,l)=>s+(l.side==='debit'?l.amount:-l.amount),0n)===0n,'INVALID_REQUEST','仕訳の借貸が一致しません。');
 const accounts:Account[]=[];for(const l of valid)accounts.push(await account(tx,l.owner,l.kind));
 const ids=[...new Set(accounts.map(a=>a.id))].sort();
 const locked=(await tx.db.query<Account>('SELECT * FROM ledger_accounts WHERE workspace_id=$1 AND generation=$2 AND id=ANY($3) ORDER BY id FOR UPDATE',[tx.ctx.workspace,tx.ctx.generation,ids])).rows;
 const deltas=new Map<string,bigint>();valid.forEach((l,i)=>deltas.set(accounts[i].id,(deltas.get(accounts[i].id)??0n)+(l.side===accounts[i].normal_side?l.amount:-l.amount)));
 for(const a of locked) ensure(BigInt(a.balance)+(deltas.get(a.id)??0n)>=0n,'INSUFFICIENT_FUNDS','利用可能残高が不足しています。',409);
 const id=randomUUID();await tx.db.query('INSERT INTO journal_entries(id,workspace_id,generation,business_event,description,reference_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,tx.ctx.workspace,tx.ctx.generation,event,description,reference??null,tx.now()]);
 for(let i=0;i<valid.length;i++) await tx.db.query('INSERT INTO journal_lines(workspace_id,generation,journal_id,account_id,side,amount) VALUES($1,$2,$3,$4,$5,$6)',[tx.ctx.workspace,tx.ctx.generation,id,accounts[i].id,valid[i].side,String(valid[i].amount)]);
 for(const [a,delta] of deltas) await tx.db.query('UPDATE ledger_accounts SET balance=balance+$4 WHERE workspace_id=$1 AND generation=$2 AND id=$3',[tx.ctx.workspace,tx.ctx.generation,a,String(delta)]);
 return id;
}
export const debit=(owner:string,kind:AccountKind,n:bigint):Line=>({owner,kind,amount:n,side:'debit'});
export const credit=(owner:string,kind:AccountKind,n:bigint):Line=>({owner,kind,amount:n,side:'credit'});
export async function balances(tx:Tx,owner:string) {
 const rows=(await tx.db.query<Account>('SELECT * FROM ledger_accounts WHERE workspace_id=$1 AND generation=$2 AND owner_id=$3',[tx.ctx.workspace,tx.ctx.generation,owner])).rows;
 return {currency:'JPY',available:'0',held:'0',unsettled:'0',payout_held:'0',refund_held:'0',...Object.fromEntries(rows.map(a=>[a.kind,a.balance]))};
}
export async function reconciliation(tx:Tx) {
 const params=[tx.ctx.workspace,tx.ctx.generation];
 const accounts=(await tx.db.query(`SELECT a.id,a.owner_id,a.kind,a.balance::text,coalesce(sum(CASE WHEN l.side=a.normal_side THEN l.amount ELSE -l.amount END),0)::text AS recalculated FROM ledger_accounts a LEFT JOIN journal_lines l ON (l.workspace_id,l.generation,l.account_id)=(a.workspace_id,a.generation,a.id) WHERE a.workspace_id=$1 AND a.generation=$2 GROUP BY a.id,a.owner_id,a.kind,a.balance`,params)).rows;
 const journals=(await tx.db.query(`SELECT e.id,e.business_event,e.description,coalesce(sum(CASE l.side WHEN 'debit' THEN l.amount ELSE -l.amount END),0)::text AS difference,count(l.id)::integer AS lines FROM journal_entries e LEFT JOIN journal_lines l ON (e.workspace_id,e.generation,e.id)=(l.workspace_id,l.generation,l.journal_id) WHERE e.workspace_id=$1 AND e.generation=$2 GROUP BY e.id,e.business_event,e.description`,params)).rows;
 const business=await businessReconciliation(tx);
 return {currency:'JPY',ok:accounts.every(a=>a.balance===a.recalculated)&&journals.every(j=>j.difference==='0'&&j.lines>=2)&&business.every(c=>c.ok),accounts,journals,business};
}

/** Independent read model: compare financial records, reservations and journal amounts. */
async function businessReconciliation(tx:Tx) {
 const checks:{resource_id:string;rule:string;expected:string;actual:string;ok:boolean}[]=[];
 const check=(id:string,rule:string,expected:bigint,actual:bigint)=>checks.push({resource_id:id,rule,expected:String(expected),actual:String(actual),ok:expected===actual});
 const entries=(await tx.db.query(`SELECT e.business_event,e.reference_id,sum(l.amount) FILTER(WHERE l.side='debit')::text AS total FROM journal_entries e JOIN journal_lines l ON (l.workspace_id,l.generation,l.journal_id)=(e.workspace_id,e.generation,e.id) WHERE e.workspace_id=$1 AND e.generation=$2 GROUP BY e.business_event,e.reference_id`,[tx.ctx.workspace,tx.ctx.generation])).rows;
 const booked=(event:string)=>BigInt(entries.find(e=>e.business_event===event)?.total??0);
 const auths=await tx.rows('authorizations'),caps=await tx.rows('captures'),refunds=await tx.rows('refunds'),lots=await tx.rows('settlement_lots'),payouts=await tx.rows('payouts');
 const sum=(rows:{amount:string}[])=>rows.reduce((n,r)=>n+BigInt(r.amount),0n);
 for(const r of await tx.rows('topups'))check(r.id,'topup.journal',r.status==='succeeded'?BigInt(r.amount):0n,booked((r.data.sample?'seed:':'topup:')+r.id));
 for(const r of await tx.rows('transfers'))check(r.id,'transfer.journal',BigInt(r.amount),booked('transfer:'+r.id));
 for(const a of auths){
  const captures=caps.filter(c=>c.parent_id===a.id);
  check(a.id,'authorization.captured',sum(captures.filter(c=>c.status==='succeeded')),BigInt(a.captured));
  check(a.id,'authorization.capture_reservation',sum(captures.filter(c=>c.status==='pending')),BigInt(a.reserved));
  if(a.data.source==='wallet'){
   check(a.id,'authorization.journal',BigInt(a.amount),booked('authorize:'+a.id));
   check(a.id,'authorization.released',BigInt(a.released),booked('void:'+a.id)+booked('expire:'+a.id)+captures.reduce((s,c)=>s+booked('final-release:'+c.id),0n));
  }
 }
 for(const c of caps){const rs=refunds.filter(r=>r.parent_id===c.id);
  check(c.id,'capture.journal',c.status==='succeeded'?BigInt(c.amount):0n,booked('capture:'+c.id));
  check(c.id,'capture.refunded',sum(rs.filter(r=>r.status==='succeeded')),BigInt(c.refunded));
  check(c.id,'capture.refund_reservation',sum(rs.filter(r=>r.status==='pending')),BigInt(c.reserved));
  check(c.id,'capture.settlement_lot',c.status==='succeeded'?BigInt(c.amount)-BigInt(c.data.fee):0n,sum(lots.filter(l=>l.parent_id===c.id)));
 }
 for(const r of refunds){check(r.id,'refund.reserve_journal',BigInt(r.amount),booked('refund-reserve:'+r.id));check(r.id,'refund.result_journal',r.status==='pending'?0n:BigInt(r.amount),booked((r.status==='failed'?'refund-release:':'refund:')+r.id));}
 for(const p of payouts){check(p.id,'payout.reserve_journal',BigInt(p.amount),booked('payout-reserve:'+p.id));check(p.id,'payout.result_journal',['succeeded','failed','cancelled'].includes(p.status)?BigInt(p.amount):0n,booked('payout-result:'+p.id));}
 for(const lot of lots){
  let reserved=0n,consumed=0n;
  for(const r of refunds)for(const allocation of r.data.allocations??[])if(allocation.lot===lot.id){if(r.status==='pending')reserved+=BigInt(allocation.amount);if(r.status==='succeeded')consumed+=BigInt(allocation.amount);}
  check(lot.id,'settlement.refund_reserved',reserved,BigInt(lot.reserved));
  check(lot.id,'settlement.released',consumed+booked('settlement:'+lot.id),BigInt(lot.released));
 }
 for(const o of await tx.rows('orders')){
  const as=auths.filter(a=>a.parent_id===o.id),ids=new Set(as.map(a=>a.id)),cs=caps.filter(c=>ids.has(c.parent_id!));
  check(o.id,'order.captured',sum(cs.filter(c=>c.status==='succeeded')),BigInt(o.captured));
  check(o.id,'order.refunded',cs.reduce((s,c)=>s+BigInt(c.refunded),0n),BigInt(o.refunded));
  check(o.id,'order.held',as.filter(a=>['authorized','partially_captured','pending'].includes(a.status)).reduce((s,a)=>s+BigInt(a.amount)-BigInt(a.captured)-BigInt(a.released),0n),BigInt(o.reserved));
 }
 for(const a of (await tx.db.query('SELECT * FROM ledger_accounts WHERE workspace_id=$1 AND generation=$2',[tx.ctx.workspace,tx.ctx.generation])).rows){
  let expected:bigint|undefined;
  if(a.kind==='held')expected=auths.filter(r=>r.user_id===a.owner_id&&r.data.source==='wallet').reduce((s,r)=>s+BigInt(r.amount)-BigInt(r.captured)-BigInt(r.released),0n);
  if(a.kind==='payout_held')expected=sum(payouts.filter(r=>r.data.owner===a.owner_id&&['requested','processing'].includes(r.status)));
  if(a.kind==='refund_held')expected=sum(refunds.filter(r=>r.merchant_id===a.owner_id&&r.status==='pending'));
  if(a.kind==='unsettled')expected=lots.filter(r=>r.merchant_id===a.owner_id).reduce((s,r)=>s+BigInt(r.amount)-BigInt(r.released)-BigInt(r.reserved),0n);
  if(expected!==undefined)check(a.id,'account.'+a.kind,expected,BigInt(a.balance));
 }
 return checks;
}
