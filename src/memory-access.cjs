const {CHAT_READS}=require('./access.cjs');

// Chat memory accompanies a permitted read. Directory access alone does not
// expose the owner's private notes for every chat in the directory.
async function mayRead(gate,account,chat){
 gate.assertActive(account);
 for(const operation of CHAT_READS)if((await gate.explain(account,chat,operation)).effect==='allow')return true;
 return false;
}
async function authorize(gate,scope){
 if(scope.kind==='global'){gate.assertActive('*');return;}
 for(const operation of CHAT_READS)if((await gate.explain(scope.account,scope.chat,operation)).effect==='allow')return gate.authorize(scope.account,scope.chat,operation,{purpose:'Read saved owner memory for this chat'});
 return gate.authorize(scope.account,scope.chat,'chat',{purpose:'Read saved owner memory for this chat; no message history is fetched'});
}
module.exports={mayRead,authorize};
