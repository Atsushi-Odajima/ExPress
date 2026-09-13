import {buildApp} from './app.ts';
import {config} from '../../../packages/database/src/config.ts';
import {pool} from '../../../packages/database/src/index.ts';
const app=await buildApp();await app.listen({host:'127.0.0.1',port:config.apiPort});console.log(`ExPress API ${config.apiUrl} /docs`);
async function stop(){await app.close();await pool.end();process.exit(0);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
