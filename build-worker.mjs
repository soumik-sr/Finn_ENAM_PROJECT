import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { html:'text/html', css:'text/css', js:'text/javascript', json:'application/json' };
const assets = {};
const publicFiles=new Set(['index.html','app.js','style.css','coverage.json','events.json','synced.json','market.json','results.json','research-cache.json']);
for (const name of await readdir(new URL('dist/', import.meta.url))) {
  const type = types[name.split('.').pop()];
  if (!type || !publicFiles.has(name)) continue;
  assets['/'+name] = [type, await readFile(new URL('dist/'+name,import.meta.url),'utf8')];
}
await build({
  absWorkingDir:root, entryPoints:['worker.mjs'], outfile:'dist/server/index.js',
  platform:'browser', format:'esm', target:'es2022', bundle:true, minify:true,
  plugins:[{ name:'site-assets', setup(b) {
    b.onResolve({filter:/^finn:assets$/},()=>({path:'assets',namespace:'finn'}));
    b.onLoad({filter:/.*/,namespace:'finn'},()=>({loader:'json',contents:JSON.stringify(assets)}));
  }}]
});
