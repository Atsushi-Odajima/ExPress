import {defineConfig,devices} from '@playwright/test';
import 'dotenv/config';
// Windows keeps the previously tested Edge configuration. Other hosts use the
// Playwright-managed Chromium binary; no connection to the Windows PC is needed.
const requestedChannel=process.env.PLAYWRIGHT_CHANNEL??(process.platform==='win32'?'msedge':'chromium');
if(!['chromium','msedge','chrome'].includes(requestedChannel))throw Error('PLAYWRIGHT_CHANNEL must be chromium, msedge, or chrome');
const channel=requestedChannel==='chromium'?undefined:requestedChannel;
export default defineConfig({testDir:'tests/e2e',fullyParallel:false,workers:1,timeout:90000,expect:{timeout:15000},reporter:[['list'],['html',{open:'never'}]],use:{baseURL:process.env.PORTAL_URL??'http://localhost:3000',trace:'retain-on-failure',screenshot:'only-on-failure'},projects:[{name:'desktop',use:{...devices['Desktop Chrome'],channel}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium',channel}}]});
