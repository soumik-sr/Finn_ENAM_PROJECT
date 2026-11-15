import { resolvePDFJS } from 'unpdf/pdfjs';
import assets from 'finn:assets';

const minutes = 60_000;
const cache = new Map();
let parser;
let warm;
const pending = new Map(), failures = new Map(), clients = new Map();
let activeJobs=0, windowStart=Date.now(), windowRequests=0;
// Only trusted document routers/exchanges/issuers; never arbitrary domains from HTML.
const sourceHosts=new Set(['www.screener.in','www.bseindia.com','nsearchives.nseindia.com','archives.nseindia.com','www.nseindia.com','www.ril.com','investor.nvidia.com','www.sec.gov','www.apple.com','www.microsoft.com']);
const securityHeaders={
 'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com",
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
 'permissions-policy':'camera=(), microphone=(), geolocation=()',
 'strict-transport-security':'max-age=31536000'
};
const headers = { 'User-Agent':'FINN/1.0 (public company document research)', Accept:'*/*' };
const stop = new Set('what are is was were how the a an from about in of and for to did does their its this that company management say says please tell me reported report with on at last recent has it have by'.split(' '));
const json = (body,status=200) => Response.json(body,{status,headers:{...securityHeaders,'cache-control':'no-store',...(status===429?{'retry-after':'60'}:{})}});
const clean = html => html.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();

function validDocumentURL(value) {
  try {
    const u = new URL(value);
    return u.protocol==='https:' && !u.port && !u.username && !u.password &&
      sourceHosts.has(u.hostname);
  } catch { return false; }
}

