const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Api}=require('telegram');
const bigInt=require('big-integer');
const {getPeerId}=require('telegram/Utils');
const {Gate}=require('../src/gate.cjs');
const access=require('../src/access.cjs');
const permitted=require('../src/permitted-search.cjs');

const {fixture}=require('./helpers/access-fixture.cjs');

test('permitted directory is empty by default and directory-only permission cannot reveal message scopes',async()=>{
 const f=fixture();assert.deepEqual((await access.list(f.c,f.gate,'a')).items,[]);
 f.rule({operations:['group:directory'],selector:{}});
 assert.deepEqual((await access.list(f.c,f.gate,'a')).items,[]);assert.equal(f.gate.pending.size,0);assert.deepEqual(f.calls.messages,[]);
});

test('discovery returns only allowed identity fields, supports filters/paging and batches metadata',async()=>{
 const f=fixture();f.rule({selector:{types:['Channel']}});f.rule({effect:'deny',selector:{chats:[f.ids[1]]}});
 const first=await access.list(f.c,f.gate,'a',{query:'News',type:'channel',limit:1});
 assert.deepEqual(first.items.map(x=>x.id),[f.ids[0]]);assert.equal(first.nextOffset,1);
 assert.equal(f.calls.dialogs,1);assert.equal(f.calls.folders,1);assert.equal(first.items[0].folders[1].title,'News');
 const second=await access.list(f.c,f.gate,'a',{query:'News',type:'channel',offset:1,limit:1});assert.deepEqual(second.items.map(x=>x.id),[f.ids[2]]);assert.equal(second.nextOffset,null);
 assert.doesNotMatch(JSON.stringify([first,second]),/SECRET|Private News|Private Person|scanned|unread|phone/);
 assert.deepEqual((await access.list(f.c,f.gate,'b')).items,[]);
});

test('operation-specific grants do not expand to message search or other accounts; revoke/expiry/ask apply',async()=>{
 const f=fixture(),key=JSON.stringify(['a','operation-chat',f.ids[0],'messages']);
 f.gate.grants.set(key,{key,kind:'operation-chat',account:'a',chat:f.ids[0],operation:'messages',expires:null});
 const result=await access.list(f.c,f.gate,'a');assert.deepEqual(result.items[0].allowedOperations,['messages']);
 assert.deepEqual((await access.list(f.c,f.gate,'a',{operation:'search'})).items,[]);
 assert.deepEqual((await access.list(f.c,f.gate,'b')).items,[]);
 f.rule({effect:'ask',operations:['messages']});assert.deepEqual((await access.list(f.c,f.gate,'a')).items,[]);
 f.gate.rules.rules=[];f.gate.grants.get(key).expires=Date.now()-1;assert.deepEqual((await access.list(f.c,f.gate,'a')).items,[]);assert.equal(f.gate.grants.size,0);
 f.gate.grants.set(key,{key,kind:'operation-chat',account:'a',chat:f.ids[0],operation:'messages',expires:null});f.gate.revoke(key);assert.deepEqual((await access.list(f.c,f.gate,'a')).items,[]);
});

test('public channel discovery uses Telegram type/username; disabled/expired/excluded rules never allow',async()=>{
 const f=fixture();f.rule({selector:{types:['Channel'],publicOnly:true,excludeChats:[f.ids[2]]}});
 assert.deepEqual((await access.list(f.c,f.gate,'a')).items.map(x=>x.id),[f.ids[0]]);
 f.gate.rules.rules[0].expires=Date.now()-1;assert.deepEqual((await access.list(f.c,f.gate,'a')).items,[]);
 f.gate.rules.rules[0].expires=null;f.gate.rules.rules[0].enabled=false;assert.deepEqual((await access.list(f.c,f.gate,'a')).items,[]);
});

test('folder permissions follow additions/removals and explicit exclusions without directory grants',async()=>{
 const f=fixture();f.rule({selector:{folderIds:[2],excludeChats:[f.ids[2]]}});
 assert.deepEqual((await access.list(f.c,f.gate,'a')).items.map(x=>x.id),[f.ids[0]]);
 f.filters[0].includePeers.push(f.ds[1].entity,f.ds[2].entity);
 assert.deepEqual((await access.list(f.c,f.gate,'a',{folderId:2})).items.map(x=>x.id),[f.ids[0],f.ids[1]]);
 f.filters[0].includePeers.shift();assert.deepEqual((await access.list(f.c,f.gate,'a')).items.map(x=>x.id),[f.ids[1]]);
 assert.equal(f.gate.pending.size,0);
});

