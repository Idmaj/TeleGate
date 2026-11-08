const {Api}=require('telegram');
const {computeCheck}=require('telegram/Password');
const {randomUUID}=require('node:crypto');

function loginError(error){
 const code=error.errorMessage||error.message||'';
 const messages={PHONE_NUMBER_INVALID:'Enter a valid phone number with its country code.',API_ID_INVALID:'Check your Telegram API ID and API Hash.',PHONE_CODE_INVALID:'That code is incorrect. Try again.',PHONE_CODE_EMPTY:'Enter the code Telegram sent you.',PHONE_CODE_EXPIRED:'This code has expired. Request a new code.',PASSWORD_HASH_INVALID:'That password is incorrect. Try again.',PHONE_NUMBER_BANNED:'Telegram has banned this phone number.',AUTH_RESTART:'Telegram needs a new login code. Request a new code.'};
 if(error.seconds||/FLOOD_WAIT_\d+/.test(code))return `Telegram requires a wait of ${error.seconds||code.match(/FLOOD_WAIT_(\d+)/)[1]} seconds before trying again.`;
 if(code==='This Telegram account is already added.')return code;
 return messages[code]||'Telegram could not complete this step. Check your connection and try again.';
}

class LoginService{
 constructor({connect,release,complete,notify=()=>{},now=Date.now,checkPassword=computeCheck}){Object.assign(this,{connect,release,complete,notify,now,checkPassword});this.flow=null;}
 get active(){return !!this.flow&&!['done','expired'].includes(this.flow.step);}
 status(){const f=this.flow;if(!f)return null;return {id:f.id,step:f.step,phone:f.phone,label:f.account.label,busy:f.busy,error:f.error||'',hint:f.hint||'',delivery:f.delivery||'',nextDelivery:f.nextDelivery||'',emailPattern:f.emailPattern||'',codeLength:f.codeLength||null,resendAt:f.resendAt||0,retryAt:f.retryAt||0,codeExpired:!!f.codeExpired};}
 touch(f){clearTimeout(f.timer);f.timer=setTimeout(()=>{if(this.flow!==f)return;f.step='expired';f.error='This sign-in session expired. Start again.';f.busy=false;void this.release(f.account.id).catch(()=>{});this.notify();},10*60*1000);f.timer.unref?.();}
 ensure(f){if(this.flow!==f||f.step==='expired')throw Error('This sign-in session is no longer active.');}
 async perform(f,action){
  this.ensure(f);if(f.busy)throw Error('A sign-in request is already running.');if(f.retryAt>this.now())throw Error('Wait before trying again.');
  f.busy=true;f.error='';this.touch(f);this.notify();
  try{await action();this.ensure(f);}catch(error){if(this.flow===f&&f.step!=='expired'){f.error=loginError(error);if(['PHONE_CODE_EXPIRED','AUTH_RESTART'].includes(error.errorMessage)){f.codeExpired=true;f.resendAt=0;}const seconds=Number(error.seconds||error.errorMessage?.match(/FLOOD_WAIT_(\d+)/)?.[1]);if(seconds>0)f.retryAt=this.now()+seconds*1000;}else throw error;}
  finally{if(this.flow===f){f.busy=false;this.notify();}else await this.release(f.account.id).catch(()=>{});}
  return this.status();
 }
 async start(input){
  if(this.active)throw Error('Finish or cancel the current sign-in first.');
  const phone=String(input.phone||'').replace(/[\s()-]/g,''),apiId=Number(input.apiId),apiHash=String(input.apiHash||'').trim();
  if(!Number.isInteger(apiId)||apiId<=0||!/^[a-f0-9]{32}$/i.test(apiHash))throw Error('Enter a valid API ID and 32-character API Hash.');
  if(!/^\+[1-9]\d{6,14}$/.test(phone))throw Error('Enter your phone number with its country code, starting with +.');
  const id=randomUUID(),f={id,account:{id,label:String(input.label||phone).trim()||phone,apiId,apiHash},phone,step:'code',busy:false};
  clearTimeout(this.flow?.timer);this.flow=f;
  return this.perform(f,async()=>{f.client=await this.connect(f.account);this.ensure(f);await this.send(f,false);});
 }
 async send(f,resend){
  const result=await f.client.invoke(resend?new Api.auth.ResendCode({phoneNumber:f.phone,phoneCodeHash:f.codeHash}):new Api.auth.SendCode({phoneNumber:f.phone,apiId:f.account.apiId,apiHash:f.account.apiHash,settings:new Api.CodeSettings({})}));
  this.ensure(f);
  if(result instanceof Api.auth.SentCodeSuccess)return this.finish(f,result.authorization);
  if(!result.phoneCodeHash)throw Error('Missing phone code hash');
  f.codeHash=result.phoneCodeHash;f.delivery=result.type?.className||'';f.nextDelivery=result.nextType?.className||'';f.emailPattern=result.type?.emailPattern||'';f.codeLength=result.type?.length;f.resendAt=this.now()+Math.max(0,result.timeout??30)*1000;f.codeExpired=false;
  if(['auth.SentCodeTypeSetUpEmailRequired','auth.SentCodeTypeFirebaseSms'].includes(f.delivery))f.error='Telegram requires verification in its official mobile app. Sign in there first, then try again here.';
 }
 async resend(id){const f=this.get(id,'code');if(Math.max(f.resendAt||0,f.retryAt||0)>this.now())throw Error('Wait before requesting another code.');return this.perform(f,async()=>{if(!f.client){f.client=await this.connect(f.account);this.ensure(f);}await this.send(f,!!f.codeHash&&!f.codeExpired);});}
 get(id,step){const f=this.flow;if(!this.active||f.id!==id||step&&f.step!==step)throw Error('This sign-in step is no longer active.');return f;}
 async answer(id,value){
  const f=this.get(id);if(typeof value!=='string'||!value.trim())throw Error('Enter the code or password to continue.');
  return this.perform(f,async()=>{
   if(f.step==='code'){
    if(!f.codeHash)throw Error('Request a code first');
    let result;try{result=await f.client.invoke(new Api.auth.SignIn({phoneNumber:f.phone,phoneCodeHash:f.codeHash,phoneCode:/SmsWord|SmsPhrase/.test(f.delivery)?value.trim():value.replace(/[\s-]/g,'')}));}
    catch(error){if(error.errorMessage!=='SESSION_PASSWORD_NEEDED')throw error;const password=await f.client.invoke(new Api.account.GetPassword());this.ensure(f);f.hint=password.hint||'';f.step='password';return;}
    this.ensure(f);await this.finish(f,result);
   }else if(f.step==='password'){
    const password=await f.client.invoke(new Api.account.GetPassword());this.ensure(f);
    const check=await this.checkPassword(password,value);this.ensure(f);
    const result=await f.client.invoke(new Api.auth.CheckPassword({password:check}));this.ensure(f);await this.finish(f,result);
   }
  });
 }
 async finish(f,result){
  this.ensure(f);if(result instanceof Api.auth.AuthorizationSignUpRequired){f.error='This number has no Telegram account. Create one in the official Telegram app, then try again.';return;}
  if(!result?.user)throw Error('Missing authorized user');
  await this.complete(f.account,f.client,result.user);this.ensure(f);clearTimeout(f.timer);f.step='done';f.account.apiHash=undefined;f.codeHash=undefined;f.hint='';await this.release(f.account.id).catch(()=>{});f.client=undefined;
 }
 async cancel(id){if(id&&this.flow?.id!==id)throw Error('This sign-in session is no longer active.');const f=this.flow;this.flow=null;clearTimeout(f?.timer);this.notify();if(f)await this.release(f.account.id).catch(()=>{});return null;}
}
module.exports={LoginService,loginError};
