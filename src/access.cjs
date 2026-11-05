const {identityFromEntity}=require('./identity.cjs');
const {folderData,matchesFolder}=require('./advanced.cjs');
const {READS,GROUPS,operations}=require('./rules.cjs');
const CHAT_READS=READS.filter(op=>!GROUPS.directory.includes(op));
const compareIds=(a,b)=>a<b?-1:a>b?1:0;

// Dialog responses stay in the trusted process. Last messages, phone numbers,
// unread counts and other private fields must never enter the MCP directory.
async function snapshot(c,gate,account){
 gate.assertActive(account);
 const dialogs=await c.getDialogs({limit:undefined});
 let filters,folderError=false;
 try{filters=(await folderData(c)).filter(f=>Number.isInteger(f.id)&&f.id>=2);}catch{folderError=true;filters=[];}
 const folders=[{id:0,title:'Main chats'},{id:1,title:'Archived chats'},...filters.map(f=>({id:f.id,title:f.title?.text||f.title||'Unnamed folder'}))];
 const rows=new Map();
 for(const d of dialogs){
  if(!['User','Chat','Channel'].includes(d.entity?.className))continue;
  const m=identityFromEntity(d.entity);
  if(!folderError)m.folderIds=[d.archived?1:0,...filters.filter(f=>matchesFolder(f,d)).map(f=>f.id)];
  // Unknown folder membership cannot bypass a folder deny via a broad allow.
  rows.set(m.id,m);
 }
 // Specifically permitted public chats need not be in the account's dialogs.
 const explicit=new Set(gate.rules.rules.filter(r=>r.enabled&&r.effect==='allow'&&(!r.expires||r.expires>Date.now())&&(r.account==='*'||r.account===account)&&[...operations(r)].some(op=>CHAT_READS.includes(op))).flatMap(r=>r.selector.chats));
 for(const g of gate.listGrants())if(g.account===account&&g.chat)explicit.add(g.chat);
 for(const id of explicit){
  if(rows.has(id))continue;
  try{const e=await c.getEntity(id);if(!['User','Chat','Channel'].includes(e?.className))continue;const m=identityFromEntity(e);if(m.id!==id)continue;if(!folderError)m.folderIds=[];rows.set(id,m);}catch{}
 }
 gate.assertActive(account);
 return {rows:[...rows.values()].sort((a,b)=>compareIds(a.id,b.id)),folders,folderError};
}

async function allowed(gate,account,m,operation){return (await gate.explain(account,m.id,operation,m)).effect==='allow';}
async function select(gate,account,state,options={}){
 gate.assertActive(account);
 const requested=options.operation||'messages',query=(options.query||'').toLowerCase(),rows=[];
 for(const m of state.rows){
  if(options.chats&&!options.chats.includes(m.id)||options.folderId!==undefined&&!m.folderIds?.includes(options.folderId))continue;
  if(options.type&&options.type!==m.type.toLowerCase()&&!(options.type==='person'&&m.type==='Bot'))continue;
  if(![m.title,m.username||'',m.id].join(' ').toLowerCase().includes(query))continue;
  if(await allowed(gate,account,m,requested))rows.push(m);
 }
 gate.assertActive(account);return rows;
}

async function list(c,gate,account,options={}){
 const state=await snapshot(c,gate,account),selected=await select(gate,account,state,options);
 const offset=options.offset||0,limit=options.limit||50,items=[];
 for(const m of selected.slice(offset,offset+limit)){
  const allowedOperations=[];for(const op of CHAT_READS)if(await allowed(gate,account,m,op))allowedOperations.push(op);
  if(!allowedOperations.includes(options.operation||'messages'))continue;
  items.push({id:m.id,title:m.title,username:m.username,type:m.type.toLowerCase(),public:m.public,folders:state.folders.filter(f=>m.folderIds?.includes(f.id)),allowedOperations});
 }
 gate.assertActive(account);
 gate.audit({account,operation:'accessible_chats',automatic:true,allow:true,scope:'permitted',count:items.length});
 return {scope:'permitted',operation:options.operation||'messages',items,nextOffset:selected.length>offset+limit?offset+limit:null,coverage:'Only chats currently allowed for this operation. Other Telegram chats were not exposed. Folder membership is refreshed on each request.',...(state.folderError?{notice:'Folder information is unavailable. Chats requiring unverified folder permissions are omitted.'}:{})};
}
module.exports={CHAT_READS,compareIds,snapshot,select,allowed,list};
