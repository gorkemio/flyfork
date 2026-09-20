import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertRun, browserOutputs, evidenceFile } from './scripts/verification-paths.mjs';
const run = assertRun(process.env.FLYFORK_EVIDENCE_DIR ?? '');
evidenceFile('runtime-admission-check'); // Refuse completed/unreserved runs before Playwright cleans outputs.
const plan = JSON.parse(readFileSync(resolve(run, 'plan.json'), 'utf8'));
if (!['chrome','webkit','firefox'].includes(plan.engine) || !['full','smoke','transaction','focus','focus-red','import'].includes(plan.scope)) throw Error('Unapproved runtime browser scope');
const url = new URL(plan.baseURL);
if(url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error('Loopback root required');
const transaction = new URL(plan.transactionURL);
if(transaction.protocol !== 'http:' || transaction.hostname !== '127.0.0.1' || transaction.pathname !== '/' || transaction.search || transaction.hash || transaction.username || transaction.password) throw Error('Loopback transaction origin required');
const portable = ['command-activation.spec.ts','persistence.spec.ts','library-actions.spec.ts','library-transactions.spec.ts','storage-faults.spec.ts','guide-cancel.spec.ts','pending-focus.spec.ts'];
const engineUse = plan.engine === 'chrome' ? {browserName:'chromium',channel:'chrome'} : {browserName:plan.engine};
export default defineConfig({
 testDir: plan.scope === 'smoke' ? './tests/browser-smoke' : './tests/e2e',
 ...browserOutputs({},run), fullyParallel:false, workers:1, retries:0, timeout:60000, maxFailures:3,
 use:{...engineUse,baseURL:plan.baseURL,headless:true,bypassCSP:false,trace:'retain-on-failure'},
 ...(plan.scope==='focus'||plan.scope==='focus-red'?{testMatch:['**/pending-focus.spec.ts'],...(plan.scope==='focus-red'?{grep:/pending focus 390 complete/}:{})}:plan.scope==='import'?{testMatch:['**/library-actions.spec.ts']}:{ }),
 ...(plan.scope==='full' && plan.engine!=='chrome' ? {testMatch:portable} : {}),
 projects:plan.scope==='transaction' ? [{name:plan.engine+'-isolated-transaction-server',testMatch:['**/library-transactions.spec.ts'],use:{baseURL:plan.transactionURL,bypassCSP:false}}] : plan.scope==='smoke' ? [{name:plan.engine+'-production-CSP',use:{bypassCSP:false}}] : plan.scope!=='full' ? [{name:plan.engine+'-runtime-and-observed',use:{bypassCSP:false}}] : [
  {name:plan.engine+'-runtime-and-observed',testIgnore:['**/library-transactions.spec.ts'],use:{bypassCSP:false}},
  {name:plan.engine+'-transaction-harness',testMatch:['**/library-transactions.spec.ts'],use:{baseURL:plan.transactionURL,bypassCSP:false}}
 ]
});
