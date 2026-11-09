window.SyncSetupUI=(()=>{
 const e=v=>RuleView.esc(v);let mode=null,draft={},wizard,request=0;
 function render(host,state,refreshPage){
  if(host.querySelector('#syncSetupWizard')===wizard&&wizard)return;
  const accounts=state.accounts.filter(a=>a.loggedIn);
  host.innerHTML='<article class="login-card" id="syncSetupWizard"></article>';wizard=host.querySelector('#syncSetupWizard');
  function draw(){
   request++;
   if(!accounts.length){wizard.innerHTML='<h3>Sign in to Telegram first</h3><p>Add the Telegram account that owns your private sync channel.</p><button id="syncSignIn" class="allow">Add Telegram account</button>';wizard.querySelector('#syncSignIn').onclick=()=>document.querySelector('[data-page=accounts]').click();return;}
   if(!mode){wizard.innerHTML='<h3>Connect your devices</h3><p>Choose how to set up encrypted sync on this computer.</p><div class="sync-route-options"><button id="syncChooseCreate"><strong>Create a new workspace</strong><small>First device · create a private TeleGate Sync channel and a new shared passphrase.</small></button><button id="syncChooseJoin"><strong>Connect to an existing workspace</strong><small>Another device · find your sync channel and enter the existing shared passphrase.</small></button></div>';for(const route of ['Create','Join'])wizard.querySelector('#syncChoose'+route).onclick=()=>{mode=route.toLowerCase();draft={account:draft.account||accounts[0].id,autoPermissions:false};draw();};return;}
   const joining=mode==='join';
   wizard.innerHTML=`<button type="button" id="syncSetupBack" class="login-cancel">← Choose a different setup</button><h3>${joining?'Connect to your workspace':'Create your sync workspace'}</h3><p>${joining?'Sign in with the same Telegram account used on your first device.':'TeleGate will create a private channel named TeleGate Sync for this account.'}</p><form id="syncSetup"><label>Telegram account<select name="account" required>${accounts.map(a=>`<option value="${e(a.id)}" ${a.id===draft.account?'selected':''}>${e(a.label)}</option>`).join('')}</select></label>${joining?'<div class="sync-channel-finder"><p id="syncDiscoveryStatus" role="status">Looking for your TeleGate Sync channel…</p><div id="syncChannelChoices"></div><label>Channel ID<input name="channel" placeholder="-100…" required autocomplete="off" dir="ltr"></label><small>Filled automatically when one matching workspace is found. If the channel was renamed, paste its ID from your first device.</small><button type="button" id="syncFindChannel">Find channel again</button></div>':''}<label>${joining?'Existing shared passphrase':'New shared passphrase'}<input name="password" type="password" minlength="16" maxlength="1024" required autocomplete="${joining?'current-password':'new-password'}"></label>${joining?'':'<label>Repeat passphrase<input name="repeat" type="password" minlength="16" maxlength="1024" required autocomplete="new-password"></label>'}<p>${joining?'Enter the passphrase you chose when creating this workspace.':'Use at least 16 characters and keep the passphrase somewhere safe; it cannot be recovered.'}</p><label class="checkline"><input name="autoPermissions" type="checkbox" ${draft.autoPermissions===true?'checked':''}>Automatically apply synced read permissions and rules</label><p class="sync-setting-help">Off by default. Incoming access increases require local review. Enable only if every synced device may change access on this computer. Concurrent edits still require a choice.</p><label class="checkline"><input name="confirm" type="checkbox" required>I authorize this device to ${joining?'use':'create'} the dedicated channel, upload and read encrypted sync files, and clean up its older snapshots automatically.</label><p>Keep the channel private with no other subscribers. Telegram sessions, credentials, MCP tokens and pending approvals are excluded. AI messages still require approval.</p><p id="syncError" class="login-error" role="alert"></p><button class="allow" id="syncConnect" type="submit">${joining?'Connect and sync':'Create and enable sync'}</button></form>`;
   const form=wizard.querySelector('#syncSetup'),error=wizard.querySelector('#syncError');let submitting=false;
   form.oninput=()=>{draft={...draft,...Object.fromEntries(new FormData(form)),autoPermissions:form.elements.autoPermissions.checked};};
   wizard.querySelector('#syncSetupBack').onclick=()=>{if(submitting)return;mode=null;draft={account:form.elements.account.value};draw();};
   async function discover(){
    const token=++request,activeWizard=wizard,account=form.elements.account.value,status=wizard.querySelector('#syncDiscoveryStatus'),find=wizard.querySelector('#syncFindChannel');find.disabled=true;status.textContent='Looking for your TeleGate Sync channel…';
    try{const found=await tele.call('sync-discover',{account});if(request!==token||host.querySelector('#syncSetupWizard')!==activeWizard)return;
     const choices=wizard.querySelector('#syncChannelChoices');choices.innerHTML='';
     if(found.length===1){if(!form.elements.channel.value.trim())form.elements.channel.value=found[0].channel;status.textContent=`Found ${found[0].title} (${found[0].channel}).`;}
     else if(found.length>1){status.textContent='More than one workspace was found. Choose the one used on your first device.';choices.innerHTML=`<label>Existing workspace<select id="syncFoundChannel"><option value="">Choose a workspace</option>${found.map(c=>`<option value="${e(c.channel)}">${e(c.title)} · ${e(c.channel)}</option>`).join('')}</select></label>`;wizard.querySelector('#syncFoundChannel').onchange=event=>{form.elements.channel.value=event.target.value;};}
     else status.textContent='No workspace named TeleGate Sync was found. Enter its channel ID, or check the selected Telegram account.';
    }catch(err){if(request===token&&host.querySelector('#syncSetupWizard')===activeWizard)status.textContent='Could not find the channel: '+err.message+' You can enter its ID manually.';}
    finally{if(request===token&&host.querySelector('#syncSetupWizard')===activeWizard)find.disabled=false;}
   }
   if(joining){form.elements.account.onchange=()=>{form.elements.channel.value='';wizard.querySelector('#syncChannelChoices').innerHTML='';void discover();};wizard.querySelector('#syncFindChannel').onclick=()=>void discover();void discover();}
   form.onsubmit=async event=>{
    event.preventDefault();if(submitting)return;error.textContent='';const data=Object.fromEntries(new FormData(form));
    if(!joining&&data.password!==data.repeat){error.textContent='Passphrases do not match.';return;}
    submitting=true;const button=wizard.querySelector('#syncConnect');button.disabled=true;button.textContent=joining?'Connecting…':'Creating workspace…';
    for(const field of form.elements)field.disabled=true;wizard.querySelector('#syncSetupBack').disabled=true;
    try{await tele.call('sync-setup',{account:data.account,mode,channel:data.channel?.trim(),password:data.password,autoPermissions:data.autoPermissions==='on',confirm:data.confirm==='on'});draft={};mode=null;await refreshPage();}
    catch(err){if(host.querySelector('#syncSetupWizard')===wizard){error.textContent=err.message;for(const field of form.elements)field.disabled=false;wizard.querySelector('#syncSetupBack').disabled=false;button.textContent=joining?'Connect and sync':'Create and enable sync';}}
    finally{submitting=false;}
   };
  }
  draw();
 }
 return {render};
})();
