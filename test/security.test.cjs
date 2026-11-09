const {test}=require('node:test'),assert=require('node:assert/strict');
const {Gate}=require('../src/gate.cjs'),review=require('../src/attachment-review.cjs');
const {revokeSession}=require('../src/account-removal.cjs');
const {Api}=require('telegram');

test('revoked or expired saved permission cannot release an in-flight read',async()=>{
 for(const mode of ['revoke','expire']){const gate=new Gate(()=>{}),key=JSON.stringify(['a','chat','1']);gate.grants.set(key,{key,kind:'chat',account:'a',chat:'1',expires:Date.now()+60000});const receipt=await gate.authorize('a','1','messages',{});
  if(mode==='revoke')gate.revoke(key);else gate.grants.get(key).expires=Date.now()-1;
  await assert.rejects(gate.validateRead(receipt),/permission changed/);
 }
});
test('one-time authorization becomes invalid after policy revision even if it returns to Ask',async()=>{
 const gate=new Gate(()=>{}),call=gate.authorize('a','1','messages',{});await new Promise(r=>setImmediate(r));gate.decide(gate.list()[0].id,true);const receipt=await call;
 gate.rules.pause('a',true);gate.rules.pause('a',false);await assert.rejects(gate.validateRead(receipt),/permission changed/);
});
test('automatic reconciliation is not mistaken for a one-time owner approval',async()=>{
 const gate=new Gate(()=>{}),call=gate.authorize('a','1','messages',{});await new Promise(r=>setImmediate(r));
 gate.rules.change({action:'create',rule:{name:'Temporary fixture',account:'a',effect:'allow',operations:['messages'],selector:{chats:['1']},expires:Date.now()+60000}});
 await gate.reconcile();const receipt=await call;assert.equal(receipt.explicit,false);
 gate.rules.rules[0].expires=Date.now()-1;await assert.rejects(gate.validateRead(receipt),/permission changed/);
});
test('attachment review preserves safe text and image bytes, bounds previews and requires export for binaries',()=>{
 const [text]=review.review({filename:'fixture.txt',base64:Buffer.from('<script>fixture</script>').toString('base64')});assert.equal(text.text,'<script>fixture</script>');assert.equal(text.requiresExport,false);assert.equal(text.sha256.length,64);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';assert.equal(review.review({base64:png})[0].image,'data:image/png;base64,'+png);
 for(const data of [Buffer.from([0,1,2]),Buffer.alloc(256*1024+1,65)])assert.equal(review.review({base64:data.toString('base64')})[0].requiresExport,true);
 assert.throws(()=>review.decode({base64:'!!!!'}),/encoding/);assert.throws(()=>review.decode({base64:'AAAA===='}),/encoding/);
 assert.throws(()=>review.decode({base64:Buffer.alloc(10*1024*1024+1).toString('base64')}),/10 MB/);
});
test('session revocation invokes Telegram logout and propagates network failures',async()=>{
 let calls=0;await revokeSession({invoke:async request=>{assert.ok(request instanceof Api.auth.LogOut);calls++;return new Api.auth.LoggedOut({});}});assert.equal(calls,1);
 await assert.rejects(revokeSession({invoke:async()=>{throw Error('Synthetic offline');}}),/offline/);
 await revokeSession({invoke:async()=>{throw Object.assign(Error('Already revoked'),{errorMessage:'SESSION_REVOKED'});}});
});
