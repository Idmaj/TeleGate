const {test}=require('node:test');const assert=require('node:assert/strict');
const {serve}=require('../src/server.cjs'),{Gate}=require('../src/gate.cjs');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');

function barrier(){let release,entered;return {ready:new Promise(r=>entered=r),wait:new Promise(r=>release=r),enter:()=>entered(),release:()=>release()};}
async function fixture(mock,fn){
 const gate=new Gate(()=>{}),server=await serve({port:0,token:'synthetic-review-token',gate,accounts:()=>[{id:'a',label:'Fixture'}],client:async()=>mock});
 const client=new Client({name:'security-fixture',version:'1'});
 try{await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+server.address().port+'/mcp'),{requestInit:{headers:{Authorization:'Bearer synthetic-review-token'}}}));await fn(gate,client);}
 finally{gate.close();await client.close();await new Promise(r=>server.close(r));}
}
const allow=gate=>gate.rules.change({action:'create',rule:{name:'Fixture allow',account:'a',effect:'allow',operations:['read_all'],selector:{chats:['1']}}});
const deny=gate=>gate.rules.change({action:'create',rule:{name:'Fixture deny',account:'a',effect:'deny',operations:['read_all'],selector:{chats:['1']}}});
async function pending(gate){for(let i=0;i<100;i++){if(gate.pending.size)return gate.list()[0];await new Promise(r=>setTimeout(r,5));}throw Error('Approval did not arrive');}

for(const operation of ['messages','chat','download'])test('HTTP withholds '+operation+' if access is revoked during network I/O',async()=>{
 const b=barrier(),secret='SYNTHETIC_WITHHELD_CONTENT';
 const mock={getEntity:async()=>{if(operation==='chat'){b.enter();await b.wait;}return {title:secret};},async *iterMessages(){b.enter();await b.wait;yield {id:1,date:1,message:secret};},getMessages:async()=>[{id:1,media:{}}],downloadMedia:async()=>{b.enter();await b.wait;return Buffer.from(secret);}};
 await fixture(mock,async(gate,client)=>{allow(gate);const call=client.callTool({name:operation,arguments:{account:'a',chat:'1',...(operation==='download'?{messageId:1}:{})}});await b.ready;deny(gate);b.release();const result=await call;assert.equal(result.isError,true);assert.match(result.content[0].text,/permission changed/);assert.ok(!JSON.stringify(result).includes(secret));});
});

test('HTTP preserves an unchanged one-time approval but withholds it after a rule change',async()=>{
 for(const change of [false,true]){const b=barrier();await fixture({getEntity:async()=>{b.enter();await b.wait;return {title:'SYNTHETIC_ALLOWED_CONTENT'};}},async(gate,client)=>{
  const call=client.callTool({name:'chat',arguments:{account:'a',chat:'1'}}),request=await pending(gate);gate.decide(request.id,true);await b.ready;if(change)deny(gate);b.release();const result=await call;
  if(change)assert.equal(result.isError,true);else{assert.ok(!result.isError);assert.match(result.content[0].text,/SYNTHETIC_ALLOWED_CONTENT/);assert.ok(!JSON.stringify(result).includes('authority'));}
 });}
});

test('HTTP attachment approval cannot bypass review or export requirements',async()=>{
 let sends=0;await fixture({sendFile:async()=>{sends++;return {id:1};}},async(gate,client)=>{
  const call=client.callTool({name:'send_media',arguments:{account:'a',chat:'1',requestId:'synthetic-file-1',filename:'binary.bin',base64:Buffer.from([0,1,2,3]).toString('base64')}}),request=await pending(gate);
  assert.equal(request.attachments[0].requiresExport,true);
  assert.throws(()=>gate.decide(request.id,true,'',false,true),/Inspect every attachment/);assert.equal(sends,0);
  gate.decide(request.id,false);assert.equal((await call).isError,true);assert.equal(sends,0);
 });
});

test('HTTP refuses a forward whose source changed while approval was pending',async()=>{
 let text='Original fixture',forwards=0;
 await fixture({getMessages:async()=>[{id:7,message:text}],forwardMessages:async()=>{forwards++;return [];}},async(gate,client)=>{
  allow(gate);const call=client.callTool({name:'forward',arguments:{account:'a',fromChat:'1',chat:'2',ids:[7],requestId:'synthetic-forward'}}),request=await pending(gate);
  assert.equal(request.payload.forwardPreview[0].text,text);text='Changed fixture';gate.decide(request.id,true);
  assert.equal((await call).isError,true);assert.equal(forwards,0);
 });
});
