import {test} from 'node:test';import assert from 'node:assert/strict';
import {ExPressCheckout} from '../packages/sdk-browser/src/index.ts';
test('ブラウザSDKは許可origin/source/nonceを検証し、popupブロック時はredirectする',()=>{
 const origin='https://checkout.example.test',url=origin+'/checkout/abc-123',popup={},listeners=new Set<(e:any)=>void>(),redirects:string[]=[];let blocked=false,returns=0;
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{assign:(u:string)=>redirects.push(u)},open:()=>blocked?null:popup,addEventListener:(_name:string,fn:any)=>listeners.add(fn),removeEventListener:(_name:string,fn:any)=>listeners.delete(fn)}});
 try{ExPressCheckout.configure([origin]);for(const bad of ['https://evil.example/checkout/abc',origin+'/wallet',origin+'/checkout/../../admin','javascript:alert(1)'])assert.throws(()=>ExPressCheckout.redirect({checkoutUrl:bad}));
 ExPressCheckout.popup({checkoutUrl:url,nonce:'unique-nonce',onReturn:()=>returns++});const send=(e:any)=>listeners.forEach(fn=>fn({origin,source:popup,data:{type:'exw.checkout.return',nonce:'unique-nonce'},...e}));send({origin:'https://evil.example'});send({source:{}});send({data:{type:'exw.checkout.return',nonce:'wrong'}});assert.equal(returns,0);send({});send({});assert.equal(returns,1);assert.equal(listeners.size,0);
 blocked=true;ExPressCheckout.popup({checkoutUrl:url,nonce:'fallback',onReturn:()=>returns++});assert.deepEqual(redirects,[url]);assert.equal(returns,1);
 }finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});
