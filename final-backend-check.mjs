import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import worker from './dist/server/index.js';
const origin='https://finn-enam-briefing.dampankle4.chatgpt.site';
const live=process.argv.includes('--live');
const results=[];
async function check(name,fn){const start=Date.now();try{const detail=await fn();results.push({name,ok:true,ms:Date.now()-start,...detail});console.log('PASS',name,JSON.stringify(detail||{}));}catch(e){results.push({name,ok:false,error:e.message,ms:Date.now()-start});console.log('FAIL',name,e.message);}}
async function request(path,options){const req=new Request(origin+path,options);return live?fetch(req,{signal:AbortSignal.timeout(90000)}):worker.fetch(req);}
const post=(body)=>request('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const evidence=JSON.parse(readFileSync('dist/research-cache.json','utf8')).companies;
await check('Stored data and source integrity',async()=>{
 for(const file of ['events','synced','market','results','coverage','research-cache'])JSON.parse(readFileSync('dist/'+file+'.json','utf8'));
 const events=JSON.parse(readFileSync('dist/events.json','utf8'));
 const market=JSON.parse(readFileSync('dist/market.json','utf8'));
 const coverage=JSON.parse(readFileSync('dist/coverage.json','utf8'));
 for(const row of market)assert.ok(Number.isFinite(row.change)&&Number.isFinite(row.volumeMultiple)&&Number.isFinite(row.close));
 for(const rows of Object.values(evidence))for(const r of rows){assert.ok(new URL(r.url).protocol==='https:');assert.ok(r.text.length);assert.ok(r.summary||r.page>0);}
 for(const row of events)for(const c of row.comparisons||[]){assert.ok(c.guidanceQuote&&c.resultQuote);assert.ok(c.guidanceSource&&c.resultSource);}
 assert.equal(coverage.ipos.length,12);assert.equal(new Set(coverage.ipos.map(x=>x.name)).size,12);
 return {marketRows:market.length,marketCompanies:new Set(market.map(x=>x.ticker)).size,researchCompanies:Object.keys(evidence).length,passages:Object.values(evidence).flat().length,comparisons:events.flatMap(r=>r.comparisons||[]).length};
});
await check('Public assets match current build',async()=>{
 for(const path of ['/','/app.js','/style.css','/events.json','/synced.json','/market.json','/results.json','/coverage.json','/research-cache.json']){
  const r=await request(path);assert.equal(r.status,200,path);const body=await r.text();const expected=readFileSync('dist/'+(path==='/'?'index.html':path.slice(1)),'utf8');
  if(live&&path==='/'){
   // The hosting edge may inject its own challenge script after our application.
   assert.ok(body.startsWith(expected.split('</body>')[0]),'Application HTML prefix');assert.ok(body.endsWith('</body></html>\r\n')||body.endsWith('</body></html>\n'));
  }else assert.equal(body,expected,path);
 }
 return {assets:10};
});
for(const ticker of Object.keys(evidence))await check('Research '+ticker,async()=>{
 const question=ticker==='JIO'?'IPO issue price':['INFY','TCS','HCLTECH','WIPRO'].includes(ticker)?'revenue':'revenue growth';
 const r=await post({ticker,question});assert.equal(r.status,200);const d=await r.json();assert.ok(d.evidence.length,JSON.stringify(d));for(const e of d.evidence)assert.ok(e.url&&e.text);return {mode:d.mode,citations:d.evidence.length};
});
await check('Aliases NVIDIA and TESLA',async()=>{for(const [input,expected] of [['NVIDIA','NVDA'],['TESLA','TSLA']]){const r=await post({ticker:input,question:'revenue'});const d=await r.json();assert.equal(d.ticker,expected);assert.ok(d.evidence.length);}});
await check('Negative grounding across all featured companies',async()=>{for(const ticker of Object.keys(evidence)){const r=await post({ticker,question:'What is the FY29 dividend payout target?'});assert.equal(r.status,200);const d=await r.json();assert.equal(d.evidence.length,0,ticker);assert.match(d.answer,/not disclosed/i);}});
await check('API validation and HTTP errors',async()=>{
 for(const body of [null,{},[],{ticker:'../secrets',question:'revenue'},{ticker:'NVDA',question:'x'},{ticker:'NVDA',question:'x'.repeat(801)}])assert.equal((await post(body)).status,422,JSON.stringify(body));
 assert.equal((await request('/api/research',{method:'GET'})).status,405);
 assert.equal((await request('/api/research',{method:'POST',body:'{bad'})).status,400);
 assert.equal((await request('/api/research',{method:'POST',body:'x'.repeat(5000)})).status,413);
 assert.equal((await request('/does-not-exist')).status,404);
 assert.equal((await request('/.git/config')).status,404);
 assert.equal((await request('/',{method:'HEAD'})).status,200);
});
if(live)for(const ticker of ['PERSISTENT','BEL'])await check('Live discovery → PDF extraction → cited answer '+ticker,async()=>{const r=await post({ticker,question:'revenue'});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));assert.ok(d.evidence.length,JSON.stringify(d));assert.ok(d.evidence.every(e=>e.page>0&&e.url.startsWith('https://')));return {mode:d.mode,citations:d.evidence.length,pages:d.evidence.map(e=>e.page)};});
const report={time:new Date().toISOString(),target:live?origin:'built Worker',passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
writeFileSync(live?'backend-check-live.json':'backend-check-local.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,failed:report.failed}));if(report.failed)process.exitCode=1;
