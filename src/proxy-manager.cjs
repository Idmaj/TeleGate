const {randomUUID}=require('node:crypto');
const {normalizeProxy}=require('./proxy.cjs');

const direct={id:'direct',name:'Direct connection',type:'none'};
function newState(){return {profiles:[],defaultPolicy:{mode:'direct'}};}
function profile(input,id=input.id||randomUUID()){
 const value={id,name:String(input.name||'').trim(),type:input.type,host:String(input.host||'').trim(),port:Number(input.port),enabled:input.enabled!==false};
 if(!value.name||value.name.length>100)throw Error('Enter a proxy name');
 if(input.type==='socks5'||input.type==='socks4'){value.username=String(input.username||'');value.password=String(input.password||'');}
 if(input.type==='mtproto')value.secret=String(input.secret||'').trim();
 normalizeProxy(value);return value;
}
function policy(input,profiles,{account=false}={}){
 const ids=new Set(profiles.map(p=>p.id));
 if(account&&input?.mode==='inherit')return {mode:'inherit'};
 if(input?.mode==='direct')return {mode:'direct'};
 if(input?.mode==='profile'){
  if(!ids.has(input.profileId))throw Error('Choose an existing proxy');
  return {mode:'profile',profileId:input.profileId};
 }
 if(input?.mode==='auto'){
  const profileIds=[...new Set(Array.isArray(input.profileIds)?input.profileIds:profiles.filter(p=>p.enabled).map(p=>p.id))].filter(id=>ids.has(id));
  const includeDirect=input.includeDirect!==false;
  if(!profileIds.length&&!includeDirect)throw Error('Automatic mode needs at least one route');
  return {mode:'auto',profileIds,includeDirect,directFirst:input.directFirst!==false};
 }
 throw Error('Choose a connection mode');
}
function effectivePolicy(state,accountPolicy){return accountPolicy?.mode==='inherit'||!accountPolicy?state.defaultPolicy:accountPolicy;}
function candidates(state,accountPolicy,preferred){
 const chosen=effectivePolicy(state,accountPolicy),byId=new Map(state.profiles.map(p=>[p.id,p]));let result=[];
 if(chosen.mode==='direct')result=[direct];
 if(chosen.mode==='profile'){const p=byId.get(chosen.profileId);if(p)result=[p];}
 if(chosen.mode==='auto'){
  const profiles=(chosen.profileIds||[]).map(id=>byId.get(id)).filter(Boolean),plain=chosen.includeDirect===false?[]:[direct];result=chosen.directFirst===false?[...profiles,...plain]:[...plain,...profiles];
 }
 if(preferred){const index=result.findIndex(x=>x.id===preferred);if(index>0)result=[result[index],...result.slice(0,index),...result.slice(index+1)];}
 if(!result.length)throw Error('No connection route is available');return result;
}
function publicState(state){return structuredClone(state);}
module.exports={direct,newState,profile,policy,effectivePolicy,candidates,publicState};
