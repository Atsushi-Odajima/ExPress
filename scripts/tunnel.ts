import {spawn,spawnSync,type ChildProcess} from 'node:child_process';
import {copyFileSync,existsSync,readFileSync,unlinkSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import QRCode from 'qrcode';
/**
 * Publishes the local ExPress demo to the internet through Cloudflare quick tunnels.
 * No Cloudflare account or token is needed: `cloudflared tunnel --url` hands out a random
 * https://*.trycloudflare.com address per tunnel.
 *
 *   1. Opens two tunnels: Portal (which also proxies /api to the API) and the sample store.
 *   2. Writes the public URLs into .env (the original is kept in .env.tunnel-backup), rebuilds so
 *      the Portal embeds them, and starts the production services (pnpm run start).
 *   3. Prints the Portal URL and a QR code for a smartphone. Ctrl+C stops everything and restores .env.
 *
 * Prerequisites: cloudflared on PATH (winget install Cloudflare.cloudflared / brew install cloudflared),
 * PostgreSQL running (docker compose up -d) with migrations applied, pnpm install done.
 * Flags: --skip-build (reuse the previous build), --skip-start (only open tunnels and write .env),
 *        --keep-env (do not restore .env on exit).
 */
const root=resolve(fileURLToPath(import.meta.url),'../..');
const flags=new Set(process.argv.slice(2));
const envPath=resolve(root,'.env'),backupPath=resolve(root,'.env.tunnel-backup'),examplePath=resolve(root,'.env.example');
const bin=process.env.CLOUDFLARED??'cloudflared';
function parseEnv(text:string){const out:Record<string,string>={};for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m&&!line.trim().startsWith('#'))out[m[1]]=m[2].replace(/^["'](.*)["']$/,'$1');}return out;}
function withUpdates(text:string,updates:Record<string,string>){const lines=text.split(/\r?\n/);const seen=new Set<string>();const result=lines.map(line=>{const m=line.match(/^\s*([A-Z0-9_]+)\s*=/);if(m&&updates[m[1]]!==undefined){seen.add(m[1]);return `${m[1]}=${updates[m[1]]}`;}return line;});for(const [k,v] of Object.entries(updates))if(!seen.has(k))result.push(`${k}=${v}`);return result.join('\n').replace(/\n*$/,'\n');}
const original=existsSync(envPath)?readFileSync(envPath,'utf8'):readFileSync(examplePath,'utf8');
const current=parseEnv(original);
const ports={portal:Number(current.PORTAL_PORT??3000),api:Number(current.API_PORT??4000),store:Number(current.STORE_PORT??3001)};
const tunnels:ChildProcess[]=[];let services:ChildProcess|undefined;let closing=false;
function openTunnel(name:string,port:number):Promise<string>{
 return new Promise((resolvePromise,reject)=>{
  const child=spawn(bin,['tunnel','--url',`http://localhost:${port}`,'--no-autoupdate'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});tunnels.push(child);
  let buffer='';const timer=setTimeout(()=>reject(Error(`${name}: cloudflared did not report a URL within 60s`)),60000);
  const onData=(chunk:Buffer)=>{buffer+=chunk.toString();const m=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(m){clearTimeout(timer);resolvePromise(m[0]);}};
  child.stdout?.on('data',onData);child.stderr?.on('data',onData);
  child.on('error',e=>{clearTimeout(timer);reject(Error(`${name}: cannot start ${bin} (${e.message}). Install cloudflared and make sure it is on PATH.`));});
  child.on('exit',code=>{if(!closing){clearTimeout(timer);reject(Error(`${name}: cloudflared exited with code ${code}`));}});
 });
}
function shutdown(code=0){
 if(closing)return;closing=true;
 services?.kill();for(const t of tunnels)t.kill();
 if(!flags.has('--keep-env')&&existsSync(backupPath)){copyFileSync(backupPath,envPath);unlinkSync(backupPath);console.log('\n.env restored from .env.tunnel-backup');}
 setTimeout(()=>process.exit(code),500);
}
process.on('SIGINT',()=>shutdown(0));process.on('SIGTERM',()=>shutdown(0));
try{
 console.log('Opening Cloudflare quick tunnels (no account needed)…');
 const portal=await openTunnel('portal',ports.portal);console.log(`Portal + API  ${portal}  ->  http://localhost:${ports.portal}`);
 const store=await openTunnel('store',ports.store);console.log(`NORTHSTAR EC  ${store}  ->  http://localhost:${ports.store}`);
 if(!existsSync(backupPath)&&existsSync(envPath))copyFileSync(envPath,backupPath);
 const updates={PORTAL_URL:portal,API_URL:portal+'/api',STORE_URL:store,API_INTERNAL_URL:`http://127.0.0.1:${ports.api}`,WEBHOOK_ALLOWLIST:`${store}/webhooks/express-wallet`,DEMO_MODE:'local'};
 writeFileSync(envPath,withUpdates(original,updates));
 const env={...process.env,...parseEnv(readFileSync(envPath,'utf8'))};
 if(!flags.has('--skip-build')){console.log('Building with the public URLs embedded (this takes a minute)…');const built=spawnSync(process.execPath,['--import','tsx','scripts/build.ts'],{cwd:root,env,stdio:'inherit',windowsHide:true});if(built.status!==0)throw Error('Build failed');}
 if(!flags.has('--skip-start')){services=spawn(process.execPath,['--import','tsx','scripts/start.ts'],{cwd:root,env,stdio:'inherit',windowsHide:true});services.on('exit',code=>{if(!closing){console.error('ExPress services exited:',code);shutdown(code??1);}});}
 console.log('\n'+await QRCode.toString(portal+'/wallet',{type:'terminal',small:true}));
 console.log(`Open on your phone:  ${portal}/wallet`);
 console.log(`Sample store:        ${store}`);
 console.log(`API docs:            ${portal}/docs`);
 console.log('Demo only, no real money moves. Press Ctrl+C to stop the tunnels and restore .env.');
 if(flags.has('--skip-start')&&flags.has('--skip-build'))shutdown(0);
}catch(e:any){console.error(e.message);shutdown(1);}
