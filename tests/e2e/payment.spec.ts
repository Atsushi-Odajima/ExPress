import {test,expect} from '@playwright/test';
const API=process.env.API_URL??'http://localhost:4000',STORE=process.env.STORE_URL??'http://localhost:3001',PORTAL=process.env.PORTAL_URL??'http://localhost:3000';
test('別オリジンSDK購入 → 一部出荷 → 部分返金',async({page,context},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).click();await expect(page.getByRole('heading',{name:'あなたのウォレット'})).toBeVisible();
 await expect(page.locator('.hero-balance')).toContainText('30,000');
 await page.screenshot({path:`test-results/${testInfo.project.name}-wallet.png`,fullPage:true});
 if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'メニュー',exact:true}).click();
 await page.getByRole('button',{name:'サンプルECを開く',exact:true}).click();await expect(page).toHaveURL(STORE+'/');
 await page.getByRole('link').filter({hasText:'Studio One'}).click();await page.getByRole('button',{name:'バッグに追加'}).click();await page.getByRole('spinbutton',{name:'Studio One 数量'}).fill('2');await page.getByRole('spinbutton',{name:'Studio One 数量'}).blur();
 await page.getByLabel('売上確定のタイミング').selectOption('shipping');await page.getByRole('button',{name:'ExPressで支払う'}).click();await expect(page).toHaveURL(/\/checkout\//);await expect(page.locator('.checkout-amount')).toContainText('24,000');
 await page.locator('#challenge').check();await page.getByRole('button',{name:'この内容で支払いを承認'}).click();await page.getByRole('button',{name:'内容を確認',exact:true}).click();await page.getByRole('button',{name:'確認して実行',exact:true}).click();await expect(page.getByRole('button',{name:'店舗に戻って確認する'})).toBeVisible();await page.getByRole('button',{name:'店舗に戻って確認する'}).click();await expect(page).toHaveURL(STORE+'/return');await expect(page.locator('main')).toContainText('authorized');
 page.on('dialog',d=>d.accept());await page.locator('#ship input[name=value]').fill('12000');await page.locator('#ship input[name=final]').check();await page.getByRole('button',{name:'この金額で出荷・確定'}).click();await expect(page.locator('main')).toContainText('partially_paid');
 await page.locator('.refund input[name=value]').fill('1000');await page.getByRole('button',{name:'この金額の返金を依頼'}).click();await expect(page.locator('main')).toContainText('partially_refunded');await expect(page.locator('main')).toContainText('発送処理 1件');
 await page.screenshot({path:`test-results/${testInfo.project.name}-store-refund.png`,fullPage:true});
 await page.goto((process.env.PORTAL_URL??'http://localhost:3000')+'/wallet');await expect(page.locator('.hero-balance')).toContainText('19,000');expect(errors).toEqual([]);
});

