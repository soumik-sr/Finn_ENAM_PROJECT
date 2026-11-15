import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import worker from './dist/server/index.js';
for(const ticker of ['NVDA','TESLA','AAPL','MSFT','JIO']){
 const r=await worker.fetch(new Request('https://finn.test/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker,question:ticker==='JIO'?'IPO issue price':'revenue'})}));
 const d=await r.json();assert.equal(r.status,200);assert.ok(d.evidence.length,ticker);assert.ok(d.evidence.every(e=>e.summary));
}
const r=await worker.fetch(new Request('https://finn.test/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker:'NVDA',question:'What is the FY29 dividend payout target?'})}));
assert.equal((await r.json()).evidence.length,0);
const app={innerHTML:''};
const context={document:{querySelector:()=>app,querySelectorAll:()=>[]},localStorage:{getItem:()=>null},location:{hash:'#discover'},window:{},fetch:async name=>({ok:true,json:async()=>JSON.parse(readFileSync('dist/'+name,'utf8'))}),Intl,console};
vm.createContext(context);vm.runInContext(readFileSync('dist/app.js','utf8'),context);await new Promise(r=>setTimeout(r,20));
assert.ok(app.innerHTML.includes('NVIDIA'));assert.ok(app.innerHTML.includes('Tesla'));
vm.runInContext("discoveryTab='ipos';render()",context);assert.ok(app.innerHTML.includes('Svatantra'));
vm.runInContext("researchTicker='NVDA';location.hash='#research';render()",context);assert.ok(app.innerHTML.includes('Ask a research question'));
console.log('Passed: five research profiles, aliases, unsupported question, directory, IPO view and research rendering.');
