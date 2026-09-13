import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
for(const name of ['domain','database','contracts','sdk-server','sdk-browser','ui','testkit']){
 const dir=`packages/${name}`;mkdirSync(`${dir}/src`,{recursive:true});const path=`${dir}/package.json`;
 if(!existsSync(path))writeFileSync(path,JSON.stringify({name:`@exw/${name}`,version:'0.1.0',private:true,type:'module',exports:'./src/index.ts'},null,2)+'\n');
}
for(const name of ['api','worker','demo-store','portal']){
 const dir=`apps/${name}`;mkdirSync(dir,{recursive:true});const path=`${dir}/package.json`;
 if(!existsSync(path))writeFileSync(path,JSON.stringify({name:`@exw/${name}`,version:'0.1.0',private:true,type:'module',scripts:name==='portal'?{dev:'next dev --webpack',build:'next build --webpack',start:'next start'}:{dev:'tsx src/index.ts'},...(name==='portal'?{dependencies:{next:'16.3.4',react:'19.3.0','react-dom':'19.3.0'}}:{})},null,2)+'\n');
}
