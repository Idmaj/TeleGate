const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const C=require('../src/sync-core.cjs'),L=require('../src/sync-local.cjs');const {SyncService}=require('../src/sync-service.cjs');const {ruleSchema}=require('../src/rules.cjs');
const key=Buffer.alloc(32,7).toString('base64'),workspace=randomUUID();
const note=(id='note',text='Use the planning topic')=>({id,scope:{kind:'global'},title:'Project context',text,created:1,updated:1});
const rule=(effect='allow')=>ruleSchema.parse({id:'rule',name:'Project reads',account:'tg:12345',effect,operations:['messages'],selector:{chats:['-10012345']}});
test('sync encryption authenticates ciphertext, passphrase and workspace',async()=>{
 const salt='12'.repeat(16),derived=await C.deriveKey('a long shared test passphrase',salt);assert.equal(derived,await C.deriveKey('a long shared test passphrase',salt));await assert.rejects(C.deriveKey('short',salt));
 const encrypted=C.seal({text:'confidential note'},derived,workspace);assert.ok(!encrypted.includes('confidential'));assert.deepEqual(C.open(encrypted,derived,workspace),{text:'confidential note'});
 assert.throws(()=>C.open(encrypted,key,workspace),/authenticate/);assert.throws(()=>C.open(encrypted,derived,randomUUID()),/workspace/);const tampered=JSON.parse(encrypted);tampered.data=Buffer.from('changed').toString('base64');assert.throws(()=>C.open(Buffer.from(JSON.stringify(tampered)),derived,workspace));
});
test('causal merge preserves concurrent edits and resolves them without clock-time ordering',()=>{
 const a=C.newState(),b=C.newState();C.write(a.records,'memory:note',note(),a.device);b.records=structuredClone(a.records);
 C.write(a.records,'memory:note',note('note','local'),a.device);C.write(b.records,'memory:note',note('note','remote'),b.device);
 const merged=C.merge(a.records,b.records);assert.equal(merged['memory:note'].length,2);assert.deepEqual(merged,C.merge(b.records,a.records));
 C.write(merged,'memory:note',note('note','resolved'),a.device);assert.equal(C.merge(merged,b.records)['memory:note'].length,1);
 const collision=structuredClone(merged);collision['memory:note'][0].value.text='tampered';assert.throws(()=>C.merge(merged,collision),/same device version/);
});
test('tombstones stop an offline device resurrecting deleted memory',()=>{
 const a=C.newState(),b=C.newState();C.write(a.records,'memory:note',note(),a.device);b.records=structuredClone(a.records);C.write(a.records,'memory:note',null,a.device);
 const merged=C.merge(a.records,b.records);assert.equal(merged['memory:note'][0].value,null);
 b.records=merged;b.base={'memory:note':note()};const projected=C.project(b,b.base,()=>true);assert.deepEqual(projected,{});C.capture(b,{});assert.equal(b.records['memory:note'][0].value,null);
});
test('remote allow rules and saved grants require review; deny additions and grant revocation apply automatically',()=>{
 const s=C.newState();C.write(s.records,'rule:rule',rule(),s.device);let p=C.project(s,{},()=>true);assert.deepEqual(p,{});assert.equal(s.pending.length,1);
 C.write(s.records,'rule:rule',rule('deny'),s.device);p=C.project(s,{},()=>true);assert.equal(p['rule:rule'].effect,'deny');assert.equal(s.pending.length,0);
 C.write(s.records,'rule:rule',null,s.device);p=C.project(s,{'rule:rule':rule('deny')},()=>true);assert.equal(p['rule:rule'].effect,'deny');assert.equal(s.pending.length,1);
 const g={kind:'chat',account:'tg:12345',chat:'-10012345',expires:5000};const t=C.newState();C.write(t.records,'grant:g',g,t.device);assert.deepEqual(C.project(t,{},()=>true),{});assert.equal(t.pending.length,1);
 C.write(t.records,'grant:g',null,t.device);assert.deepEqual(C.project(t,{'grant:g':g},()=>true),{});
});
test('account mappings are stable across installations; secrets and pauses are not exported',()=>{
 const mapA=L.accountMap([{id:'local-a',telegramId:'12345',session:'secret'}]),mapB=L.accountMap([{id:'other-b',telegramId:'12345'}]);
 const n={...note(),scope:{kind:'chat',account:'local-a',chat:'-10012345'}},r={...rule(),account:'local-a',uses:19};const g={key:'local-key',kind:'chat',account:'local-a',chat:'-10012345',expires:1234};
 const collected=L.collect({rules:[r],memories:[n],grants:[g]},mapA);assert.equal(collected['memory:note'].scope.account,'tg:12345');assert.ok(!JSON.stringify(collected).includes('secret'));assert.ok(!JSON.stringify(collected).includes('uses'));
 const result=L.materialize(collected,mapB,{rules:[],memories:[],grants:[]});assert.equal(result.rules[0].account,'other-b');assert.equal(result.memories[0].scope.account,'other-b');assert.equal(result.grants[0].expires,1234);assert.equal(result.grants[0].key,JSON.stringify(['other-b','chat','-10012345']));
 assert.throws(()=>L.accountMap([{id:'a',telegramId:'1'},{id:'b',telegramId:'1'}]),/duplicate/);
 const unavailable=L.accountMap([]);assert.deepEqual(L.collect({rules:[],memories:[],grants:[]},unavailable,collected),collected);
});
function network(){let id=0;const messages=[];return {messages,transport:()=>({verify:async()=>{},checkHeader:async()=>{},read:async cursor=>({files:messages.filter(m=>m.id>cursor),cursor:id,hasMore:false}),send:async buffer=>{messages.push({id:++id,buffer});return id;},remove:async ids=>{for(const n of ids){const i=messages.findIndex(m=>m.id===n);if(i>=0)messages.splice(i,1);}}})};}
function device(net,autoPermissions=false){let saved={enabled:true,autoPermissions,key,workspace,state:C.newState()},current={};const svc=new SyncService({load:()=>saved,commit:(s,data)=>{saved=structuredClone(s);if(data)current=structuredClone(data);},current:()=>structuredClone(current),mapping:async()=>({canMap:()=>true}),transport:async()=>net.transport()});return {svc,get saved(){return saved;},get current(){return current;},set current(v){current=v;}};}
test('two devices synchronize notes, review access, resolve conflicts and retain three own snapshots',async()=>{
 const net=network(),a=device(net),b=device(net);a.current={'memory:note':note(),'rule:rule':rule()};await a.svc.run();await b.svc.run();assert.equal(b.current['memory:note'].text,note().text);assert.ok(!b.current['rule:rule']);assert.equal(b.saved.state.pending.length,1);
 let p=b.saved.state.pending[0];await b.svc.review({id:p.id,fingerprint:p.fingerprint,index:0});assert.equal(b.current['rule:rule'].effect,'allow');
 a.current['memory:note']=note('note','A');b.current['memory:note']=note('note','B');await a.svc.run();await b.svc.run();p=b.saved.state.pending.find(p=>p.id==='memory:note');assert.equal(p.versions.length,2);await b.svc.review({id:p.id,fingerprint:p.fingerprint,index:p.versions.findIndex(v=>v.value.text==='B')});await b.svc.run();await a.svc.run();assert.equal(a.current['memory:note'].text,'B');
 for(let i=0;i<5;i++){a.current['memory:note']=note('note','Change '+i);await a.svc.run();}assert.equal(a.saved.state.ownMessages.length,3);assert.ok(net.messages.some(m=>b.saved.state.ownMessages.includes(m.id)));
 delete a.current['memory:note'];await a.svc.run();await b.svc.run();assert.ok(!b.current['memory:note']);
});
test('reject is local, stale reviews fail, and unrelated edits during a review are still published',async()=>{
 const net=network(),a=device(net),b=device(net);a.current={'rule:rule':rule()};await a.svc.run();await b.svc.run();const p=b.saved.state.pending[0];b.current['memory:note']=note();await b.svc.review({id:p.id,fingerprint:p.fingerprint,reject:true});assert.ok(b.saved.state.records['memory:note']);await b.svc.run();assert.equal(b.saved.state.pending.length,0);assert.ok(!b.current['rule:rule']);await a.svc.run();assert.equal(a.current['rule:rule'].effect,'allow');assert.equal(a.current['memory:note'].title,note().title);await assert.rejects(b.svc.review({id:p.id,fingerprint:p.fingerprint,index:0}),/changed/);
});
test('failed uploads preserve local changes and retry safely; corrupted input does not advance cursor',async()=>{
 const net=network(),a=device(net);a.current={'memory:note':note()};const normal=net.transport;net.transport=()=>({...normal(),send:async()=>{throw Error('Offline');}});await a.svc.run();assert.match(a.svc.error,/Offline/);assert.ok(a.saved.state.records['memory:note']);net.transport=normal;a.svc.retryAt=0;await a.svc.run();assert.equal(a.svc.error,null);
 net.messages.push({id:999,buffer:Buffer.from('invalid')});const cursor=a.saved.state.cursor;await a.svc.run();assert.ok(a.svc.error);assert.equal(a.saved.state.cursor,cursor);assert.equal(a.current['memory:note'].title,note().title);
});
test('unmapped accounts wait for sign-in and malformed records are rejected',()=>{
 const s=C.newState();const n={...note(),scope:{kind:'chat',account:'tg:12345',chat:'-10012345'}};C.write(s.records,'memory:note',n,s.device);assert.deepEqual(C.project(s,{},()=>false),{});assert.equal(s.pending[0].blocked,true);
 const invalid=structuredClone(s.records);invalid['memory:note'][0].value.scope.account='local-id';assert.throws(()=>C.validateRecords(invalid),/stable/);assert.throws(()=>C.validateRecords({'memory:x':[]}),/Invalid/);assert.deepEqual(C.validateRecords(s.records),s.records);
});
test('restart preserves merge clocks and offline edits; persistence errors leave the old projection intact',async()=>{
 const net=network(),a=device(net);a.current={'memory:note':note()};await a.svc.run();let saved=structuredClone(a.saved),current=structuredClone(a.current),fail=true;
 current['memory:note']=note('note','Edited while offline');
 const service=new SyncService({load:()=>saved,current:()=>structuredClone(current),mapping:async()=>({canMap:()=>true}),transport:async()=>net.transport(),commit:(next,data)=>{if(fail)throw Error('Disk unavailable');saved=structuredClone(next);if(data)current=structuredClone(data);}});
 await service.run();assert.match(service.error,/Disk/);assert.equal(current['memory:note'].text,'Edited while offline');assert.equal(saved.state.base['memory:note'].text,note().text);
 fail=false;service.retryAt=0;await service.run();assert.equal(service.error,null);const b=device(net);await b.svc.run();assert.equal(b.current['memory:note'].text,'Edited while offline');assert.equal(saved.state.device,a.saved.state.device);
});


