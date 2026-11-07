const {Api}=require('telegram');
const {CustomFile}=require('telegram/client/uploads');
const {getPeerId}=require('telegram/Utils');
const {randomUUID,randomBytes}=require('node:crypto');
const {deriveKey,seal,open,MAX_BYTES}=require('./sync-core.cjs');
const MARKER='TeleGate sync workspace v1';
class TelegramSyncTransport{
 constructor(client,channel){this.client=client;this.channel=channel;}
 async verify(){
  const c=this.client,full=await c.invoke(new Api.channels.GetFullChannel({channel:await c.getInputEntity(this.channel)}));
  const entity=full.chats.find(e=>getPeerId(e).toString()===this.channel);
  if(!entity?.creator||!entity.broadcast||entity.megagroup||entity.username||entity.usernames?.some(u=>u.active)||full.fullChat.participantsCount!==1)throw Error('Sync requires a private broadcast channel owned by this account with no other subscribers.');
 }
 async read(cursor){
  const messages=await this.client.getMessages(this.channel,{minId:cursor,reverse:true,limit:50});const files=[];let next=cursor;
  for(const m of messages){next=Math.max(next,m.id);if(!m.message?.startsWith('TeleGate encrypted sync v1 '))continue;
   const doc=m.media?.document;if(!doc||Number(doc.size)>MAX_BYTES*1.5)throw Error('Invalid or oversized sync attachment');
   const buffer=await this.client.downloadMedia(m,{workers:1});if(!Buffer.isBuffer(buffer))throw Error('Sync attachment unavailable');files.push({id:m.id,buffer});
  }return {files,cursor:next,hasMore:messages.length===50};
 }
 async send(buffer,device){const m=await this.client.sendFile(this.channel,{file:new CustomFile('telegate-sync-v1.bin',buffer.length,'',buffer),caption:'TeleGate encrypted sync v1 '+device,forceDocument:true,silent:true,workers:1});return m.id;}
 async remove(ids){if(ids.length)await this.client.deleteMessages(this.channel,ids,{revoke:true});}
 static async create(client,password){
  const owner=(await client.getMe()).id.toString(),workspace=randomUUID(),salt=randomBytes(16).toString('hex'),key=await deriveKey(password,salt);
  const result=await client.invoke(new Api.channels.CreateChannel({title:'TeleGate Sync',about:'Private encrypted TeleGate rules and memory synchronization. Keep this channel private and do not delete its workspace message.',broadcast:true}));
  const entity=result.chats.find(c=>c instanceof Api.Channel);if(!entity)throw Error('Telegram did not return the new channel');
  const channel=getPeerId(entity).toString();
  const header={v:1,workspace,salt,owner,proof:seal({purpose:MARKER},key,workspace).toString('base64')};
  const m=await client.sendMessage(channel,{message:MARKER+'\n'+JSON.stringify(header),parseMode:false,silent:true});
  return {channel,workspace,key,headerId:m.id,owner};
 }
 static async join(client,channel,password){
  if(!/^-100\d+$/.test(channel))throw Error('Enter the numeric channel ID from the first device.');
  const transport=new TelegramSyncTransport(client,channel);await transport.verify();
  const messages=await client.getMessages(channel,{search:MARKER,limit:20});const headers=messages.filter(m=>m.message?.startsWith(MARKER+'\n'));if(headers.length!==1)throw Error('Expected exactly one TeleGate workspace message in this channel.');
  const h=JSON.parse(headers[0].message.slice(MARKER.length+1));if(h.v!==1||!/^[a-f0-9-]{36}$/.test(h.workspace)||h.owner!==(await client.getMe()).id.toString())throw Error('Workspace owner or format does not match.');
  const key=await deriveKey(password,h.salt);if(open(Buffer.from(h.proof,'base64'),key,h.workspace).purpose!==MARKER)throw Error('Invalid workspace proof');
  return {channel,workspace:h.workspace,key,headerId:headers[0].id,owner:h.owner};
 }
 async checkHeader(settings){const messages=await this.client.getMessages(this.channel,{ids:[settings.headerId]});const m=messages[0];if(!m?.message?.startsWith(MARKER+'\n'))throw Error('Workspace message was deleted. Sync stopped.');const h=JSON.parse(m.message.slice(MARKER.length+1));if(h.workspace!==settings.workspace||h.owner!==settings.owner||open(Buffer.from(h.proof,'base64'),settings.key,settings.workspace).purpose!==MARKER)throw Error('Workspace identity changed. Sync stopped.');}
}
module.exports={TelegramSyncTransport};
