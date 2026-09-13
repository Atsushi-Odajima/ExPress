export class DomainError extends Error {
  constructor(public code: string, message = code, public status = 400) { super(message); }
}
export function ensure(condition: unknown, code = 'INVALID_REQUEST', message?: string, status = 400): asserts condition {
  if (!condition) throw new DomainError(code, message, status);
}
export type Money = { currency: 'JPY'; value: string };
export function amount(input: unknown, max = 10000000n): bigint {
  const m = input as Money;
  ensure(m && m.currency === 'JPY' && typeof m.value === 'string' && /^[1-9]\d{0,12}$/.test(m.value), 'INVALID_REQUEST', 'JPYの正の整数文字列を指定してください。');
  const n = BigInt(m.value); ensure(n <= max, 'INVALID_REQUEST', '取引上限を超えています。'); return n;
}
export const money = (n: bigint | string): Money => ({currency:'JPY', value:String(n)});
export const fee = (n: bigint, bps = 300n, fixed = 30n) => n * bps / 10000n + fixed;
export const min = (a: bigint,b: bigint) => a < b ? a : b;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export function nextMonth(date: Date, anchorDay = date.getUTCDate()): Date {
  const d = new Date(date); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+1);
  const end = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(anchorDay,end)); return d;
}
export function csv(rows: Record<string, unknown>[]): string {
  const keys = [...new Set(rows.flatMap(r=>Object.keys(r)))];
  const cell = (v:unknown) => { let s=typeof v==='object'?JSON.stringify(v):String(v??''); if (/^[=+\-@\t\r\n]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; };
  return '\uFEFF'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
}
export const capabilities = ['can_pay','can_receive','can_payout','can_refund','can_capture'] as const;
export const scopes = ['orders:read','orders:write','payments:read','payments:write','refunds:write','webhooks:manage','balances:read','payouts:write','subscriptions:write'] as const;
export const events = ['checkout.approved','authorization.created','authorization.failed','authorization.voided','authorization.expired','capture.succeeded','capture.failed','refund.pending','refund.succeeded','refund.failed','payout.succeeded','payout.failed','subscription.activated','subscription.payment_succeeded','subscription.payment_failed','subscription.cancelled','dispute.opened','dispute.updated','account.restricted'] as const;
