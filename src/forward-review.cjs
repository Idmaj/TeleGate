const {createHash}=require('node:crypto');
async function snapshot(client,args){
 const messages=await client.getMessages(args.fromChat,{ids:args.ids});
 const items=args.ids.map(id=>{
  const m=messages.find(m=>m?.id===id);
  if(!m||typeof m.message!=='string')throw Error('Forward source is unavailable');
  if(m.media)throw Error('Media forwarding is disabled because its exact content cannot be reviewed. Download the media and use send_media with attachment review.');
  return {id,text:m.message,entities:JSON.parse(JSON.stringify(m.entities||[]))};
 });
 return {items,hash:createHash('sha256').update(JSON.stringify(items)).digest('hex')};
}
async function verify(client,args,previous){if((await snapshot(client,args)).hash!==previous.hash)throw Error('Forwarded messages changed after review. Submit a fresh request.');}
module.exports={snapshot,verify};
