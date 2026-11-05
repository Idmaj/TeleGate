const {TelegramClient,Api}=require('telegram');
const {StringSession}=require('telegram/sessions');
const {getPeerId}=require('telegram/Utils');
const clients=new Map();const connecting=new Map();const statuses=new Map();
function withPeerRecovery(c){
 if(c.__peerRecovery)return c;c.__peerRecovery=true;const original=c.getInputEntity.bind(c);let refreshing;
 c.getInputEntity=async peer=>{try{return await original(peer);}catch(e){if(!/^-?\d+$/.test(String(peer))||!String(e.message).includes('Could not find the input entity'))throw e;if(!refreshing)refreshing=c.getDialogs({limit:undefined}).finally(()=>{refreshing=null;});await refreshing;return original(peer);}};return c;
}
function entities(items){return items?.map(e=>new Api['MessageEntity'+e.type]({offset:e.offset,length:e.length,url:e.url,language:e.language}));}
const clean=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
async function connect(a,session){
 if(connecting.has(a.id))return connecting.get(a.id);
 const task=(async()=>{let c=clients.get(a.id);try{if(!c)c=new TelegramClient(new StringSession(session||''),a.apiId,a.apiHash,{connectionRetries:3,requestRetries:session?1:3,floodSleepThreshold:0,autoReconnect:true,proxy:a.proxy});withPeerRecovery(c);if(!c.connected)await c.connect();clients.set(a.id,c);statuses.set(a.id,{connected:!!c.connected,updated:Date.now()});return c;}catch(e){statuses.set(a.id,{connected:false,error:e.message,updated:Date.now()});throw e;}})();connecting.set(a.id,task);try{return await task;}finally{connecting.delete(a.id);}}
function chat(d){return {id:getPeerId(d.entity).toString(),title:d.title,username:d.entity.username,type:d.isUser?'person':d.entity.broadcast?'channel':'group',unread:d.unreadCount};}
function msg(m){return clean({id:m.id,chatId:m.peerId?getPeerId(m.peerId).toString():null,date:m.date,text:m.message,senderId:m.senderId?.toString(),replyTo:m.replyTo,entities:m.entities,mediaType:m.media?.className,views:m.views,forwards:m.forwards});}
async function dialogs(c,q='',offset=0,limit=100){const ds=await c.getDialogs({limit:undefined});const rows=ds.map(chat).filter(d=>(d.title+' '+(d.username||'')+' '+d.id).toLowerCase().includes(q.toLowerCase()));return {items:rows.slice(offset,offset+limit),nextOffset:rows.length>offset+limit?offset+limit:null,scanned:ds.length};}
async function run(c,op,a){switch(op){
case 'poll':return clean(await c.sendFile(a.chat,{file:new Api.InputMediaPoll({poll:new Api.Poll({id:require('big-integer')(0),question:new Api.TextWithEntities({text:a.question,entities:[]}),answers:a.answers.map((text,i)=>new Api.PollAnswer({text:new Api.TextWithEntities({text,entities:[]}),option:Buffer.from([i])})),publicVoters:a.publicVoters,multipleChoice:a.multipleChoice}),correctAnswers:undefined}),replyTo:a.replyTo||a.topicId,scheduleDate:a.schedule}));
case 'send_media':{const {CustomFile}=require('telegram/client/uploads');const b=Buffer.from(a.base64,'base64');return clean(await c.sendFile(a.chat,{file:new CustomFile(a.filename,b.length,'',b),caption:a.text,parseMode:a.format||'html',forceDocument:a.forceDocument,voiceNote:a.voiceNote,videoNote:a.videoNote,scheduleDate:a.schedule,replyTo:a.replyTo||a.topicId,silent:a.silent}));}
case 'messages':case 'search':return (await c.getMessages(a.chat,{limit:a.limit,offsetId:a.offsetId,search:a.query,fromUser:a.fromUser,minId:a.minId,maxId:a.maxId,offsetDate:a.before,filter:a.filter?new Api['InputMessagesFilter'+a.filter]():undefined})).map(msg);
case 'chat':return clean(await c.getEntity(a.chat));
case 'participants':return (await c.getParticipants(a.chat,{limit:a.limit,offset:a.offsetId,search:a.query})).map(u=>clean({id:u.id,firstName:u.firstName,lastName:u.lastName,username:u.username}));
case 'send':return msg(await c.sendMessage(a.chat,{message:a.text,parseMode:a.format||'html',formattingEntities:entities(a.entities),replyTo:a.replyTo||a.topicId,schedule:a.schedule,silent:a.silent,linkPreview:a.linkPreview}));
case 'edit':return msg(await c.editMessage(a.chat,{message:a.messageId,text:a.text,parseMode:a.format||'html',formattingEntities:entities(a.entities)}));
case 'delete':return clean(await c.deleteMessages(a.chat,a.ids,{revoke:a.revoke}));
case 'forward':return clean(await c.forwardMessages(a.chat,{messages:a.ids,fromPeer:a.fromChat,silent:a.silent,schedule:a.schedule}));
case 'pin':return clean(await c.pinMessage(a.chat,a.messageId,{notify:a.notify}));
case 'unpin':return clean(await c.unpinMessage(a.chat,a.messageId));
case 'mark_read':return clean(await c.markAsRead(a.chat,a.ids));
case 'react':return clean(await c.invoke(new Api.messages.SendReaction({peer:await c.getInputEntity(a.chat),msgId:a.messageId,reaction:[new Api.ReactionEmoji({emoticon:a.emoji})]})));
case 'scheduled':return clean(await c.invoke(new Api.messages.GetScheduledHistory({peer:await c.getInputEntity(a.chat),hash:0})));
case 'cancel_scheduled':return clean(await c.invoke(new Api.messages.DeleteScheduledMessages({peer:await c.getInputEntity(a.chat),id:a.ids})));
case 'download':{const [m]=await c.getMessages(a.chat,{ids:[a.messageId]});if(!m?.media)throw Error('Message has no media');if(Number(m.media.document?.size||0)>10*1024*1024)throw Error('Media exceeds 10 MB');const b=await c.downloadMedia(m,{});if(!b||b.length>10*1024*1024)throw Error('Media unavailable or exceeds 10 MB');return {base64:b.toString('base64')};}
 default:return require('./advanced.cjs').run(c,op,a);}}
module.exports={withPeerRecovery,connect,clients,statuses,dialogs,run,msg,clean};
