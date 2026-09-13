'use client';
import {useSyncExternalStore} from 'react';
import {english} from './messages';
let language:'ja'|'en'='ja';const listeners=new Set<()=>void>();
export function setLanguage(value:string){language=value==='en'?'en':'ja';if(typeof window!=='undefined')localStorage.setItem('exw-language',language);listeners.forEach(listener=>listener());}
export function useLanguage(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},()=>language,()=>'ja');}
/** Only product copy is translated; user-entered notes and names remain verbatim. */
export function tr(text:string):string {if(language==='ja')return text;const key=text.trim().replace(/\s+/g,' ');const value=english[key];return value===undefined?text:text.replace(text.trim(),value);}
