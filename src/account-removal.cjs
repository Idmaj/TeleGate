const {Api}=require('telegram');
async function revokeSession(client){
 // Do not use the library's logOut helper: it swallows RPC failures and clears
 // local credentials even when Telegram did not revoke the authorization.
 try{const result=await client.invoke(new Api.auth.LogOut());if(!(result instanceof Api.auth.LoggedOut))throw Error('Telegram did not confirm session revocation');}
 catch(error){if(!['AUTH_KEY_UNREGISTERED','SESSION_REVOKED','SESSION_EXPIRED'].includes(error.errorMessage))throw error;}
}
module.exports={revokeSession};
