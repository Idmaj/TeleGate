const {hash}=require('./sync-core.cjs');
function accountMap(accounts){
 const toRemote=new Map(),toLocal=new Map();
 for(const a of accounts)if(a.telegramId){const remote='tg:'+a.telegramId;if(toLocal.has(remote))throw Error('Sync requires one local login per Telegram account. Remove duplicate logins first.');toRemote.set(a.id,remote);toLocal.set(remote,a.id);}
 return {toRemote,toLocal,canMap:v=>{const a=v.account||v.scope?.account;return !a||a==='*'||toLocal.has(a);}};
}
function convert(value,map,direction){const v=structuredClone(value),m=direction==='remote'?map.toRemote:map.toLocal;if(v.account&&v.account!=='*'){if(!m.has(v.account))return null;v.account=m.get(v.account);}if(v.scope?.kind==='chat'){if(!m.has(v.scope.account))return null;v.scope.account=m.get(v.scope.account);}return v;}
function collect({rules,memories,grants},map,base={}){
 const out={};for(const[id,v]of Object.entries(base))if(v&&!map.canMap(v))out[id]=v;
 for(const r of rules){const {uses,...fields}=r,v=convert(fields,map,'remote');if(v)out['rule:'+v.id]=v;}
 for(const n of memories){const v=convert(n,map,'remote');if(v)out['memory:'+v.id]=v;}
 for(const g of grants){const {key,...fields}=g,v=convert(fields,map,'remote');if(v){const identity={account:v.account,kind:v.kind,chat:v.chat,operation:v.operation};out['grant:'+hash(identity)]=v;}}
 return out;
}
function materialize(records,map,existing){
 const result={rules:existing.rules.filter(v=>!convert(v,map,'remote')),memories:existing.memories.filter(v=>!convert(v,map,'remote')),grants:existing.grants.filter(v=>!convert(v,map,'remote'))};
 for(const[id,record]of Object.entries(records)){const v=convert(record,map,'local');if(!v)continue;
  if(id.startsWith('rule:'))result.rules.push({...v,uses:existing.rules.find(r=>r.id===v.id)?.uses||0});
  else if(id.startsWith('memory:'))result.memories.push(v);
  else if(id.startsWith('grant:')){v.key=JSON.stringify(v.kind==='chat'?[v.account,'chat',v.chat]:v.kind==='operation'?[v.account,'operation',v.operation]:[v.account,'operation-chat',v.chat,v.operation]);result.grants.push(v);}
 }return result;
}
module.exports={accountMap,collect,materialize};
