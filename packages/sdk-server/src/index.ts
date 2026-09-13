import {createHmac,timingSafeEqual} from 'node:crypto';
import type {OrderInput,CheckoutInput,CaptureInput,RefundInput,Order,OrderDetails,CheckoutSession,Authorization,Capture,Refund} from '../../contracts/src/types.ts';
export type {Money,OrderInput,CheckoutInput,CaptureInput,RefundInput,Order,OrderDetails,CheckoutSession,Authorization,Capture,Refund} from '../../contracts/src/types.ts';
export class ExPressError extends Error {constructor(public code:string,message:string,public status:number,public requestId?:string){super(message);}}
export interface ClientOptions {baseUrl:string;clientId:string;clientSecret:string;timeoutMs?:number;}
export class ExPressClient {
 private token='';private expires=0;
 constructor(private options:ClientOptions){}
 async accessToken() {if(this.token&&Date.now()<this.expires)return this.token;const r=await fetch(this.options.baseUrl+'/v1/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:this.options.clientId,client_secret:this.options.clientSecret}),signal:AbortSignal.timeout(this.options.timeoutMs??5000)});const b=await r.json();if(!r.ok)throw new ExPressError(b.error?.code??'UNAUTHENTICATED',b.error?.message??'Token request failed',r.status,b.error?.request_id);this.token=b.access_token;this.expires=Date.now()+(b.expires_in-30)*1000;return this.token;}
 async request<T=any>(method:string,path:string,body?:unknown,key?:string):Promise<T> {
  if(!/^\/v1\/[a-z0-9/_-]+$/i.test(path))throw new Error('Invalid ExPress API path');
  for(let tries=0;;tries++){
   let response:Response;
   try{response=await fetch(this.options.baseUrl+path,{method,headers:{Authorization:'Bearer '+await this.accessToken(),'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(this.options.timeoutMs??5000)});}catch(e){if(tries<2&&(method==='GET'||key)){await new Promise(r=>setTimeout(r,100*2**tries));continue;}throw e;}
   const b=await response.json();if(response.ok)return b;
   if(response.status===401&&tries===0){this.expires=0;continue;}
   if([429,502,503,504].includes(response.status)&&tries<2&&(method==='GET'||key)){await new Promise(r=>setTimeout(r,Math.min(2000,Number(response.headers.get('retry-after')??'0.2')*1000)));continue;}
   throw new ExPressError(b.error?.code??'HTTP_ERROR',b.error?.message??'ExPress API failed',response.status,b.error?.request_id??response.headers.get('x-request-id')??undefined);
  }
 }
 createOrder(input:OrderInput,key:string){return this.request<Order>('POST','/v1/orders',input,key);}
 createCheckout(input:CheckoutInput,key:string){return this.request<CheckoutSession&{checkout_url:string}>('POST','/v1/checkout-sessions',input,key);}
 getOrder(id:string){return this.request<OrderDetails>('GET','/v1/orders/'+encodeURIComponent(id));}
 getCheckout(id:string){return this.request<CheckoutSession>('GET','/v1/checkout-sessions/'+encodeURIComponent(id));}
 getAuthorization(id:string){return this.request<Authorization>('GET','/v1/authorizations/'+encodeURIComponent(id));}
 getCapture(id:string){return this.request<Capture>('GET','/v1/captures/'+encodeURIComponent(id));}
 getRefund(id:string){return this.request<Refund>('GET','/v1/refunds/'+encodeURIComponent(id));}
 capture(id:string,input:CaptureInput,key:string){return this.request<Capture>('POST',`/v1/authorizations/${encodeURIComponent(id)}/capture`,input,key);}
 void(id:string,key:string){return this.request<Authorization>('POST',`/v1/authorizations/${encodeURIComponent(id)}/void`,{},key);}
 refund(id:string,input:RefundInput,key:string){return this.request<Refund>('POST',`/v1/captures/${encodeURIComponent(id)}/refunds`,input,key);}
}
export function signWebhook(rawBody:string,secret:string|string[],timestamp=Math.floor(Date.now()/1000)) {return `t=${timestamp},`+[...new Set(Array.isArray(secret)?secret:[secret])].map(key=>`v1=${createHmac('sha256',key).update(timestamp+'.'+rawBody).digest('hex')}`).join(',');}
/** Keep the previous key only until the receiver's configured rotation deadline. */
export function verifyWebhook(rawBody:string|Buffer,signature:string,secrets:string[],now=Date.now()):boolean {
 if(!signature||signature.length>512)return false;const parts=signature.split(',');const timestamps=parts.filter(p=>p.startsWith('t='));const t=timestamps[0]?.slice(2);const signatures=parts.filter(p=>p.startsWith('v1=')).map(p=>p.slice(3));
 if(timestamps.length!==1||!t||!/^\d+$/.test(t)||!signatures.length||signatures.some(s=>!/^[a-f0-9]{64}$/.test(s))||Math.abs(now/1000-Number(t))>300)return false;
 return secrets.some(secret=>{const expected=createHmac('sha256',secret).update(t+'.').update(rawBody).digest();return signatures.some(sig=>timingSafeEqual(expected,Buffer.from(sig,'hex')));});
}
