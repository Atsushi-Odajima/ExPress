export class ExPressCheckout {
 static allowedOrigins=['http://localhost:3000'];
 static configure(origins:string[]) {this.allowedOrigins=origins.map(x=>new URL(x).origin);}
 static validate(checkoutUrl:string){const u=new URL(checkoutUrl);if(!this.allowedOrigins.includes(u.origin)||!/^\/checkout\/[a-z0-9-]+$/i.test(u.pathname)||u.username||u.password)throw Error('Untrusted ExPress checkout URL');return u;}
 static redirect({checkoutUrl}:{checkoutUrl:string}){window.location.assign(this.validate(checkoutUrl).href);}
 static popup({checkoutUrl,nonce,onReturn}:{checkoutUrl:string;nonce:string;onReturn:()=>void}) {
  const url=this.validate(checkoutUrl);const popup=window.open(url.href,'exw_'+nonce,'width=480,height=760');if(!popup){this.redirect({checkoutUrl});return ()=>{};}
  const listener=(event:MessageEvent)=>{if(event.origin!==url.origin||event.source!==popup||event.data?.nonce!==nonce||event.data?.type!=='exw.checkout.return')return;onReturn();cleanup();};
  const cleanup=()=>window.removeEventListener('message',listener);window.addEventListener('message',listener);return cleanup;
 }
}
