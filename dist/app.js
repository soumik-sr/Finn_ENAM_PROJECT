const app = document.querySelector('#app');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc = escapeHTML;
const link = (url,label) => /^https?:\/\//i.test(url || '') ? '<a target="_blank" rel="noopener" href="'+esc(url)+'">'+esc(label)+' ↗</a>' : '';
const defaults = 'INFY TCS HCLTECH WIPRO RELIANCE HDFCBANK ICICIBANK LT TITAN TRENT BEL POLYCAB ITC SUNPHARMA MARUTI NTPC'.split(' ');
let portfolio = JSON.parse(localStorage.getItem('finn.portfolio') || 'null') || defaults;
let thresholds = JSON.parse(localStorage.getItem('finn.thresholds') || '[5,2]');
let rangeStart='2025-04-10', rangeEnd='2025-04-22';
let events=[], market=[], quarterly={}, period='snapshot', researchTicker='INFY', generation=0;
const saved = (key,value) => localStorage.setItem('finn.'+key,JSON.stringify(value));
const btn = (name,action,value,selected=false) => '<button data-action="'+action+'" data-value="'+esc(value)+'" class="'+(selected?'selected':'')+'">'+esc(name)+'</button>';
async function readJSON(name) {
 const response = await fetch(name, {cache:'no-store'});
 if (!response.ok) throw new Error('Could not read ' + name);
 return response.json();
}
let refreshing=false, refreshMessage='';
function latestFiling() {
 const scoped = events.filter(row => portfolio.includes(row.ticker));
 const newest = scoped.reduce((latest,row) => {
  const date=Date.parse(row.timestamp || row.date);
  return date>latest ? date : latest;
 },0);
 if (!newest) return 'No stored filings';
 return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(newest);
}
function freshnessBar() {
 return '<div class="freshness"><div><small>Latest portfolio filing</small><strong>'+esc(latestFiling())+'</strong></div><button data-action="refresh" '+(refreshing?'disabled':'')+'>Refresh stored data</button><span role="status">'+esc(refreshMessage)+'</span></div>';
}
const intro = (label,title,desc) => '<div class="eyebrow">'+label+'</div><h1>'+title+'</h1><p class="muted">'+desc+'</p>';
function inWindow(row){
 if(period==='custom')return row.date.slice(0,10)>=rangeStart && row.date.slice(0,10)<=rangeEnd;
 if(period==='snapshot')return row.date>='2025-04-10' && row.date.slice(0,10)<='2025-04-22';
 const t=Date.parse(row.timestamp || row.date); return t<=Date.now() && t>=Date.now()-(period==='24h'?1:7)*86400000;
}
function financials(rows){
 if(!rows?.length)return '';
 const growth=(now,base)=>base>0?((now/base-1)*100).toFixed(1)+'%':'—';
 return '<details class="financial"><summary>Quarterly figures · March 2025</summary><div class="scroll"><table><thead><tr><th>Metric</th><th>Q4 FY25</th><th>Q3 FY25</th><th>Q4 FY24</th><th>QoQ</th><th>YoY</th></tr></thead><tbody>'+rows.map(r=>'<tr><th>'+esc(r.metric)+' · '+esc(r.unit)+'</th>'+[r.current,r.prior,r.yearAgo].map(n=>'<td>'+esc(n.toLocaleString('en-IN'))+'</td>').join('')+'<td>'+growth(r.current,r.prior)+'</td><td>'+growth(r.current,r.yearAgo)+'</td></tr>').join('')+'</tbody></table></div>'+link(rows[0].source,'March filing')+' · '+link(rows[0].priorSource,'December filing')+'</details>';
}
function card(row,i){
 return '<article class="card '+(i===0?'lead':'')+'"><div class="eyebrow">'+esc(row.ticker)+' &nbsp; / &nbsp; '+esc(row.category)+'</div><h3>'+esc(row.title)+'</h3><p>'+esc(row.summary)+'</p><p>'+esc(row.significance)+'</p><small>'+esc(row.date)+'</small>'+(row.category==='results'&&row.date==='2025-04-17'?financials(quarterly[row.ticker]):'')+'<div class="actions">'+link(row.source,'Original disclosure')+'<button class="investigate" data-action="investigate" data-value="'+esc(row.ticker)+'">Research company →</button></div></article>';
}
function collectedThrough(rows){
 return rows.map(r=>String(r.date||'').slice(0,10)).sort().at(-1)||'no observations';
}
function briefing(){
 const visible=events.filter(r=>portfolio.includes(r.ticker)&&inWindow(r));
 if(period!=='snapshot')visible.sort((a,b)=>(b.timestamp||b.date).localeCompare(a.timestamp||a.date));
 const routine=r=>/routine|compliance|unclassified/i.test(r.category);
 const signals=market.filter(r=>portfolio.includes(r.ticker)&&inWindow(r)&&(Math.abs(r.change)>=thresholds[0]||r.volumeMultiple>=thresholds[1])).sort((a,b)=>b.date.localeCompare(a.date));
 app.innerHTML=intro('PORTFOLIO INTELLIGENCE','Portfolio briefing','The filings and market moves that deserve a closer look.')+freshnessBar()+
 '<div class="toolbar">'+[['snapshot','FY25 earnings snapshot'],['24h','Last 24h'],['7d','Last 7 days'],['custom','Custom dates']].map(([v,n])=>btn(n,'period',v,period===v)).join('')+'</div>'+(period==='custom'?'<form id="range"><label>From <input type="date" required name="start" value="'+rangeStart+'"></label><label>Through <input type="date" required name="end" value="'+rangeEnd+'"></label><button>Apply</button></form>':'')+'<div class="eyebrow">'+(period==='snapshot'?'Historical demo · 10–22 April 2025':period==='custom'?'Selected dates · stored disclosures':'Current window · stored disclosures')+' &nbsp; / &nbsp; '+visible.length+' disclosures</div><div class="grid"><section>'+ (visible.filter(r=>!routine(r)).map(card).join('')||'<div class="panel">No material disclosures in the stored data for this window.</div>')+
 (visible.some(routine)?'<details><summary>Routine disclosures</summary>'+visible.filter(routine).map(r=>card(r,1)).join('')+'</details>':'')+'</section><aside><div class="eyebrow">MARKET MONITOR</div><h2>Threshold alerts</h2><p>Daily moves of ±'+thresholds[0]+'% or volume of '+thresholds[1]+'× its recent average.</p>'+ (signals.slice(0,8).map(r=>'<section><b>'+esc(r.ticker)+'</b> · '+esc(r.date)+'<br>'+esc(r.change)+'% price · '+esc(r.volumeMultiple)+'× volume</section>').join('')||'<section>No matching observations in the stored data.</section>')+'<p><small>Latest stored session · '+esc(collectedThrough(market))+'</small></p><a href="#portfolio">Manage thresholds →</a></aside></div>';
}
function quotedClaim(label,quote,url) {
 const page = String(url||'').match(/#page=(\d+)/i);
 const caption = page ? label+' · p. '+page[1] : label;
 return '<div><strong>'+label+'</strong><blockquote>'+esc(quote)+'</blockquote>'+link(url,caption)+'</div>';
}
function evidence(c){
 return '<div class="result"><small>'+esc(c.period)+'</small><h3>'+esc(c.metric)+'</h3><p>Guidance <b>'+esc(c.target)+'</b><br>Actual <b>'+esc(c.actual)+'</b></p><p>'+esc(c.status)+'</p><details><summary>View evidence</summary><div class="quote-pair">'+quotedClaim('Original guidance',c.guidanceQuote,c.guidanceSource)+quotedClaim('Reported result',c.resultQuote,c.resultSource)+'</div></details></div>';
}
function research(){
 const rows=events.filter(r=>r.ticker===researchTicker);const comps=rows.flatMap(r=>r.comparisons||[]);
 app.innerHTML=intro('PRIMARY SOURCE RESEARCH','Company research','Investigate a company and inspect the evidence behind its numbers.')+'<form id="lookup"><input name="ticker" aria-label="NSE ticker" required maxlength="25" pattern="[a-zA-Z0-9][a-zA-Z0-9&amp;\\-]{0,24}" value="'+esc(researchTicker)+'"><button class="primary">Open company</button></form><div class="toolbar">'+['INFY','TCS','HCLTECH','WIPRO'].map(t=>btn(t,'investigate',t,t===researchTicker)).join('')+'</div><div class="grid"><section class="panel"><div class="eyebrow">'+esc(researchTicker)+'</div><h2>Ask a research question</h2><form id="ask"><input name="question" aria-label="Research question" minlength="2" maxlength="800" placeholder="What did management guide for?" required><button class="primary">Ask</button></form><div class="toolbar">'+btn('What was revenue growth?','suggest','What was revenue growth?')+'</div><div id="answer" role="status"></div></section><aside><div class="eyebrow">DOCUMENT LIBRARY</div><h2>Company disclosures</h2>'+ (rows.filter(r=>r.comparisons?.length || !r.timestamp).map(r=>'<section>'+link(r.source,r.title+' · '+r.date)+'</section>').join('')||'Ask a question to search reports and transcripts.')+'</aside></div><section class="panel"><h2>Promises vs performance</h2>'+(comps.map(evidence).join('')||'No verified comparison stored for this company.')+'</section>';
}
function settings(){
 app.innerHTML=intro('WATCHLIST','Your portfolio',portfolio.length+' companies tracked in this browser.')+'<div class="grid"><section class="panel"><h2>Portfolio companies</h2><div class="toolbar">'+portfolio.map(t=>btn(t+' ×','remove',t)).join('')+'</div><form id="add"><input name="ticker" required pattern="[A-Za-z0-9&-]{1,30}" placeholder="NSE ticker" aria-label="Add ticker"><button>Add company</button></form></section><aside><h2>Alert thresholds</h2><form id="limits"><label>Daily move (%) <input type="number" min=".1" step=".1" required name="price" value="'+thresholds[0]+'"></label><label>Volume multiple <input type="number" min=".1" step=".1" required name="volume" value="'+thresholds[1]+'"></label><button>Save thresholds</button><output></output></form></aside></div>';
}
function render(){generation++;const page=location.hash.slice(1)||'briefing';document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+page));({portfolio:settings,research,briefing}[page]||briefing)()}
window.onhashchange=render;
app.onclick=e=>{const b=e.target.closest('[data-action]');if(!b)return;let v=b.dataset.value;switch(b.dataset.action){case 'refresh':reloadBriefing();return;case 'suggest':{const form=document.getElementById('ask');form.elements.question.value=v;form.requestSubmit();return}case 'period':period=v;break;case 'investigate':researchTicker=v;location.hash='research';break;case 'remove':portfolio=portfolio.filter(t=>t!==v);saved('portfolio',portfolio);break;}render()};
app.onsubmit=async e=>{
 e.preventDefault();const form=e.target,f=new FormData(form),t=String(f.get('ticker')||'').trim().toUpperCase();
 if(form.id==='range'){if(f.get('start')>f.get('end')){form.elements.end.setCustomValidity('Choose an end date on or after the start date.');form.elements.end.reportValidity();form.elements.end.oninput=()=>form.elements.end.setCustomValidity('');return}rangeStart=f.get('start');rangeEnd=f.get('end');render();return}
 if(form.id==='lookup'){researchTicker=t;render();return}
 if(form.id==='add'){portfolio=[...new Set([...portfolio,t])];saved('portfolio',portfolio);render();return}
 if(form.id==='limits'){thresholds=[Number(f.get('price')),Number(f.get('volume'))];saved('thresholds',thresholds);form.querySelector('output').textContent='Saved';return}
 await askQuestion(String(f.get('question')).trim(),form);
};

