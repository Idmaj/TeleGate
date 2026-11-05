const {getPeerId}=require('telegram/Utils');
function identityFromEntity(entity){return {id:getPeerId(entity).toString(),title:entity.title||[entity.firstName,entity.lastName].filter(Boolean).join(' ')||entity.username||'Unknown chat',username:entity.username||null,type:entity.className==='User'?(entity.bot?'Bot':'Person'):entity.broadcast?'Channel':'Group',public:!!(entity.username||entity.usernames?.some(u=>u.active)),verified:!!entity.verified};}
function createIdentityResolver(getClient){
 const cache=new Map();
 return async(account,chat)=>{
  const key=JSON.stringify([account,chat]),hit=cache.get(key);
  if(hit&&hit.until>Date.now())return hit.value;
  const c=await getClient(account),entity=await c.getEntity(chat),identity=identityFromEntity(entity);
  // Fetch only the small avatar, never message history, for the local approval UI.
  let timer;
  try{const photo=await Promise.race([c.downloadProfilePhoto(entity,{isBig:false}),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2500);})]);
   if(Buffer.isBuffer(photo)&&photo.length<=256*1024)identity.avatar='data:image/jpeg;base64,'+photo.toString('base64');
  }catch{}finally{clearTimeout(timer);}
  if(cache.size>=100)cache.delete(cache.keys().next().value);
  cache.set(key,{until:Date.now()+300000,value:identity});return identity;
 };
}
module.exports={identityFromEntity,createIdentityResolver};
