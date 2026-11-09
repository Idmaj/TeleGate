const C=require('./sync-core.cjs');
class SyncService{
 constructor({load,commit,current,mapping,transport,notify=()=>{}}){Object.assign(this,{load,commit,current,mapping,transport,notify});this.busy=false;this.error=null;this.retryAt=0;}
 status(){const x=this.load();return x?{enabled:x.enabled,autoPermissions:x.autoPermissions===true,channel:x.channel,account:x.account,workspace:x.workspace,device:x.state.device,lastSync:x.state.lastSync,pending:x.state.pending,error:this.error,retryAt:this.retryAt,busy:this.busy}:null;}
 async run(){
  if(this.busy||Date.now()<this.retryAt)return;const original=this.load();if(!original?.enabled)return;this.busy=true;this.notify();
  try{
   const x=structuredClone(original),t=await this.transport(x);await t.verify();await t.checkHeader(x);
   const incoming=await t.read(x.state.cursor);let records=x.state.records;
   for(const file of incoming.files){const payload=C.open(file.buffer,x.key,x.workspace);if(payload.v!==1)throw Error('Unsupported sync format');records=C.merge(records,C.validateRecords(payload.records));}
   // Capture after network I/O so edits made while downloading are not overwritten.
   const map=await this.mapping(),current=this.current(map);C.capture(x.state,current);x.state.records=C.merge(x.state.records,records);x.state.cursor=incoming.cursor;
   const projected=C.project(x.state,current,v=>map.canMap(v),x.autoPermissions===true);x.state.lastSync=Date.now();this.commit(x,projected,map);this.error=null;
   // Read all available pages before publishing, to avoid unnecessary conflicts.
   if(!incoming.hasMore){const digest=C.hash(x.state.records);if(digest!==x.state.sentHash){
    const buffer=C.seal({v:1,records:x.state.records},x.key,x.workspace),id=await t.send(buffer,x.state.device);
    x.state.sentHash=digest;x.state.ownMessages.push(id);this.commit(x);
    // Only this installation's older complete snapshots are removed. Tombstones remain in each snapshot.
    const old=x.state.ownMessages.slice(0,-3);if(old.length){await t.remove(old);x.state.ownMessages=x.state.ownMessages.slice(-3);this.commit(x);}
   }}
  }catch(e){this.error=e.message;this.retryAt=Date.now()+Math.max(30000,Number(e.seconds||0)*1000);}
  finally{this.busy=false;this.notify();}
 }
 async review({id,fingerprint,index,reject=false}){
  if(this.busy)throw Error('Sync is running. Try again shortly.');this.busy=true;
  try{const x=structuredClone(this.load());if(!x)throw Error('Sync is not configured');
  const p=x.state.pending.find(p=>p.id===id&&p.fingerprint===fingerprint);if(!p)throw Error('Sync changed. Refresh and review again.');
  const map=await this.mapping(),current=this.current(map);if(C.stable(current[id]??null)!==C.stable(p.before))throw Error('Local data changed. Sync again before reviewing.');
  C.capture(x.state,current);
  if(reject)x.state.dismissed[id]=fingerprint;
  else{
   if(!Number.isInteger(index)||!p.versions[index])throw Error('Choose a version');const value=p.versions[index].value;if(value&&!map.canMap(value))throw Error('Sign in to the matching Telegram account first.');
   if(p.versions.length>1)C.write(x.state.records,id,value,x.state.device);
   if(value===null)delete current[id];else current[id]=value;
  }
  x.state.pending=x.state.pending.filter(p=>p.id!==id);x.state.base=structuredClone(current);this.commit(x,current,map);
  }finally{this.busy=false;this.notify();}
 }
}
module.exports={SyncService};
