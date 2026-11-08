const {Api}=require('telegram');const bigInt=require('big-integer');
function mockTelegram(){
 let sequence=0;const messages=[];const entity=new Api.Channel({id:bigInt(12345),title:'TeleGate Sync',creator:true,broadcast:true,accessHash:bigInt(1)});
 const c={entity,messages,subscribers:1,removed:[],getDialogs:async()=>[{entity}],getMe:async()=>({id:bigInt(12345)}),getInputEntity:async()=>new Api.InputPeerChannel({channelId:bigInt(12345),accessHash:bigInt(1)}),
  invoke:async r=>{r.getBytes();if(r instanceof Api.channels.CreateChannel)return {chats:[entity]};if(r instanceof Api.channels.GetFullChannel)return {chats:[entity],fullChat:{participantsCount:c.subscribers}};throw Error('Unexpected Telegram method');},
  sendMessage:async(_,a)=>{const m={id:++sequence,message:a.message};messages.push(m);return m;},
  sendFile:async(_,a)=>{const m={id:++sequence,message:a.caption,media:{document:{size:a.file.buffer.length}},buffer:a.file.buffer};messages.push(m);return m;},
  getMessages:async(_,a)=>{if(a.ids)return messages.filter(m=>a.ids.includes(m.id));if(a.search)return messages.filter(m=>m.message.includes(a.search)).slice(-a.limit).reverse();return messages.filter(m=>m.id>(a.minId||0)).slice(0,a.limit);},
  downloadMedia:async m=>m.buffer,
  deleteMessages:async(_,ids)=>{c.removed.push(...ids);for(const id of ids){const i=messages.findIndex(m=>m.id===id);if(i>=0)messages.splice(i,1);}},disconnect:async()=>{}
 };return c;
}
module.exports={mockTelegram};