test('failed folder lookup cannot bypass a folder deny with a broad allow',async()=>{
 const f=fixture();f.rule({selector:{}});f.rule({effect:'deny',selector:{folderIds:[2]}});f.c.invoke=async()=>{throw Error('Offline');};
 const result=await access.list(f.c,f.gate,'a');assert.deepEqual(result.items,[]);assert.match(result.notice,/unavailable/);
 f.gate.rules.rules.pop();assert.equal((await access.list(f.c,f.gate,'a')).items.length,4);
});

test('explicitly allowed public chat outside dialogs can be discovered without exposing other entities',async()=>{
 const f=fixture(),entity=new Api.Channel({id:bigInt(10),title:'External News',broadcast:true,username:'external_news'}),id=getPeerId(entity).toString();
 f.rule({selector:{chats:[id]}});f.c.getEntity=async target=>{assert.equal(target,id);return entity;};
 assert.deepEqual((await access.list(f.c,f.gate,'a')).items.map(x=>x.id),[id]);
});

test('permitted search reads only authorized targets, omits ask/deny and does not request discovery',async()=>{
 const f=fixture();f.rule({operations:['search'],selector:{types:['Channel']}});f.rule({effect:'ask',operations:['search'],selector:{chats:[f.ids[1]]}});f.rule({effect:'deny',operations:['search'],selector:{chats:[f.ids[2]]}});
 const result=await permitted.search(f.c,f.gate,{account:'a',query:'news',chats:f.ids,limit:10});
 assert.deepEqual(f.calls.messages,[f.ids[0]]);assert.deepEqual(result.results.map(x=>x.chatId),[f.ids[0]]);assert.equal(result.nextCursor,null);assert.equal(f.gate.pending.size,0);assert.match(result.coverage,/not a search of your entire/);
 assert.doesNotMatch(JSON.stringify(result),/Private News|Other News|Private Person/);
});

test('permission revoked while search is in flight withholds results and unauthorized continuation',async()=>{
 const f=fixture();f.rule({operations:['search'],selector:{types:['Channel']}});
 f.c.iterMessages=async function*(id){f.calls.messages.push(id);f.rule({effect:'deny',operations:['search'],selector:{}});yield {id:42,date:1000,message:'REVOKED_RESULT'};};
 const result=await permitted.search(f.c,f.gate,{account:'a',chatLimit:1});assert.deepEqual(result.results,[]);assert.equal(result.nextCursor,null);assert.doesNotMatch(JSON.stringify(result),/REVOKED_RESULT/);assert.equal(f.gate.pending.size,0);
});

test('permitted cursor survives revoked preceding chats and resumes within an authorized chat',async()=>{
 const f=fixture();f.rule({operations:['search'],selector:{types:['Channel']}});
 const first=await permitted.search(f.c,f.gate,{account:'a',chatLimit:1,limit:10});assert.equal(first.nextCursor.chatId,f.ids[1]);
 f.rule({effect:'deny',operations:['search'],selector:{chats:[f.ids[0]]}});
 const second=await permitted.search(f.c,f.gate,{account:'a',chatLimit:1,limit:10,cursor:first.nextCursor});assert.equal(second.results[0].chatId,f.ids[1]);assert.equal(second.nextCursor.chatId,f.ids[2]);
 f.c.iterMessages=async function*(id,opts){f.calls.messages.push(id);yield {id:opts.offsetId?opts.offsetId-1:42,date:1000,message:'page'};};
 const page=await permitted.search(f.c,f.gate,{account:'a',chats:[f.ids[1]],chatLimit:1,limit:1});assert.equal(page.nextCursor.offsetId,42);
 const next=await permitted.search(f.c,f.gate,{account:'a',chats:[f.ids[1]],chatLimit:1,limit:1,cursor:page.nextCursor});assert.equal(next.results[0].items[0].id,41);
});

test('pause before and during permitted reads fails closed',async()=>{
 const f=fixture();f.rule();f.gate.rules.pause('a',true);await assert.rejects(access.list(f.c,f.gate,'a'),/paused/);assert.equal(f.calls.dialogs,0);
 f.gate.rules.pause('a',false);f.c.iterMessages=async function*(){f.gate.rules.pause('*',true);yield {id:1,message:'blocked'};};
 await assert.rejects(permitted.search(f.c,f.gate,{account:'a'}),/paused/);
});
