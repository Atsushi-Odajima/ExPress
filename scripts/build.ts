import {spawnSync} from 'node:child_process';
// Load the monorepo .env before Next embeds its public API/store origins.
import {root} from '../packages/database/src/config.ts';
for(const args of [['node_modules/typescript/bin/tsc','-p','tsconfig.server.json'],['node_modules/next/dist/bin/next','build','apps/portal','--webpack']]){
 const result=spawnSync(process.execPath,args,{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
