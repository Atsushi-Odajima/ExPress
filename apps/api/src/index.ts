import {buildApp} from './app.ts';
import {config} from '../../../packages/database/src/config.ts';
import {pool} from '../../../packages/database/src/index.ts';
const app=await buildApp();await app.listen({host:config.listenHost,port:config.apiPort});console.log(`ExPress API ${config.apiUrl} /docs`);
let running=true;
// WORKER_IN_API=true runs the job/outbox/webhook loop inside this process for hosts without a free worker tier. The default stays a separate worker process (apps/worker).
if(config.workerInApi){const {tick}=await import('../../worker/src/worker.ts');console.log('ExPress worker loop running inside the API process (WORKER_IN_API=true)');(async()=>{while(running){try{await tick();}catch(e:any){console.error('Worker tick failed',e.code??e.message);}await new Promise(r=>setTimeout(r,750));}})();}
async function stop(){running=false;await app.close();await pool.end();process.exit(0);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
