import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from '../packages/database/src/config.ts';
/**
 * Renders the ExPress mark (the same shape as public/logo.svg) into PNG app icons.
 * No external image tooling is required: the Playwright-managed Chromium rasterizes inline SVG.
 */
const mark='<path d="M19 19h29l-7 9H26l-5 8h20l-7 10H8l12-18h-7z" fill="#8ce0bf"/>';
const rounded=(size:number)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" rx="18" fill="#153f52"/>${mark}</svg>`;
const fullBleed=(size:number)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" fill="#153f52"/><g transform="translate(8 8) scale(0.75)">${mark}</g></svg>`;
const out=resolve(root,'apps/portal/public');mkdirSync(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({deviceScaleFactor:1});
async function render(file:string,svg:string,size:number,transparent:boolean){
 await page.setViewportSize({width:size,height:size});
 await page.setContent(`<!doctype html><html><body style="margin:0;background:${transparent?'transparent':'#153f52'}">${svg}</body></html>`);
 writeFileSync(resolve(out,file),await page.screenshot({type:'png',omitBackground:transparent,clip:{x:0,y:0,width:size,height:size}}));
 console.log('icon',file,size);
}
await render('icon-192.png',rounded(192),192,true);
await render('icon-512.png',rounded(512),512,true);
await render('icon-maskable-512.png',fullBleed(512),512,false);
await render('apple-touch-icon.png',fullBleed(180),180,false);
await browser.close();
