import {tick} from './worker.ts';
import {pool} from '../../../packages/database/src/index.ts';
let running=true;process.on('SIGTERM',()=>{running=false;});process.on('SIGINT',()=>{running=false;});
console.log('ExPress worker started');while(running){try{await tick();}catch(e:any){console.error('Worker tick failed',e.code??e.message);}await new Promise(r=>setTimeout(r,750));}await pool.end();
