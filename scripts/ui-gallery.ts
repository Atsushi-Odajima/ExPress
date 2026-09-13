import {chromium,devices,type Page,type BrowserContext} from '@playwright/test';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {config,root} from '../packages/database/src/config.ts';
/**
 * Captures real screens of the running ExPress services (Portal, NORTHSTAR store) at
 * smartphone width and a few at desktop width. Output: .local/gallery/*.jpg + manifest.json.
 * The four services must be running (pnpm run start or pnpm run dev). Nothing is mocked:
 * every screen is produced through the ordinary API flows of a fresh demo workspace.
 */
const API=config.apiUrl,STORE=config.storeUrl,PORTAL=config.portalUrl;
const out=resolve(root,'.local/gallery');rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const shots:{file:string;title:string;note:string;width:'mobile'|'desktop';group:string}[]=[];
let n=0;
async function shot(page:Page,group:string,title:string,note:string,width:'mobile'|'desktop',fullPage=true){
 const file=`${String(++n).padStart(2,'0')}-${group}-${title.replace(/[^\p{L}\p{N}]+/gu,'-').slice(0,40)}.jpg`;
 await page.waitForTimeout(350);
 await page.screenshot({path:resolve(out,file),type:'jpeg',quality:76,fullPage});
 shots.push({file,title,note,width,group});console.log('shot',file);
}
async function attempt(label:string,fn:()=>Promise<void>){try{await fn();}catch(e:any){console.error('SKIP',label,e.message?.split('\n')[0]);}}
const waitText=(page:Page,text:string,timeout=20000)=>page.locator('main').getByText(text,{exact:false}).first().waitFor({state:'visible',timeout});
const waitHeading=(page:Page,name:string,timeout=20000)=>page.getByRole('heading',{name}).first().waitFor({state:'visible',timeout});
async function switchPersona(page:Page,preset:string){await page.getByLabel('デモ人物を切り替え').selectOption(preset);await page.waitForFunction(v=>(document.querySelector('select[aria-label="デモ人物を切り替え"]') as HTMLSelectElement|null)?.value===v,preset,{timeout:20000});await page.waitForTimeout(400);}
async function startDemo(page:Page){await page.goto(PORTAL+'/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).click();await waitText(page,'あなたのウォレット');await page.locator('.hero-balance').filter({hasText:'30,000'}).waitFor({timeout:20000});}

const browser=await chromium.launch();
async function mobileFlow(){
 const {defaultBrowserType:_engine,...iphone}=devices['iPhone 13'];const context:BrowserContext=await browser.newContext({...iphone,deviceScaleFactor:2,locale:'ja-JP'});const page=await context.newPage();
 await attempt('welcome',async()=>{await page.goto(PORTAL+'/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).waitFor();await shot(page,'wallet','ようこそ（デモ開始前）','訪問者ごとに隔離されたサンプル環境を作成する入口。実際のお金は動きません。','mobile');});
 await startDemo(page);
 await shot(page,'wallet','ウォレットホーム','利用可能残高30,000円（サンプル初期チャージ仕訳）、保留、クイックアクション、最近の取引。','mobile');
 await attempt('menu',async()=>{await page.getByRole('button',{name:'メニュー',exact:true}).click();await page.waitForTimeout(300);await shot(page,'wallet','メニュー（サイドバー）','ホーム・取引履歴・支払手段・支払依頼・継続課金・サポート・設定と、サンプルEC・デモ操作パネルへの導線。','mobile',false);});
 await attempt('transactions',async()=>{await page.goto(PORTAL+'/wallet/transactions');await waitHeading(page,'取引履歴');await page.waitForTimeout(800);await shot(page,'wallet','取引履歴（検索・期間・CSV）','複式台帳の仕訳明細をcursorページングで表示。CSVは数式注入を無害化。','mobile');});
 await attempt('methods',async()=>{await page.goto(PORTAL+'/wallet/methods');await waitHeading(page,'支払手段');await page.waitForTimeout(500);await shot(page,'wallet','支払手段','模擬カード・模擬銀行。実カード番号は収集しない。削除は新規利用停止のみ。','mobile');});
 await attempt('settings',async()=>{await page.goto(PORTAL+'/wallet/settings');await waitHeading(page,'設定');await page.waitForTimeout(500);await shot(page,'wallet','アカウント設定','言語・タイムゾーン、模擬本人確認、利用権限、セッション操作。','mobile');});
 // Connect the sample store and build a checkout
 const s=await (await page.request.get(API+'/v1/session')).json(),ph={origin:PORTAL,'x-csrf-token':s.csrf};
 const handoff=await (await page.request.post(API+'/v1/demo/store-handoff',{headers:ph,data:{}})).json();await page.request.post(STORE+'/connect',{headers:{origin:PORTAL},data:{code:handoff.code}});
 await attempt('store',async()=>{await page.goto(STORE+'/');await waitHeading(page,'Everyday essentials');await page.waitForTimeout(500);await shot(page,'store','NORTHSTAR サンプルEC（別オリジン）','架空商品5点。価格はECサーバーが決め、ブラウザから改ざんできない。','mobile');await page.goto(STORE+'/products/headphones');await waitText(page,'Studio One');await shot(page,'store','商品詳細','「バッグに追加」からカートへ。','mobile');await page.getByRole('button',{name:'バッグに追加'}).click();await page.getByRole('spinbutton',{name:'Studio One 数量'}).fill('2');await page.getByRole('spinbutton',{name:'Studio One 数量'}).blur();await page.getByLabel('売上確定のタイミング').selectOption('shipping');await page.waitForTimeout(400);await shot(page,'store','ショッピングバッグ','数量、売上確定のタイミング（即時／出荷時）、「ExPressで支払う」。','mobile',false);});
 // The store's own button creates the ExPress order and checkout through the server SDK, then redirects to the hosted checkout.
 await attempt('checkout',async()=>{await page.getByRole('button',{name:'ExPressで支払う'}).click();await page.waitForURL(/\/checkout\//,{timeout:30000});await waitHeading(page,'お支払いの確認');await page.locator('#checkout-source').waitFor();await page.waitForTimeout(500);await shot(page,'checkout','ホスト型チェックアウト','支払先・金額・明細・支払元（ウォレット／模擬カード）を確認し、模擬追加認証にチェックして承認。','mobile');
  await page.locator('#challenge').check();await page.getByRole('button',{name:'この内容で支払いを承認'}).click();await page.getByRole('button',{name:'内容を確認',exact:true}).waitFor();await shot(page,'checkout','承認ダイアログ（事前確認）','金額・対象・結果を事前表示してから実行。失敗しても入力は残る。','mobile',false);
  await page.getByRole('button',{name:'内容を確認',exact:true}).click();await page.getByRole('button',{name:'確認して実行',exact:true}).waitFor();await shot(page,'checkout','承認ダイアログ（確認して実行）','二段階の確認。','mobile',false);
  await page.getByRole('button',{name:'確認して実行',exact:true}).click();await page.getByRole('button',{name:'店舗に戻って確認する'}).waitFor({timeout:20000});await page.waitForTimeout(400);await shot(page,'checkout','承認完了（資金確保済み）','approved=同意、authorized=資金確保。店舗に戻ってもURLだけで支払済みにはしない。','mobile');
  await page.getByRole('button',{name:'店舗に戻って確認する'}).click();await page.waitForURL(STORE+'/return');});
 await attempt('store-return',async()=>{await page.locator('main .tag').filter({hasText:'authorized'}).first().waitFor({timeout:25000});await page.waitForTimeout(600);await shot(page,'store','EC戻り画面→サーバー照会','ECサーバーがAPIで金額・通貨・加盟店・注文対応を照合。出荷時確定モードなのでオーソリ保留。','mobile');});
 await attempt('ship-refund',async()=>{page.on('dialog',d=>d.accept());await page.locator('#ship input[name=value]').fill('12000');await page.locator('#ship input[name=final]').check();await page.getByRole('button',{name:'この金額で出荷・確定'}).click();await page.locator('main .tag').filter({hasText:'partially_paid'}).first().waitFor({timeout:25000});await page.locator('.refund input[name=value]').fill('1000');await page.getByRole('button',{name:'この金額の返金を依頼'}).click();await page.locator('main .tag').filter({hasText:'partially_refunded'}).first().waitFor({timeout:25000});await page.waitForTimeout(500);await shot(page,'store','一部出荷・部分確定→部分返金後','12,000円を確定し未使用12,000円を解放、1,000円を元の支払元へ返金。発送処理は1件。','mobile');});
 await attempt('wallet-after',async()=>{await page.goto(PORTAL+'/wallet');await page.locator('.hero-balance').filter({hasText:'19,000'}).waitFor({timeout:20000});await page.waitForTimeout(400);await shot(page,'wallet','購入後のウォレット（19,000円）','30,000→24,000保留→未使用12,000解放→1,000返金。台帳から再計算した残高。','mobile');
  await page.getByRole('button',{name:'ダークモード切替'}).click();await page.waitForTimeout(400);await shot(page,'wallet','ダークモード','data-theme=darkの配色。','mobile');await page.getByRole('button',{name:'ダークモード切替'}).click();
  await page.getByRole('button',{name:'Language',exact:true}).click();await waitText(page,'Your wallet');await page.waitForTimeout(300);await shot(page,'wallet','English','製品文言のみ翻訳。利用者入力は翻訳しない。','mobile');await page.getByRole('button',{name:'Language',exact:true}).click();await waitText(page,'あなたのウォレット');});
 await attempt('demo-consumer',async()=>{await page.goto(PORTAL+'/demo');await waitHeading(page,'障害も、回復も');await page.waitForTimeout(600);await shot(page,'demo','デモ操作パネル（利用者）','16シナリオ、操作前後比較、同じ残高から2件を同時承認するパネル。','mobile');});
 await attempt('merchant',async()=>{await switchPersona(page,'merchant1_owner');await page.goto(PORTAL+'/merchant');await waitHeading(page,'加盟店ダッシュボード');await page.waitForTimeout(1200);await shot(page,'merchant','加盟店ダッシュボード','利用可能／未精算／出金中／返金中、日次売上（実データ集計）、最近の決済。','mobile');
  await page.goto(PORTAL+'/merchant/payments');await waitHeading(page,'決済を管理');await page.getByRole('button',{name:'詳細'}).first().waitFor({timeout:20000});await page.getByRole('button',{name:'詳細'}).first().click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(400);await shot(page,'merchant','決済の詳細（オーソリ・確定・返金）','部分確定・残額解放・元支払元への返金をこの画面から操作。','mobile',false);await page.getByRole('button',{name:'閉じる'}).last().click();
  await page.goto(PORTAL+'/merchant/payouts');await waitHeading(page,'出金・資金管理');await page.waitForTimeout(1000);await shot(page,'merchant','出金・精算予定','出金申請、模擬追加入金、精算待機中の未精算ロット。','mobile');
  await page.goto(PORTAL+'/merchant/subscriptions');await waitHeading(page,'継続課金');await page.waitForTimeout(600);await shot(page,'merchant','定期課金と請求周期','プラン作成、同意待ち購読、請求周期と再試行履歴。','mobile');});
 await attempt('developer',async()=>{await page.goto(PORTAL+'/developer');await waitHeading(page,'開発者ポータル');await page.waitForTimeout(800);await shot(page,'developer','開発者ポータル（APIガイド）','サーバーSDK例、連携の流れ、対話型APIドキュメントへの導線。','mobile');
  await page.getByRole('button',{name:'Playground',exact:true}).click();await page.getByLabel('HTTP method').selectOption('POST');await page.getByRole('button',{name:'実行',exact:true}).click();await waitText(page,'req_',20000);await page.waitForTimeout(500);await shot(page,'developer','API Playground（実注文＋curl例）','実APIへ送信し、request ID・latency・response、POSIX／PowerShellのcurl例を表示。','mobile');
  await page.getByRole('button',{name:'Webhook',exact:true}).click();await waitHeading(page,'署名検証の例');await page.waitForTimeout(500);await shot(page,'developer','Webhook（通知先・署名検証例・配信履歴）','鍵更新は24時間の二重署名で移行。再送はevent ID同一・delivery ID別。','mobile');});
 await attempt('read-only',async()=>{await switchPersona(page,'merchant1_read_only');await page.goto(PORTAL+'/merchant/payouts');await waitHeading(page,'この画面を利用する権限がありません');await page.waitForTimeout(300);await shot(page,'merchant','権限なし（read_only）','必要scopeを満たさないroleには操作ボタンを描画しない。','mobile');});
 await attempt('admin',async()=>{await switchPersona(page,'admin');await page.goto(PORTAL+'/admin');await waitHeading(page,'運営ダッシュボード');await page.waitForTimeout(800);await shot(page,'admin','運営ダッシュボード','結果不明・通知失敗・手動審査の件数、台帳整合性、横断検索。','mobile');
  await page.goto(PORTAL+'/admin/ledger');await waitHeading(page,'台帳・整合性');await page.waitForTimeout(800);await shot(page,'admin','台帳・整合性','借貸一致・残高再計算・業務レコード照合、注文timeline、調整仕訳と反対仕訳。','mobile');
  await page.goto(PORTAL+'/admin/accounts');await waitHeading(page,'利用者・加盟店');await page.waitForTimeout(500);await shot(page,'admin','利用者・加盟店（審査・能力別制限）','can_pay等を個別に制限し、理由を監査ログへ。','mobile');
  await page.goto(PORTAL+'/admin/jobs');await waitHeading(page,'処理・通知監視');await page.waitForTimeout(600);await shot(page,'admin','処理・通知監視','provider attempt、job、Webhook配信、outbox。失敗は理由付きで再試行・再送。','mobile');
  await page.goto(PORTAL+'/demo');await waitHeading(page,'障害も、回復も');await page.getByRole('button',{name:'模擬プロバイダー'}).click();await page.waitForTimeout(500);await shot(page,'demo','模擬プロバイダー（operation単位の障害注入）','timeout後成功・拒否・処理中維持・成功後停止をoperationごとに設定。','mobile');});
 await context.close();
}
async function desktopFlow(){
 const {defaultBrowserType:_desktopEngine,...desktop}=devices['Desktop Chrome'];const context=await browser.newContext({...desktop,viewport:{width:1280,height:800},deviceScaleFactor:1,locale:'ja-JP'});const page=await context.newPage();
 await startDemo(page);await shot(page,'desktop','ウォレットホーム（PC幅）','サイドバー付きの2カラム。','desktop');
 await attempt('desktop-merchant',async()=>{await switchPersona(page,'merchant1_owner');await page.goto(PORTAL+'/merchant');await waitHeading(page,'加盟店ダッシュボード');await page.waitForTimeout(1200);await shot(page,'desktop','加盟店ダッシュボード（PC幅）','情報密度のある業務UI。','desktop');
  await page.goto(PORTAL+'/developer');await page.getByRole('button',{name:'Playground',exact:true}).click();await page.getByRole('button',{name:'実行',exact:true}).click();await waitText(page,'req_',20000);await page.waitForTimeout(400);await shot(page,'desktop','API Playground（PC幅）','左に要求、右に応答とcurl例。','desktop');});
 await attempt('desktop-admin',async()=>{await switchPersona(page,'admin');await page.goto(PORTAL+'/admin/ledger');await waitHeading(page,'台帳・整合性');await page.waitForTimeout(800);await shot(page,'desktop','台帳・整合性（PC幅）','再計算残高と業務照合の一覧。','desktop');
  await page.goto(PORTAL+'/demo');await waitHeading(page,'障害も、回復も');await page.waitForTimeout(600);await shot(page,'desktop','デモ操作パネル（PC幅）','16シナリオのカードと100並列captureパネル。','desktop');});
 await context.close();
}
await mobileFlow();await desktopFlow();await browser.close();
writeFileSync(resolve(out,'manifest.json'),JSON.stringify({captured_at:new Date().toISOString(),portal:PORTAL,store:STORE,shots},null,2));
console.log('gallery:',shots.length,'screens in',out);
