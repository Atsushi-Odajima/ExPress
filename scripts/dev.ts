import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {config,root} from '../packages/database/src/config.ts';
const children=[['--import','tsx','apps/api/src/index.ts'],['--import','tsx','apps/worker/src/index.ts'],['--import','tsx','apps/demo-store/src/index.ts'],['node_modules/next/dist/bin/next','dev','apps/portal','--webpack','--port',String(config.portalPort)]];
const processes=children.filter(args=>(!process.argv.includes('--backend')||args[0]==='--import')&&(!process.argv.includes('--portal')||args[0]!=='--import')).map(args=>spawn(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true}));let closing=false;
writeFileSync(root+'/.local/dev-processes.json',JSON.stringify({root,parent:process.pid,children:processes.map(p=>p.pid)}));
function stop(){if(closing)return;closing=true;for(const child of processes)child.kill();}process.on('SIGINT',stop);process.on('SIGTERM',stop);for(const child of processes)child.on('exit',code=>{if(!closing&&code){console.error('An ExPress service exited:',code);stop();process.exitCode=code;}});