test('英語切替・加盟店検索・共有QR・運営者の能力別設定',async({page},testInfo)=>{
 await page.goto('/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).click();await expect(page.locator('.hero-balance')).toContainText('30,000');
 await page.getByRole('button',{name:'Language',exact:true}).click();await expect(page.getByRole('heading',{name:'Your wallet',exact:true})).toBeVisible();
 await page.getByLabel('Switch demo persona').selectOption('merchant1_owner');await expect(page.getByRole('heading',{name:'Merchant overview',exact:true})).toBeVisible();
 await page.goto('/merchant/links');await page.getByRole('button',{name:'Create link',exact:true}).click();await page.getByLabel('Amount (JPY)',{exact:true}).fill('2000');await page.getByRole('button',{name:'Review details',exact:true}).click();await page.getByRole('button',{name:'Confirm and submit',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Close',exact:true}).last().click();
 await page.getByRole('button',{name:'QR',exact:true}).first().click();await expect(page.getByRole('img',{name:'QR code for sharing this payment link'})).toBeVisible();
 await page.goto('/merchant/payments');await expect(page.getByRole('button',{name:'Apply filters'})).toBeVisible();await page.getByLabel('Search query').fill('not-existing');await page.getByRole('button',{name:'Apply filters'}).click();await expect(page.getByText('No data yet.')).toBeVisible();
 await page.getByLabel('Switch demo persona').selectOption('admin');await page.goto('/admin/accounts');await page.getByRole('button',{name:'Review / restrict',exact:true}).first().click();await expect(page.getByRole('checkbox',{name:'New payments',exact:true})).toBeChecked();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.screenshot({path:`test-results/${testInfo.project.name}-english-admin.png`,fullPage:true});
});

test('WebhookでECが支払済みに収束、500再送・鍵更新・重複・順序逆転で二重発送なし',async({page,request})=>{
 await page.goto('/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).click();await expect(page.locator('.hero-balance')).toContainText('30,000');
 const exwSession=(await (await page.request.get(API+'/v1/session')).json());
 const ph={origin:PORTAL,'x-csrf-token':exwSession.csrf};const handoff=await (await page.request.post(API+'/v1/demo/store-handoff',{headers:ph,data:{}})).json();
 expect((await page.request.post(STORE+'/connect',{headers:{origin:PORTAL},data:{code:handoff.code}})).ok()).toBeTruthy();
 const ss=await (await page.request.get(STORE+'/api/session')).json(),sh={origin:STORE,'x-csrf-token':ss.csrf};
 expect((await page.request.post(STORE+'/api/demo/rotate-webhook',{headers:sh,data:{}})).ok()).toBeTruthy();await page.request.post(STORE+'/api/demo/webhook-failures',{headers:sh,data:{count:1}});
 const order=await (await page.request.post(STORE+'/api/orders',{headers:{...sh,'idempotency-key':crypto.randomUUID()},data:{mode:'shipping',items:[{id:'headphones',quantity:1}]}})).json();
 await page.goto(order.checkout_url);await page.locator('#challenge').check();await page.getByRole('button',{name:'この内容で支払いを承認'}).click();await page.getByRole('button',{name:'内容を確認',exact:true}).click();await page.getByRole('button',{name:'確認して実行',exact:true}).click();await expect(page.getByRole('button',{name:'店舗に戻って確認する'})).toBeVisible();
 const switched=await (await page.request.post(API+'/v1/demo/switch',{headers:ph,data:{preset:'merchant1_owner'}})).json();const mh={origin:PORTAL,'x-csrf-token':switched.csrf};
 const remote=await (await page.request.get(API+'/v1/orders/'+order.exw_order_id)).json();const captured=await page.request.post(API+'/v1/authorizations/'+remote.authorizations[0].id+'/capture',{headers:{...mh,'idempotency-key':crypto.randomUUID()},data:{amount:{currency:'JPY',value:'12000'},final_capture:true}});expect(captured.ok()).toBeTruthy();
 const stored=async()=>{const r=await (await page.request.get(STORE+'/api/orders')).json();return r.data.find((o:any)=>o.id===order.id);};
 await expect.poll(async()=>(await stored()).status,{timeout:20000}).toBe('paid');
 const deliveries=await (await page.request.get(API+'/v1/webhook-deliveries?limit=100')).json();expect(deliveries.data.some((d:any)=>d.data.http_status===500)).toBeTruthy();
 for(const d of deliveries.data)await page.request.post(API+'/v1/webhook-deliveries/'+d.id+'/retry',{headers:mh,data:{}});
 await expect.poll(async()=>{const rows=await (await page.request.get(API+'/v1/webhook-deliveries?limit=100')).json();return rows.data.filter((d:any)=>d.data.manual&&d.status==='succeeded').length;},{timeout:20000}).toBeGreaterThan(0);
 expect((await stored()).status).toBe('paid');const detail=await (await page.request.get(STORE+'/api/orders/'+order.id)).json();expect(detail.shipments).toHaveLength(1);
});
test('加盟店・運営者・PWA・ダークモード',async({page},testInfo)=>{
 await page.goto('/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).click();await expect(page.locator('.hero-balance')).toBeVisible();
 await page.getByRole('button',{name:'ダークモード切替'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByLabel('デモ人物を切り替え').selectOption('merchant1_owner');await expect(page.getByRole('heading',{name:'加盟店ダッシュボード'})).toBeVisible();await page.screenshot({path:`test-results/${testInfo.project.name}-merchant.png`,fullPage:true});
 await page.getByLabel('デモ人物を切り替え').selectOption('admin');await expect(page.getByRole('heading',{name:'運営ダッシュボード'})).toBeVisible();await expect(page.getByText('検査OK')).toBeVisible();
 await page.screenshot({path:`test-results/${testInfo.project.name}-admin.png`,fullPage:true});
 const manifest=await page.request.get('/manifest.webmanifest');expect(manifest.ok()).toBeTruthy();expect((await manifest.json()).name).toBe('ExPress');
});

test('模擬カード直接払いと元カード返金、英語ECでも財布は増減しない',async({page},testInfo)=>{
 await page.goto('/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).click();await expect(page.locator('.hero-balance')).toContainText('30,000');
 if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'メニュー',exact:true}).click();await page.getByRole('button',{name:'サンプルECを開く',exact:true}).click();await expect(page).toHaveURL(STORE+'/');
 await page.getByRole('button',{name:'Language',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('lang','en');await page.getByRole('link').filter({hasText:'Studio One'}).click();await page.getByRole('button',{name:/Add to bag/}).click();await page.getByRole('button',{name:/Pay with ExPress/}).click();
 await expect(page.locator('#checkout-source')).toBeVisible();await page.locator('#checkout-source').selectOption({index:1});await page.locator('#challenge').check();await page.getByRole('button',{name:'この内容で支払いを承認'}).click();await page.getByRole('button',{name:'内容を確認',exact:true}).click();await page.getByRole('button',{name:'確認して実行',exact:true}).click();await page.getByRole('button',{name:'店舗に戻って確認する'}).click();
 await expect(page.locator('main .tag')).toHaveText('paid',{timeout:25000});page.on('dialog',d=>d.accept());await page.locator('.refund input[name=value]').fill('1000');await page.locator('.refund button').click();await expect(page.locator('main .tag')).toHaveText('partially_refunded',{timeout:25000});
 await page.screenshot({path:`test-results/${testInfo.project.name}-card-refund-en.png`,fullPage:true});await page.goto(PORTAL+'/wallet');await expect(page.locator('.hero-balance')).toContainText('30,000');
});

test('Playgroundで実注文作成・APIログ・管理者の調整仕訳と反対仕訳',async({page})=>{
 await page.goto('/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).click();await expect(page.locator('.hero-balance')).toContainText('30,000');const consumer=(await (await page.request.get(API+'/v1/session')).json()).user.id;
 await page.getByLabel('デモ人物を切り替え').selectOption('merchant1_owner');await page.goto('/developer');await page.getByRole('button',{name:'Playground',exact:true}).click();await page.getByLabel('HTTP method').selectOption('POST');await page.getByRole('button',{name:'実行',exact:true}).click();await expect(page.locator('.playground')).toContainText('req_');await expect(page.locator('.playground')).toContainText('PLAYGROUND-001');
 await page.getByRole('button',{name:'APIログ',exact:true}).click();await expect(page.locator('main')).toContainText('/v1/orders');
 await page.getByLabel('デモ人物を切り替え').selectOption('admin');await page.goto('/admin/ledger');await page.getByRole('button',{name:'調整仕訳を作成',exact:true}).click();await page.getByLabel('対象ID',{exact:true}).fill(consumer);await page.getByLabel('金額（円）',{exact:true}).fill('500');await page.getByRole('button',{name:'内容を確認',exact:true}).click();await page.getByRole('button',{name:'確認して実行',exact:true}).click();await expect(page.getByRole('button',{name:'理由を付けて訂正',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'理由を付けて訂正',exact:true}).click();await page.getByLabel('理由',{exact:true}).fill('サンプル調整を元に戻す');await page.getByRole('button',{name:'内容を確認',exact:true}).click();await page.getByRole('button',{name:'確認して実行',exact:true}).click();await expect(page.getByRole('button',{name:'理由を付けて訂正',exact:true})).toHaveCount(0);
 await page.getByLabel('デモ人物を切り替え').selectOption('consumer');await expect(page.locator('.hero-balance')).toContainText('30,000');
});

test('デモパネルの同時承認で過剰使用を防ぎ、100重複captureが1回になる',async({page})=>{
 await page.goto('/wallet');await page.getByRole('button',{name:'デモウォレットをはじめる'}).click();await expect(page.locator('.hero-balance')).toContainText('30,000');const s=await (await page.request.get(API+'/v1/session')).json(),ph={origin:PORTAL,'x-csrf-token':s.csrf};
 const handoff=await (await page.request.post(API+'/v1/demo/store-handoff',{headers:ph,data:{}})).json();expect((await page.request.post(STORE+'/connect',{headers:{origin:PORTAL},data:{code:handoff.code}})).ok()).toBeTruthy();const ss=await (await page.request.get(STORE+'/api/session')).json(),sh={origin:STORE,'x-csrf-token':ss.csrf};
 const orders=[];for(let i=0;i<2;i++){const r=await page.request.post(STORE+'/api/orders',{headers:{...sh,'idempotency-key':crypto.randomUUID()},data:{mode:'shipping',items:[{id:'headphones',quantity:2}]}});expect(r.ok()).toBeTruthy();orders.push(await r.json());}
 await page.goto('/demo');await page.getByLabel('チェックアウトURLまたはID 1').fill(orders[0].checkout_url);await page.getByLabel('チェックアウトURLまたはID 2').fill(orders[1].checkout_url);await page.getByRole('button',{name:'内容を確認',exact:true}).click();await page.getByRole('checkbox',{name:'表示した2件をウォレット残高で支払うことに同意します。'}).check();await page.getByRole('button',{name:'両方を同時承認',exact:true}).click();await expect(page.locator('main pre').last()).toContainText('INSUFFICIENT_FUNDS');await expect(page.locator('main pre').last()).toContainText('6000');
 await page.getByLabel('デモ人物を切り替え').selectOption('merchant1_owner');await page.goto('/demo');await page.getByLabel('オーソリ',{exact:true}).selectOption({index:1});await page.getByRole('button',{name:'内容を確認',exact:true}).click();await page.getByRole('button',{name:'確認して実行',exact:true}).click();await expect(page.getByLabel('並列要求の結果')).toContainText('"unique_captures": 1');await expect(page.getByLabel('並列要求の結果')).toContainText('"ledger_ok": true');
});
