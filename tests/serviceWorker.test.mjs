import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../frontend/public/sw.js',import.meta.url),'utf8');
function worker(network){
  const handlers=new Map(),stores=new Map();
  const key=r=>new URL(typeof r==='string'?r:r.url,'https://app.test').href;
  const caches={
    open:async name=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {put:async(r,v)=>store.set(key(r),v),addAll:async()=>{}};},
    match:async r=>{for(const store of stores.values())if(store.has(key(r)))return store.get(key(r)).clone();},
    keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),
  };
  vm.runInNewContext(source,{self:{addEventListener:(n,f)=>handlers.set(n,f),skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches,fetch:network,URL,Response,console});
  return {handlers,caches,stores,request:async(path,mode='navigate')=>{
    let response;const pending=[];
    handlers.get('fetch')({request:{method:'GET',url:new URL(path,'https://app.test').href,mode},respondWith:p=>{response=p;},waitUntil:p=>pending.push(p)});
    const value=await response;await Promise.all(pending);return value;
  }};
}
test('online navigation replaces a stale cached HTML shell on the first load',async()=>{
  const w=worker(async(_r,options)=>{assert.equal(options.cache,'no-cache');return new Response('new UI');});
  const cache=await w.caches.open('clps-lunar-offline-v2');await cache.put('/trip',new Response('old UI'));
  assert.equal(await (await w.request('/trip')).text(),'new UI');
  assert.equal(await (await w.caches.match('/trip')).text(),'new UI');
});
test('offline navigation retains saved routes and falls back to the saved application shell',async()=>{
  const w=worker(async()=>{throw Error('offline');});
  const cache=await w.caches.open('clps-lunar-offline-v2');await cache.put('/trip',new Response('saved trip'));await cache.put('/index.html',new Response('saved shell'));
  assert.equal(await (await w.request('/trip')).text(),'saved trip');
  assert.equal(await (await w.request('/explorer')).text(),'saved shell');
  const empty=worker(async()=>{throw Error('offline');});assert.equal((await empty.request('/trip')).status,503);
});
test('server failures and release information are never replaced with an old successful build',async()=>{
  const w=worker(async()=>new Response('server unavailable',{status:503}));
  const cache=await w.caches.open('clps-lunar-offline-v2');await cache.put('/trip',new Response('old UI'));await cache.put('/build-info.json',new Response('old release'));
  assert.equal((await w.request('/trip')).status,503);
  assert.equal((await w.request('/build-info.json','cors')).status,503);
});
test('activation clears obsolete app caches while preserving unrelated caches',async()=>{
  const w=worker(async()=>new Response('ok'));
  await w.caches.open('clps-lunar-offline-v1');await w.caches.open('clps-lunar-offline-v2');await w.caches.open('unrelated');
  let pending;w.handlers.get('activate')({waitUntil:p=>{pending=p;}});await pending;
  assert.deepEqual(await w.caches.keys(),['clps-lunar-offline-v2','unrelated']);
});
