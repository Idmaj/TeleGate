const access=require('./access.cjs');
const {searchPage}=require('./advanced.cjs');

async function filterResults(gate,account,state,rows){
 const current=new Map(state.rows.map(m=>[m.id,m])),results=[];
 for(const row of rows){const m=current.get(row.chatId);if(m&&await access.allowed(gate,account,m,'search'))results.push(row);}
 gate.assertActive(account);return results;
}

async function currentCursor(gate,account,state,args,cursor){
 if(!cursor)return null;
 const ds=await access.select(gate,account,state,{operation:'search',chats:args.chats,folderId:args.folderId});
 const index=cursor.chatId?ds.findIndex(m=>access.compareIds(m.id,cursor.chatId)>=0):cursor.chatOffset;
 if(index<0||index>=ds.length)return null;
 return {chatOffset:index,chatId:ds[index].id,offsetId:!cursor.chatId||ds[index].id===cursor.chatId?cursor.offsetId:0};
}

async function search(c,gate,a,{job,jobs,onEvent=()=>{}}={}){
 const state=await access.snapshot(c,gate,a.account);
 // a.query is the message query, never a filter on chat names.
 const ds=await access.select(gate,a.account,state,{operation:'search',chats:a.chats,folderId:a.folderId});
 let index=a.cursor?.chatOffset??a.chatOffset??0,offset=a.cursor?.offsetId||0,visited=0;
 if(a.cursor?.chatId){
  index=ds.findIndex(m=>access.compareIds(m.id,a.cursor.chatId)>=0);
  if(index<0)index=ds.length;
  if(ds[index]?.id!==a.cursor.chatId)offset=0;
 }
 const results=[];
 for(;index<ds.length&&visited<(a.chatLimit||5);visited++){
  if(job?.status==='cancelled')break;
  gate.assertActive(a.account);
  const m=ds[index],decision=await gate.explain(a.account,m.id,'search',m);
  if(decision.effect!=='allow'){index++;offset=0;continue;}
  gate.rules.record(decision);
  gate.audit({account:a.account,chat:m.id,operation:'search',automatic:true,allow:true,reason:decision.reason,matched:decision.matched,scope:'permitted'});
  try{
   const page=await searchPage(c,{...a,chat:m.id,offsetId:offset});
   gate.assertActive(a.account);
   if(job?.status==='cancelled')break;
   if(await access.allowed(gate,a.account,m,'search'))results.push({chatId:m.id,title:m.title,...page});
   if(page.nextOffsetId)offset=page.nextOffsetId;else{index++;offset=0;}
  }catch(e){
   gate.assertActive(a.account);
   if(job?.status==='cancelled')break;
   if(e.seconds)throw e;
   if(await access.allowed(gate,a.account,m,'search'))results.push({chatId:m.id,title:m.title,skipped:true,reason:e.message});
   index++;offset=0;
  }
  if(job){job.progress=(job.progress||0)+1;job.cursor=index<ds.length?{chatOffset:index,offsetId:offset,chatId:ds[index].id}:null;job.results.push(...results.splice(0));jobs.flush();onEvent({operation:'job_progress',jobId:job.id,progress:job.progress});}
 }
 const output=await filterResults(gate,a.account,state,job?job.results:results);
 if(job)job.results=output;
 const nextCursor=await currentCursor(gate,a.account,state,a,index<ds.length?{chatOffset:index,offsetId:offset,chatId:ds[index].id}:null);
 return {scope:'permitted',results:output,nextCursor,coverage:'Searched only chats currently allowed for message search. Chats requiring approval or denied by rules were not searched. This is not a search of your entire Telegram account.',...(state.folderError?{notice:'Folder information is unavailable; unverified folder permissions were omitted.'}:{})};
}
module.exports={search,filterResults,currentCursor};
