const {test}=require('node:test'),assert=require('node:assert/strict');
const {serve}=require('../src/server.cjs');
const {Jobs}=require('../src/jobs.cjs');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {fixture}=require('./helpers/access-fixture.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){const v=fn();if(v)return v;await wait(10);}throw Error('Timed out');}
async function setup(t){
 const f=fixture(),jobs=new Jobs(),server=await serve({port:0,token:'access-test',gate:f.gate,jobs,accounts:()=>[{id:'a',label:'Demo'}],client:async()=>f.c});
 const client=new Client({name:'permission-scope-test',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+server.address().port+'/mcp'),{requestInit:{headers:{Authorization:'Bearer access-test'}}}));
 t.after(async()=>{f.gate.close();await client.close();await new Promise(r=>server.close(r));});
 const call=async(name,args={})=>{const response=await client.callTool({name,arguments:{account:'a',...args}});assert.ok(!response.isError,response.content[0].text);return JSON.parse(response.content[0].text);};
 return {...f,jobs,client,call};
}

test('HTTP default discovery/search work with chat permission and no directory permission',async t=>{
 const f=await setup(t);f.rule();
 assert.match(f.client.getInstructions(),/accessible_chats/);
 const tools=(await f.client.listTools()).tools;assert.ok(tools.some(x=>x.name==='accessible_chats'));assert.equal(tools.find(x=>x.name==='search_all').inputSchema.properties.scope.default,'permitted');
 for(const name of ['accessible_chats','dialogs']){const r=await f.call(name);assert.equal(r.scope,'permitted');assert.deepEqual(r.items.map(x=>x.id),[f.ids[0]]);}
 const search=await f.call('search_all',{query:'news',chatLimit:20});assert.deepEqual(search.results.map(x=>x.chatId),[f.ids[0]]);assert.equal(f.gate.pending.size,0);assert.deepEqual(f.calls.messages,[f.ids[0]]);
 const unknown=await f.client.callTool({name:'accessible_chats',arguments:{account:'missing'}});assert.equal(unknown.isError,true);
 const invalid=await f.client.callTool({name:'accessible_chats',arguments:{account:'a',operation:'send'}});assert.equal(invalid.isError,true);
});

test('HTTP expanded scope still asks and rejecting it does not read messages',async t=>{
 const f=await setup(t);f.rule();f.gate.notify=()=>{};
 const request=f.client.callTool({name:'search_all',arguments:{account:'a',scope:'all',query:'news'}});
 const pending=await until(()=>f.gate.list()[0]);assert.equal(pending.operation,'search_all_discovery');assert.deepEqual(f.calls.messages,[]);
 f.gate.decide(pending.id,false,'Stay within allowed chats');const response=await request;assert.equal(response.isError,true);assert.match(response.content[0].text,/Stay within/);
 const list=f.client.callTool({name:'dialogs',arguments:{account:'a',scope:'all'}});const directory=await until(()=>f.gate.list()[0]);assert.equal(directory.operation,'dialogs');f.gate.decide(directory.id,false);assert.equal((await list).isError,true);
});

test('HTTP background results honor revoked permissions without new approvals and can be cancelled',async t=>{
 const f=await setup(t);f.rule({selector:{types:['Channel']}});
 const started=await f.call('search_start',{chatLimit:1,limit:10});await until(()=>f.jobs.get(started.jobId).status==='completed');
 const first=await f.call('job_result',{jobId:started.jobId});assert.equal(first.results.length,1);assert.ok(first.nextCursor);
 f.rule({effect:'deny',selector:{}});
 const revoked=await f.call('job_result',{jobId:started.jobId});assert.deepEqual(revoked.results,[]);assert.equal(revoked.nextCursor,null);assert.equal(f.gate.pending.size,0);
 const status=await f.call('job_status',{jobId:started.jobId});assert.equal(status.nextCursor,undefined);
 f.gate.rules.rules.pop();let release,entered=false;f.c.iterMessages=async function*(){entered=true;await new Promise(r=>release=r);yield {id:1,date:100,message:'cancelled data'};};
 const cancellable=await f.call('search_start');await until(()=>entered);await f.call('job_cancel',{jobId:cancellable.jobId});release();await wait(30);
 const cancelled=await f.call('job_result',{jobId:cancellable.jobId});assert.equal(cancelled.status,'cancelled');assert.deepEqual(cancelled.results,[]);
});
