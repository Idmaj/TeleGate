const {createHash,randomUUID}=require('node:crypto');
class Jobs{
 constructor(data=[],save=()=>{}){this.items=new Map(data.map(x=>[x.id,{...x,status:x.status==='running'?'interrupted':x.status}]));this.save=save;}
 flush(){const values=[...this.items.values()];const old=values.slice(0,Math.max(0,values.length-300));for(const item of old){if(item.operation==='search_all'&&!['running','queued'].includes(item.status))this.items.delete(item.id);else if(item.status==='completed')delete item.result;}this.save([...this.items.values()]);}
 async write(key,account,operation,args,fn){if(!key)throw Error('requestId is required for write operations; reuse it when retrying the exact same request');const id=account+':'+key,hash=createHash('sha256').update(JSON.stringify({operation,args})).digest('hex');const previous=this.items.get(id);if(previous){if(previous.hash!==hash)throw Error('requestId was already used for different arguments');if(previous.status==='completed')return {duplicate:true,result:previous.result};throw Error('This write was already attempted ('+previous.status+'). Inspect Telegram before submitting a new requestId.');}const item={id,account,operation,hash,status:'running',created:Date.now()};this.items.set(id,item);this.flush();try{const result=await fn();Object.assign(item,{status:'completed',result,finished:Date.now()});this.flush();return result;}catch(e){Object.assign(item,{status:'uncertain',error:e.message,finished:Date.now()});this.flush();throw e;}}
 create(account,operation,args){const id=randomUUID();const item={id,account,operation,args,status:'queued',progress:0,created:Date.now(),results:[]};this.items.set(id,item);this.flush();return item;}
 get(id){const item=this.items.get(id);if(!item)throw Error('Job not found');return item;}
 cancel(id){const item=this.get(id);if(['queued','running','interrupted'].includes(item.status)){item.status='cancelled';this.flush();}return item;}
}
module.exports={Jobs};
