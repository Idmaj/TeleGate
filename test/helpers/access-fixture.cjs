const {Api}=require('telegram');
const bigInt=require('big-integer');
const {getPeerId}=require('telegram/Utils');
const {Gate}=require('../../src/gate.cjs');
function fixture(){
 const channel=(id,title,username)=>({entity:new Api.Channel({id:bigInt(id),title,broadcast:true,username}),unreadCount:7,message:{message:'SECRET_LAST_MESSAGE'}});
 const ds=[channel(1,'Daily News','daily_news'),channel(2,'Private News'),channel(3,'Other News','other_news'),{entity:new Api.User({id:bigInt(4),firstName:'Private Person',phone:'SECRET_PHONE'})}];
 const ids=ds.map(d=>getPeerId(d.entity).toString()),calls={dialogs:0,folders:0,messages:[]};
 const filters=[{id:2,title:{text:'News'},includePeers:[ds[0].entity],excludePeers:[]},{id:3,title:{text:'SECRET_FOLDER'},includePeers:[ds[3].entity]}];
 const gate=new Gate(()=>{if(gate.pending.size)throw Error('Unexpected approval');});
 gate.metadata=async()=>{throw Error('Unbatched metadata lookup');};
 const c={getDialogs:async()=>{calls.dialogs++;return ds;},invoke:async()=>{calls.folders++;return {filters};},getEntity:async id=>{const d=ds.find(d=>getPeerId(d.entity).toString()===id);if(!d)throw Error('Missing entity');return d.entity;},async *iterMessages(id){calls.messages.push(id);yield {id:42,date:1000,message:'news result',peerId:ds.find(d=>getPeerId(d.entity).toString()===id).entity};}};
 const rule=(fields={})=>{gate.rules.change({action:'create',rule:{name:'Test access',account:'a',effect:'allow',operations:['read_all'],selector:{chats:[ids[0]]},...fields}});return gate.rules.rules.at(-1);};
 return {ds,ids,calls,filters,gate,c,rule};
}

module.exports={fixture};