test('permission sync defaults to manual review and automatic access requires explicit opt-in',async()=>{
 const net=network(),a=device(net),b=device(net);delete b.saved.autoPermissions;
 assert.equal(b.svc.status().autoPermissions,false);
 a.current={'rule:rule':rule()};await a.svc.run();await b.svc.run();assert.ok(!b.current['rule:rule']);assert.equal(b.saved.state.pending.length,1);b.saved.autoPermissions=true;await b.svc.run();assert.equal(b.current['rule:rule'].effect,'allow');assert.equal(b.saved.state.pending.length,0);
 b.saved.autoPermissions=false;const grant={kind:'chat',account:'tg:12345',chat:'-10012345',expires:null};a.current['grant:g']=grant;
 await a.svc.run();await b.svc.run();assert.ok(!b.current['grant:g']);assert.equal(b.saved.state.pending.length,1);assert.equal(b.svc.status().autoPermissions,false);
 b.saved.autoPermissions=true;await b.svc.run();assert.deepEqual(b.current['grant:g'],grant);assert.equal(b.saved.state.pending.length,0);
});

test('automatic access sync still preserves concurrent choices and waits for account mappings',()=>{
 const s=C.newState(),other=C.newState();C.write(s.records,'rule:rule',rule(),s.device);other.records=structuredClone(s.records);C.write(s.records,'rule:rule',rule('deny'),s.device);C.write(other.records,'rule:rule',rule('ask'),other.device);s.records=C.merge(s.records,other.records);
 assert.deepEqual(C.project(s,{},()=>true,true),{});assert.equal(s.pending[0].versions.length,2);
 const t=C.newState();C.write(t.records,'rule:rule',rule(),t.device);assert.deepEqual(C.project(t,{},()=>false,true),{});assert.equal(t.pending[0].blocked,true);
});
