const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Readable}=require('node:stream');
process.env.LOCAL_DATA='1';
process.env.SESSION_SECRET='test-secret-only';
const repository=require('../lib/repository.cjs');
const published=require('../lib/published.cjs');
const catalog=require('../lib/catalog.cjs');
const state=()=>({added:[{key:'added_one',title:'One',prompt:'Allowed',images:[]},{key:'added_two',title:'Two',prompt:'Secret',images:[]}],order:[],deleted:[],customImgs:{},freeMode:'partial',freePrompts:{added_one:true}});
function request(method='GET',query={},body){const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.query=query;req.headers={host:'example.test'};return req;}
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},end(body){this.body=body;return this;}};}
const json=res=>JSON.parse(res.body.toString());

test('production catalog and readable prompt requests work without any GitHub read',async(t)=>{
  const snapshot=published.compile({...state(),freeMode:'full'},'b'.repeat(40));
  const original=fs.readFileSync;
  t.mock.method(fs,'readFileSync',(file,...rest)=>String(file).endsWith('/content/published.json')?JSON.stringify(snapshot):original(file,...rest));
  const remote=t.mock.method(repository,'read',()=>{throw new Error('No remote read allowed');});
  const previous=process.env.LOCAL_DATA;delete process.env.LOCAL_DATA;
  try{
    const res=response();await require('../api/catalog.js')(request(),res);assert.equal(res.statusCode,200);assert.equal(json(res).revision,snapshot.revision);
    const detail=response();await require('../api/prompt.js')(request('GET',{key:'added_one'}),detail);assert.equal(json(detail).prompt,'Allowed');
    assert.equal(remote.mock.calls.length,0);
  } finally {process.env.LOCAL_DATA=previous;}
});
test('background batch returns only authorized text and rejects oversized batches',async(t)=>{
  t.mock.method(repository,'read',async()=>({state:state(),revision:'a'.repeat(40)}));
  const res=response();await require('../api/prompt.js')(request('POST',{}, {keys:['added_one','added_two','missing']}),res);
  assert.equal(res.statusCode,200);const data=json(res);assert.equal(data.items.length,2);
  assert.equal(data.items[0].prompt,'Allowed');assert.equal(data.items[1].prompt,null);assert.equal(data.items[1].copyEnabled,false);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
  const tooMany=response();await require('../api/prompt.js')(request('POST',{}, {keys:Array(101).fill('added_one')}),tooMany);assert.equal(tooMany.statusCode,400);
});
test('image URLs survive unrelated publications and change with the image content',t=>{
  const manifest=require('../lib/image-manifest.cjs');
  t.mock.method(manifest,'get',src=>({hash:src.endsWith('a.jpg')?'a'.repeat(32):'b'.repeat(32),widths:[320,640]}));
  const a=catalog.imageUrl(repository.RAW+'images/a.jpg',320,'revision-one');
  assert.equal(a,catalog.imageUrl(repository.RAW+'images/a.jpg',320,'revision-two'));
  assert.notEqual(a,catalog.imageUrl(repository.RAW+'images/b.jpg',320,'revision-two'));
  assert(a.startsWith('/media/'));
});
test('metadata cache revisions include image changes and ignore preparation order',()=>{
  const a={hash:'a',widths:[320,640]},b={hash:'b',widths:[320,640]};
  const revision=published.releaseRevision('state',{a,b});
  assert.equal(revision,published.releaseRevision('state',{b,a}));
  assert.notEqual(revision,published.releaseRevision('state',{a:{...a,hash:'changed'},b}));
  assert.notEqual(revision,published.releaseRevision('next-state',{a,b}));
});
test('published page metadata never includes private prompt bodies',()=>{
  const snapshot=published.compile(state(),'r');
  snapshot.stateRevision='saved';
  const result=published.page(published.index(snapshot),{keys:['added_one','added_two']});
  assert.equal(result.stateRevision,'saved');
  assert.equal(result.items.length,2);
  assert(result.items.every(item=>!Object.hasOwn(item,'prompt')));
  assert(!JSON.stringify(result).includes('Secret'));
});
test('copy and dialog join background preload, then read from memory without new requests',async()=>{
  const {createDetailCache}=await import('../src/detail-cache.ts');let one=0,many=0,finish;
  const cache=createDetailCache({one:async(key)=>{one++;return {key};},many:()=>{many++;return new Promise(resolve=>finish=resolve);}});
  cache.setScope('revision:public');const preloading=cache.preload(['one','two']);
  const copying=cache.load('one');const dialog=cache.load('one');finish([{key:'one'},{key:'two'}]);
  await preloading;assert.deepEqual(await copying,{key:'one'});assert.deepEqual(await dialog,{key:'one'});
  await cache.load('one');assert.equal(one,0);assert.equal(many,1);
});
test('cache expiration, capacity and identity changes cannot reuse stale data',async()=>{
  const {createDetailCache}=await import('../src/detail-cache.ts');let time=0,calls=0,finish;
  const cache=createDetailCache({one:async(key)=>{calls++;return {key};},many:()=>new Promise(resolve=>finish=resolve),now:()=>time,ttl:10,capacity:2});
  cache.setScope('a');await cache.load('one');await cache.load('two');await cache.load('three');assert.equal(cache.peek('one'),undefined);
  time=11;assert.equal(cache.peek('two'),undefined);
  const loading=cache.preload(['private']);cache.setScope('logged-out');finish([{key:'private'}]);await loading;assert.equal(cache.peek('private'),undefined);
  await cache.load('two');assert.equal(calls,4);
});
test('closing a dialog does not cancel a copy using the same pending request; failed prefetch retries',async()=>{
  const {createDetailCache}=await import('../src/detail-cache.ts');let finish,calls=0;
  const cache=createDetailCache({one:key=>{calls++;return new Promise(resolve=>finish=()=>resolve({key}));},many:async()=>{throw new Error('offline');}});
  const abort=new AbortController();const dialog=cache.load('one',abort.signal);const copy=cache.load('one');abort.abort();
  await assert.rejects(dialog,{name:'AbortError'});finish();assert.deepEqual(await copy,{key:'one'});assert.equal(calls,1);
  await cache.preload(['two']);const retry=cache.load('two');finish();assert.deepEqual(await retry,{key:'two'});assert.equal(calls,2);
});
test('publication confirmation waits for the deployed revision, not just a saved commit',async()=>{
  const {waitForPublication}=await import('../editor/deployment.mjs');let time=0,calls=0;
  assert.equal(await waitForPublication('new',{read:async()=>({revision:++calls===3?'new':'old'}),now:()=>time,sleep:async()=>{time++;},timeout:10}),true);
  assert.equal(calls,3);
  assert.equal(await waitForPublication('saved',{read:async()=>({revision:'release',stateRevision:'saved'})}),true);
  assert.equal(await waitForPublication('new',{read:async()=>({revision:'old'}),now:()=>time,sleep:async()=>{time++;},timeout:2}),false);
});