async function askQuestion(question,form) {
 const id=++generation;
 const out=document.getElementById('answer');
 const submit=form.querySelector('button');
 submit.disabled=true;
 out.textContent='Searching documents for '+researchTicker+'…';
 try {
  const response=await fetch('/api/research',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({ticker:researchTicker,question})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok || !data.answer)throw new Error(data.error || 'The research service could not complete this request.');
  if(id!==generation)return;
  const excerpts=Array.isArray(data.evidence)?data.evidence:[];
  const sources=excerpts.map((item,index)=>{
   const page=Number(item.page);
   const source=String(item.url||'').split('#')[0]+(page>0?'#page='+page:'');
   const label='['+(index+1)+'] '+(item.title||'Original disclosure')+(page>0?' · p. '+page:'');
   return '<li><blockquote>'+esc(item.text)+'</blockquote>'+link(source,label)+'</li>';
  }).join('');
  out.innerHTML='<div class="result"><p>'+esc(data.answer)+'</p>'+(sources?'<ol class="citations">'+sources+'</ol>':'')+'</div>';
  if(data.unavailable?.length)out.insertAdjacentHTML('beforeend','<p class="muted">'+data.unavailable.length+' source documents could not be indexed.</p>');
 } catch(error) {
  if(id!==generation)return;
  out.innerHTML='<div class="result"><p><strong>Research unavailable</strong></p><p>'+esc(error.message)+'</p><button data-action="suggest" data-value="'+esc(question)+'">Retry question</button></div>';
 } finally {submit.disabled=false;}
}

async function reloadBriefing(initial=false) {
 if(refreshing)return;
 refreshing=true;
 if(!initial){refreshMessage='Checking stored files…';briefing();}
 try {
  const [core,prices,synced,figures]=await Promise.all(['events','market','synced','results'].map(name=>readJSON(name+'.json')));
  events=[...core,...synced]; market=prices; quarterly=figures;
  refreshMessage=initial?'':'Stored data reloaded.';
 } catch {
  refreshMessage='Could not reload data. Your last briefing is still visible.';
  if(initial){app.innerHTML='<p>Could not load the briefing data.</p><button data-action="refresh">Retry loading data</button>';return;}
 } finally {refreshing=false;}
 if(initial || !location.hash || location.hash==='#briefing')render();
}
reloadBriefing(true);
