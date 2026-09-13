import {writeFileSync,mkdirSync} from 'node:fs';
import {buildApp} from '../apps/api/src/app.ts';
import {pool} from '../packages/database/src/index.ts';
const app=await buildApp();const spec=app.swagger();mkdirSync('packages/contracts/openapi',{recursive:true});writeFileSync('packages/contracts/openapi/exw-v1.json',JSON.stringify(spec,null,2)+'\n');
const rows=['# APIエンドポイント一覧','', 'Fastifyの登録ルートから `pnpm run openapi` で生成。入力・応答schemaと認証条件の詳細は [OpenAPI](../packages/contracts/openapi/exw-v1.json) を参照。','', '|Method|Path|内容・条件|','|---|---|---|'];
for(const [path,methods] of Object.entries(spec.paths??{}))for(const [method,operation] of Object.entries(methods??{})){if(!['get','post','patch','delete','put'].includes(method))continue;const op=operation as any;rows.push(`|${method.toUpperCase()}|\`${path}\`|${[op.summary,op.description].filter(Boolean).join(' ').replaceAll('|','\\|')}|`);}
mkdirSync('docs',{recursive:true});writeFileSync('docs/api-endpoints.md',rows.join('\n')+'\n');await app.close();await pool.end();console.log('OpenAPI and endpoint reference generated from registered Fastify routes.');
