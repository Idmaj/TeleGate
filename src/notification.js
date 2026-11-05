const content=document.getElementById('toastContent'),error=document.getElementById('toastError');
let refreshing=false,again=false;
async function refresh(){if(refreshing){again=true;return;}refreshing=true;try{const state=await tele.call('approval-state');if(state.notifications?.privacy){content.innerHTML='<div class="empty"><h3>'+state.pending.length+' request(s) waiting</h3><p>Notification content is hidden.</p><button id="reviewPrivate">Review securely in TeleGate</button></div>';content.querySelector('#reviewPrivate').onclick=()=>tele.call('open-requests');}else Approvals.render(content,state,{compact:true});error.hidden=true;await tele.call('notification-ready');}catch(e){error.hidden=false;error.textContent='Unable to load this request. Open Access requests to review it. '+e.message;await tele.call('notification-ready').catch(()=>{});}finally{refreshing=false;if(again){again=false;refresh();}}}
document.getElementById('dismissToast').onclick=()=>tele.call('dismiss-notification');
document.getElementById('openRequests').onclick=()=>tele.call('open-requests');
window.addEventListener('error',e=>{error.hidden=false;error.textContent='Notification error: '+e.message;});
tele.onChange(refresh);refresh();
