const {test}=require('node:test'),assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {serve}=require('../src/server.cjs');
const {MemoryBook}=require('../src/memory.cjs');
const {fixture}=require('./helpers/access-fixture.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function pending(gate){for(let i=0;i<100;i++){if(gate.pending.size)return gate.list()[0];await delay(10);}throw Error('Missing approval');}
async function setup(t){const f=fixture(),book=new MemoryBook();f.gate.notify=()=>{};const server=await serve({port:0,token:'memory-test',gate:f.gate,memories:book,accounts:()=>[{id:'a',label:'Demo'}],client:async()=>f.c});const client=new Client({name:'memory-tests',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+server.address().port+'/mcp'),{requestInit:{headers:{Authorization:'Bearer memory-test'}}}));t.after(async()=>{f.gate.close();await client.close();await new Promise(r=>server.close(r));});return {...f,book,client,call:(name,args={})=>client.callTool({name,arguments:args})};}
function add(book,scope,title,text){book.change({scope,expectedRevision:book.revision,reason:'Owner fixture',changes:[{action:'create',title,text}]});}
const data=response=>JSON.parse(response.content[0].text);

test('HTTP memory accompanies authorized reads and search without exposing unrelated chat notes',async t=>{
 const f=await setup(t);f.rule();const scope={kind:'chat',account:'a',chat:f.ids[0]};add(f.book,{kind:'global'},'General','Be concise.');add(f.book,scope,'Topics','Use the planning topic for releases.');add(f.book,{kind:'chat',account:'a',chat:f.ids[1]},'Private','HIDDEN_NOTE');
 for(const name of ['accessible_chats','messages','search_all']){const response=await f.call(name,{account:'a',...(name==='messages'?{chat:f.ids[0],limit:5}:{})});assert.ok(!response.isError,response.content[0].text);assert.match(response.content[1].text,/planning topic/);assert.match(response.content[1].text,/Be concise/);assert.doesNotMatch(JSON.stringify(response),/HIDDEN_NOTE/);}
 const context=await f.call('chat_context',{account:'a',chat:f.ids[0]});assert.equal(data(context).memory.chat[0].text,'Use the planning topic for releases.');assert.equal(f.gate.pending.size,0);
 const global=await f.call('memory_list',{scope:{kind:'global'}});assert.equal(data(global).memory.chat.length,0);assert.doesNotMatch(JSON.stringify(global),/HIDDEN_NOTE/);
});

test('HTTP chat memory requires read access; directory permission cannot expose private notes',async t=>{
 const f=await setup(t);f.rule({operations:['dialogs'],selector:{}});add(f.book,{kind:'chat',account:'a',chat:f.ids[0]},'Private','HIDDEN_NOTE');
 const listing=await f.call('dialogs',{account:'a',scope:'all'});assert.ok(!listing.isError);assert.doesNotMatch(JSON.stringify(listing),/HIDDEN_NOTE/);
 const request=f.call('chat_context',{account:'a',chat:f.ids[0]});const r=await pending(f.gate);assert.equal(r.operation,'chat');assert.match(r.payload.purpose,/saved owner memory/);f.gate.decide(r.id,false,'No notes');assert.equal((await request).isError,true);
 f.rule({effect:'deny'});const denied=await f.call('chat_context',{account:'a',chat:f.ids[0]});assert.equal(denied.isError,true);assert.equal(f.gate.pending.size,0);
});

test('HTTP exposes maintenance instructions and approved atomic cleanup, rejecting stale proposals',async t=>{
 const f=await setup(t),scope={kind:'global'};add(f.book,scope,'Terminology','Use the legacy project name');add(f.book,scope,'Duplicate','The project still uses its legacy name');const [one,two]=f.book.entries;
 const tools=(await f.client.listTools()).tools;assert.equal(tools.length,58);const description=tools.find(x=>x.name==='memory_propose').description;for(const word of ['concise','updating','contradictory','atomically','consistency'])assert.match(description,new RegExp(word));assert.match(f.client.getInstructions(),/chat_context/);
 const request=f.call('memory_propose',{scope,expectedRevision:f.book.revision,reason:'Owner requested a project rename',changes:[{action:'update',id:one.id,text:'Use the current project name.'},{action:'delete',id:two.id}]});const r=await pending(f.gate);assert.equal(r.operation,'memory_change');assert.equal(f.book.entries.length,2);f.gate.decide(r.id,true);const result=await request;assert.ok(!result.isError);assert.equal(data(result).memory.global.length,1);assert.equal(data(result).memory.global[0].text,'Use the current project name.');
 const stale=await f.call('memory_propose',{scope,expectedRevision:0,reason:'Old revision',changes:[{action:'create',title:'Old',text:'Old'}]});assert.equal(stale.isError,true);assert.equal(f.gate.pending.size,0);
});

test('HTTP write approval displays memory but does not enforce the meaning of its free text',async t=>{
 const f=await setup(t);add(f.book,{kind:'chat',account:'a',chat:f.ids[0]},'Release policy','Do not publish release announcements.');let sent;
 f.c.sendMessage=async(chat,args)=>{sent=args.message;return {id:7,message:args.message};};
 const request=f.call('send',{account:'a',chat:f.ids[0],requestId:'memory-text-test',text:'Version 1.0 is available.'});const r=await pending(f.gate);assert.equal(r.operation,'send');assert.equal(r.payload.ownerMemory.chat[0].text,'Do not publish release announcements.');assert.equal(sent,undefined);f.gate.decide(r.id,true);assert.ok(!(await request).isError);assert.equal(sent,'Version 1.0 is available.');
});
