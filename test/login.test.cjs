const test=require('node:test'),assert=require('node:assert/strict');
const {Api}=require('telegram');
const {LoginService}=require('../src/login.cjs');
const credentials={apiId:123,apiHash:'a'.repeat(32),phone:'+15551234567',label:'Test account'};
const sent=(hash='first',extra={})=>({phoneCodeHash:hash,type:new Api.auth.SentCodeTypeApp({length:5}),timeout:30,nextType:new Api.auth.CodeTypeSms(),...extra});
function fixture(invoke){let time=100000;const completed=[],released=[],calls=[];const c={invoke:async request=>{calls.push(request);return invoke(request);}};const service=new LoginService({connect:async()=>c,release:async id=>released.push(id),complete:async(...args)=>completed.push(args),now:()=>time,checkPassword:async(info,password)=>({info,password})});return {service,completed,released,calls,advance:ms=>time+=ms};}
const rpc=code=>Object.assign(Error(code),{errorMessage:code});

test('login exposes delivery metadata, keeps invalid codes retryable and persists only after authorization',async t=>{
 const f=fixture(request=>{if(request instanceof Api.auth.SendCode)return sent();if(request.phoneCode==='11111')throw rpc('PHONE_CODE_INVALID');return {user:{id:42}};});t.after(()=>f.service.cancel());
 let status=await f.service.start(credentials);assert.equal(status.step,'code');assert.equal(status.delivery,'auth.SentCodeTypeApp');assert.equal(status.nextDelivery,'auth.CodeTypeSms');assert.equal(status.codeLength,5);assert.ok(!JSON.stringify(status).includes(credentials.apiHash));
 status=await f.service.answer(status.id,'11111');assert.match(status.error,/incorrect/);assert.equal(f.completed.length,0);
 status=await f.service.answer(status.id,'22222');assert.equal(status.step,'done');assert.equal(f.completed.length,1);assert.equal(f.service.active,false);assert.equal(f.released.length,1);
});
test('password hint is returned, wrong passwords can be retried and SRP parameters are refreshed',async t=>{
 let checks=0,parameters=0;const f=fixture(request=>{if(request instanceof Api.auth.SendCode)return sent();if(request instanceof Api.auth.SignIn)throw rpc('SESSION_PASSWORD_NEEDED');if(request instanceof Api.account.GetPassword)return {hint:'My <private> hint',parameters:++parameters};if(++checks===1)throw rpc('PASSWORD_HASH_INVALID');return {user:{id:42}};});t.after(()=>f.service.cancel());
 let s=await f.service.start(credentials);s=await f.service.answer(s.id,'12345');assert.equal(s.step,'password');assert.equal(s.hint,'My <private> hint');
 s=await f.service.answer(s.id,'wrong');assert.equal(s.step,'password');assert.match(s.error,/incorrect/);assert.ok(!JSON.stringify(s).includes('wrong'));
 s=await f.service.answer(s.id,'correct password');assert.equal(s.step,'done');assert.equal(parameters,3);assert.equal(f.completed.length,1);
});
test('resend enforces cooldown and uses the newest code hash',async t=>{
 const f=fixture(request=>request instanceof Api.auth.SendCode?sent():request instanceof Api.auth.ResendCode?sent('second',{type:new Api.auth.SentCodeTypeSms({length:6})}):{user:{id:42}});t.after(()=>f.service.cancel());
 let s=await f.service.start(credentials);await assert.rejects(f.service.resend(s.id),/Wait/);f.advance(30000);s=await f.service.resend(s.id);assert.equal(s.delivery,'auth.SentCodeTypeSms');await f.service.answer(s.id,'123456');assert.equal(f.calls.at(-1).phoneCodeHash,'second');
});
test('expired codes request a fresh SendCode and flood waits block repeated submissions',async t=>{
 let sends=0;const f=fixture(request=>{if(request instanceof Api.auth.SendCode){sends++;return sent();}throw rpc('PHONE_CODE_EXPIRED');});t.after(()=>f.service.cancel());
 let s=await f.service.start(credentials);s=await f.service.answer(s.id,'12345');assert.equal(s.codeExpired,true);await f.service.resend(s.id);assert.equal(sends,2);
 const g=fixture(()=>{throw Object.assign(rpc('FLOOD_WAIT_60'),{seconds:60});});t.after(()=>g.service.cancel());s=await g.service.start(credentials);assert.match(s.error,/60 seconds/);await assert.rejects(g.service.resend(s.id),/Wait/);assert.equal(g.calls.length,1);
});
test('cancel during connection releases a late client and never requests a code',async()=>{
 let ready;const f=fixture(()=>sent());f.service.connect=()=>new Promise(resolve=>{ready=resolve;});const pending=f.service.start(credentials);await f.service.cancel();ready({});await assert.rejects(pending,/no longer active/);assert.equal(f.calls.length,0);assert.equal(f.completed.length,0);assert.equal(f.released.length,2);assert.equal(f.service.status(),null);
});
test('parallel sign-ins and empty answers are rejected; unregistered numbers are never saved',async t=>{
 const f=fixture(request=>request instanceof Api.auth.SendCode?sent():new Api.auth.AuthorizationSignUpRequired({}));t.after(()=>f.service.cancel());const s=await f.service.start(credentials);await assert.rejects(f.service.start(credentials),/current sign-in/);await assert.rejects(f.service.answer(s.id,''),/Enter/);const result=await f.service.answer(s.id,'12345');assert.match(result.error,/official Telegram app/);assert.equal(f.completed.length,0);
});