async function limitedBody(stream,limit,timeout=8000){
 const reader=stream?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0,timer;
 try{
  return await Promise.race([(async()=>{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('Body exceeds size limit.');chunks.push(value);}const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Body read timed out.')),timeout);})]);
 }finally{clearTimeout(timer);reader.cancel().catch(()=>{});}
}

function permit(request){
 const now=Date.now();if(now-windowStart>=minutes){windowStart=now;windowRequests=0;clients.clear();}
 if(windowRequests>=180)return false;
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const count=clients.get(ip)||0;if(count>=60)return false;
 if(clients.size>=2048&&!clients.has(ip))return false;
 clients.set(ip,count+1);windowRequests++;return true;
}

async function readSource(url, limit) {
  if (!validDocumentURL(url)) throw new Error('Unsupported document location.');
  let response;
  for (let attempt=0;attempt<4;attempt++) {
    response = await fetch(url,{headers,redirect:'manual',signal:AbortSignal.timeout(8000)});
    if (![301,302,303,307,308].includes(response.status)) break;
    const dest = new URL(response.headers.get('location'),url);
    if (!validDocumentURL(dest.href) || dest.hostname!==new URL(url).hostname) throw new Error('Document moved to another site.');
    url=dest.href;
  }
  if (!response.ok || Number(response.headers.get('content-length'))>limit) throw new Error('Source unavailable or exceeds size limit.');
  return limitedBody(response.body,limit);
}

async function discover(ticker) {
  const base='https://www.screener.in/company/'+encodeURIComponent(ticker)+'/';
  for (const suffix of ['consolidated/','']) {
    let html;
    try { html=new TextDecoder().decode(await readSource(base+suffix,2_000_000)); }
    catch { continue; }
    const found=[];
    let section='';
    for (const tag of html.matchAll(/<(h[23]|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const label=clean(tag[3]);
      if (tag[1].toLowerCase()!=='a') { section=label.toLowerCase(); continue; }
      let kind;
      if (section.includes('concall') && /transcript/i.test(label)) kind='earnings transcript';
      if (section.includes('annual report') && /financial year|annual report|20\d\d/i.test(label)) kind='annual report';
      const href=tag[2].match(/\bhref=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g,'&');
      if (kind && validDocumentURL(href)) found.push({kind,url:href,title:ticker+' · '+(kind==='annual report'?label:kind)});
    }
    if (found.length) return found;
  }
  throw new Error('Company documents could not be discovered for this ticker.');
}

async function indexDocument(doc) {
  const bytes=await readSource(doc.url,8_000_000);
  if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw new Error('Source is not a PDF.');
  parser ??= resolvePDFJS();
  const {getDocument}=await parser;
  const pdf=await getDocument({data:bytes,isEvalSupported:false,enableScripting:false,disableFontFace:true,useSystemFonts:false,verbosity:0,maxImageSize:0}).promise;
  const rows=[];
  try {
    for(let page=1;page<=Math.min(pdf.numPages,doc.kind==='annual report'?35:42);page++) {
      const p=await pdf.getPage(page);
      const content=await p.getTextContent();
      const text=content.items.map(i=>i.str||'').join(' ').replace(/\s+/g,' ').trim();
      if (text.length>=100) rows.push({...doc,page,text:text.slice(0,9500)});
      p.cleanup();
    }
  } finally { await pdf.destroy(); }
  return rows;
}

async function passages(ticker) {
  warm ??= JSON.parse(assets['/research-cache.json']?.[1]||'{"companies":{}}').companies;
  if (warm[ticker]?.length) return {rows:warm[ticker],origin:'pre-indexed documents'};
  const known=cache.get(ticker);
  if (known && Date.now()-known.time<60*minutes) return {rows:known.rows,origin:'cached documents'};
  if((failures.get(ticker)||0)>Date.now())throw new Error('Document discovery temporarily unavailable. Try again later.');
  if(pending.has(ticker))return pending.get(ticker);
  if(activeJobs>=2)throw new Error('Research is busy. Try again shortly.');
  const job=(async()=>{activeJobs++;
  try{
  const docs=await discover(ticker);
  const calls=docs.filter(d=>d.kind==='earnings transcript').slice(0,3);
  const annual=docs.find(d=>d.kind==='annual report');
  let rows=[];
  for(const doc of [...calls,...(annual?[annual]:[])]) {
    try { rows.push(...await indexDocument(doc)); } catch { continue; }
    if (rows.length) break;
  }
  if (!rows.length) throw new Error('The discovered documents could not be read within the extraction limits.');
  if(cache.size>=16) cache.delete(cache.keys().next().value);
  cache.set(ticker,{rows,time:Date.now()});
  return {rows,origin:'live document discovery'};
  }catch(error){if(failures.size>=32)failures.delete(failures.keys().next().value);failures.set(ticker,Date.now()+minutes);throw error;}
  finally{activeJobs--;pending.delete(ticker);}})();
  pending.set(ticker,job);return job;
}

function rank(question,rows) {
  const normalize=s=>s.toLowerCase().replace(/fy\s*['’]?\s*(?:20)?(\d\d)\b/g,'fy$1');
  const query=normalize(question);
  const words=[...new Set((query.match(/[a-z0-9]+/g)||[]).filter(w=>!stop.has(w)))];
  if (!words.length) return [];
  const periods=words.filter(w=>/^(?:fy\d\d|q[1-4]|20\d\d)$/.test(w));
  const candidates=[];
  for (const row of rows) {
    const sentences=row.text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || [row.text];
    // Split at sentence boundaries when possible. Bound excessively long PDF text runs.
    const segments=row.text.match(/.{1,600}(?:[.!?](?=\s|$)|\s|$)/gs)||sentences;
    for(const raw of segments){
      const text=raw.trim(), norm=normalize(text);
      const tokens=new Set(norm.match(/[a-z0-9]+/g)||[]);
      const hits=words.filter(w=>tokens.has(w)).length;
      if (!periods.every(p=>tokens.has(p)) || hits<Math.ceil(words.length*.65)) continue;
      candidates.push({row:{...row,text},score:hits/words.length+(norm.includes(query)?0.1:0)});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const result=[];
  for(const {row} of candidates){
    if(!result.some(r=>r.page===row.page && r.url===row.url)) result.push(row);
    if(result.length===4) break;
  }
  return result;
}

export default {
  async fetch(request) {
    const url=new URL(request.url);
    if(url.pathname==='/api/research'){
      if(request.method!=='POST') return json({error:'Use POST.'},405);
      if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Cross-origin requests are not allowed.'},403);
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return json({error:'Use application/json.'},415);
      if(!permit(request))return json({error:'Too many requests. Try again in a minute.'},429);
      if(Number(request.headers.get('content-length'))>4096)return json({error:'Question too large.'},413);
      let body;
      try{body=JSON.parse(new TextDecoder().decode(await limitedBody(request.body,4096)));}catch(error){return json({error:'Invalid or oversized request.'},error.message.includes('size limit')?413:400)}
      if(!body||Array.isArray(body)||typeof body!=='object'||typeof body.ticker!=='string'||typeof body.question!=='string')return json({error:'Enter a ticker and question as strings.'},422);
      const rawTicker=String(body?.ticker||'').trim().toUpperCase();
      const ticker=({NVIDIA:'NVDA',NVDIA:'NVDA',TESLA:'TSLA',TESTA:'TSLA',APPLE:'AAPL',MICROSOFT:'MSFT',JPL:'JIO'})[rawTicker]||rawTicker,question=String(body?.question||'').trim();
      if(!/^[A-Z0-9][A-Z0-9&-]{0,24}$/.test(ticker)||question.length<2||question.length>800)return json({error:'Enter an NSE ticker and a question of 2–800 characters.'},422);
      try{
        const {rows,origin}=await passages(ticker);
        const evidence=rank(question,rows);
        return json({ticker,mode:origin,answer:evidence.length?'Relevant indexed evidence follows. Entries marked as reviewed source summaries are paraphrases, not verbatim quotes.':'Not disclosed in the available indexed evidence.',evidence});
      }catch(err){return json({error:err.message||'Document discovery unavailable.'},err.message.includes('busy')?503:502)}
    }
    const asset=assets[url.pathname==='/'?'/index.html':url.pathname];
    if(!asset||!['HEAD','GET'].includes(request.method))return new Response('Not found',{status:404,headers:securityHeaders});
    return new Response(request.method==='HEAD'?null:asset[1],{headers:{...securityHeaders,'content-type':asset[0]+'; charset=utf-8','cache-control':'no-cache'}});
  }
};
