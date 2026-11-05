const {app,BrowserWindow,ipcMain,safeStorage,Notification,Tray,Menu,nativeImage,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path');const {randomUUID,randomBytes}=require('node:crypto');
const {Gate}=require('./gate.cjs'),{RuleBook}=require('./rules.cjs'),{Jobs}=require('./jobs.cjs');const {MemoryBook}=require('./memory.cjs');
const {createIdentityResolver,identityFromEntity}=require('./identity.cjs');const tg=require('./telegram.cjs'),advanced=require('./advanced.cjs');const {serve}=require('./server.cjs'),{normalizeProxy}=require('./proxy.cjs');
const approvalSmoke=process.argv.includes('--approval-smoke')&&!app.isPackaged;
if(approvalSmoke)app.setPath('userData',path.join(app.getPath('temp'),'telegate-approval-smoke-'+process.pid));
let win,popup,tray,server,config,file,jobs,memories,quitting=false,notificationReady=false,notificationWanted=false;
const challenges=new Map(),notified=new Set();const assets=path.join(__dirname,'assets');
const lock=s=>{if(!safeStorage.isEncryptionAvailable())throw Error('Windows secure storage unavailable');return safeStorage.encryptString(s).toString('base64');};
const unlock=s=>safeStorage.decryptString(Buffer.from(s,'base64'));
function save(){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(config));fs.renameSync(file+'.tmp',file);}
function proxy(account){const a=config.accounts.find(a=>a.id===account);return a?.proxy?JSON.parse(unlock(a.proxy)):config.proxy?JSON.parse(unlock(config.proxy)):undefined;}
async function client(id){const a=config.accounts.find(a=>a.id===id);if(!a||!a.session)throw Error('Account is not logged in');return tg.connect({...a,apiHash:unlock(a.apiHash),proxy:normalizeProxy(proxy(id))},unlock(a.session));}
function accountList(){return config.accounts.map(({id,label,session,proxy:p})=>({id,label,loggedIn:!!session,connected:!!tg.clients.get(id)?.connected,status:tg.statuses.get(id),hasOwnProxy:!!p}));}
function navigate(page='approvals'){win.show();win.focus();win.webContents.send('navigate',page);}
function rebuildTray(){if(!tray||!config)return;tray.setImage(nativeImage.createFromPath(path.join(assets,gate.pending.size?'tray-pending.png':'icon.png')).resize({width:32,height:32}));tray.setToolTip(`TeleGate · ${gate.pending.size} pending${gate.rules.paused?' · AI paused':''}`);tray.setContextMenu(Menu.buildFromTemplate([{label:'Open TeleGate',click:()=>navigate()},{label:`Access requests (${gate.pending.size})`,click:()=>navigate()},{label:'Rules and permissions',click:()=>navigate('permissions')},{label:gate.rules.paused?'Resume AI access':'Pause all AI access',click:()=>pause('*',!gate.rules.paused)},{type:'separator'},{label:'Quit TeleGate',click:()=>{quitting=true;app.quit();}}]));}
function broadcast(){for(const w of [win,popup])if(w&&!w.isDestroyed())w.webContents.send('changed');rebuildTray();}
function audit(entry){config.audit=[{time:new Date().toISOString(),...entry},...config.audit].slice(0,3000);save();broadcast();}
function pause(account,enabled){gate.rules.pause(account,enabled);if(enabled)gate.cancelAccount(account);broadcast();}
function approvalState(){return {accounts:accountList(),pending:gate.list(),grants:gate.listGrants(),rules:gate.rules.snapshot(),notifications:config.notifications};}
function positionNotification(w){const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;const width=Math.min(config.notifications.width||460,area.width-36),height=Math.min(720,area.height-36);const corner=config.notifications.corner||'bottom-right';w.setBounds({width,height,x:corner.endsWith('left')?area.x+18:area.x+area.width-width-18,y:corner.startsWith('top')?area.y+18:area.y+area.height-height-18});}
function showNotification(){if(quitting||!gate.pending.size||config.notifications.dndUntil>Date.now())return;notificationWanted=true;if(!popup||popup.isDestroyed()){notificationReady=false;popup=window({frame:false,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,alwaysOnTop:true,roundedCorners:true,hasShadow:true},true);popup.on('closed',()=>{popup=null;notificationReady=false;});}positionNotification(popup);if(notificationReady)popup.showInactive();}
const gate=new Gate(()=>{broadcast();if(quitting)return;let arrived=false;for(const id of gate.pending.keys())if(!notified.has(id)){notified.add(id);arrived=true;}for(const id of notified)if(!gate.pending.has(id))notified.delete(id);if(arrived)showNotification();if(!gate.pending.size){notificationWanted=false;popup?.hide();}},audit,createIdentityResolver(client));
function notificationFailure(){if(quitting||!gate.pending.size)return;new Notification({title:'TeleGate · Review pending requests',body:'Open Access requests in TeleGate to review.'}).show();navigate();}
function window(options={},approval=false){const w=new BrowserWindow({width:1240,height:900,show:false,autoHideMenuBar:true,icon:path.join(assets,'icon.ico'),backgroundColor:'#0c1220',...options,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});w.setMenu(null);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());if(!approval)w.once('ready-to-show',()=>w.show());if(approval){const timer=setTimeout(()=>{if(!w.isDestroyed()&&!notificationReady)notificationFailure();},5000);w.once('closed',()=>clearTimeout(timer));w.webContents.on('render-process-gone',()=>{notificationFailure();w.destroy();});}w.loadFile(path.join(__dirname,approval?'notification.html':'index.html')).catch(notificationFailure);return w;}
async function command(event,cmd,a={}){
 if(![win,popup].some(w=>w&&!w.isDestroyed()&&w.webContents===event.sender))throw Error('Untrusted sender');
 switch(cmd){
 case 'state':return {...approvalState(),memories:memories.snapshot(),policies:config.policies,audit:config.audit,endpoint:'http://127.0.0.1:19741/mcp',token:unlock(config.token),proxy:proxy()||{type:'none',host:'127.0.0.1',port:1080},jobs:[...jobs.items.values()].map(({args,results,result,...j})=>j)};
 case 'approval-state':return approvalState();
 case 'notification-ready':if(event.sender===popup?.webContents){notificationReady=true;if(notificationWanted&&gate.pending.size&&config.notifications.dndUntil<=Date.now())popup.showInactive();}return true;
 case 'dismiss-notification':notificationWanted=false;popup?.hide();return true;
 case 'open-requests':navigate();notificationWanted=false;popup?.hide();return true;
 case 'notifications':{const {z}=require('zod');config.notifications=z.object({corner:z.enum(['bottom-right','bottom-left','top-right','top-left']),width:z.number().int().min(400).max(600),privacy:z.boolean(),dndUntil:z.number().min(0)}).strict().parse(a);save();if(a.dndUntil>Date.now()){notificationWanted=false;popup?.hide();}else showNotification();broadcast();return true;}
 case 'pause':pause(a.account||'*',!!a.enabled);return true;
 case 'memory-identity':return gate.identify(a.account,a.chat);
 case 'memory-preview':return memories.preview(a);
 case 'memory-change':{const preview=memories.preview(a);if(preview.scope.kind==='chat'&&!config.accounts.some(x=>x.id===preview.scope.account))throw Error('Unknown account');const result=memories.apply(preview);audit({operation:'owner_memory_change',allow:true,revision:memories.revision,noteIds:preview.changes.map(c=>c.id)});broadcast();return result;}
 case 'rules-preview':return gate.rules.preview(a);
 case 'rules-change':{if(a.expectedRevision!==undefined&&a.expectedRevision!==gate.rules.revision)throw Error('Rules changed; review again');const {expectedRevision,...change}=a;const result=gate.rules.change(change);audit({operation:'owner_rule_change',allow:true,reason:a.action});await gate.reconcile();broadcast();return result;}
 case 'rules-explain':return gate.explain(a.account,a.chat,a.operation);
 case 'revoke-grant':return gate.revoke(a.key);
 case 'decide':return gate.decide(a.id,a.allow,a.reason,a.duration||a.day);
 case 'decide-batch':{if(!Array.isArray(a.ids)||a.ids.length>100)throw Error('Invalid selection');if(a.ids.some(id=>['rule_change','memory_change'].includes(gate.pending.get(id)?.operation)))throw Error('Review memory and security changes individually');return a.ids.map(id=>({id,result:gate.decide(id,!!a.allow,a.reason||'Batch owner decision')}));}
 case 'accessible-chats':return require('./access.cjs').list(await client(a.account),gate,a.account,a);
 case 'folders':return advanced.run(await client(a.account),'folders',{});
 case 'dialogs':return tg.dialogs(await client(a.account),a.query||'',a.offset||0,100);
 case 'proxy-get':return proxy(a.account)||{type:'none',host:'127.0.0.1',port:1080};
 case 'proxy':{if(challenges.size)throw Error('Finish login before changing proxy');const {account,inherit,...settings}=a;normalizeProxy(settings);if(account){const target=config.accounts.find(x=>x.id===account);if(!target)throw Error('Unknown account');target.proxy=inherit?undefined:lock(JSON.stringify(settings));await tg.clients.get(account)?.disconnect();tg.clients.delete(account);}else{config.proxy=lock(JSON.stringify(settings));for(const c of tg.clients.values())await c.disconnect();tg.clients.clear();}save();broadcast();return true;}
 case 'reconnect':await tg.clients.get(a.account)?.disconnect();await client(a.account);broadcast();return true;
 case 'login':{if(challenges.size)throw Error('Finish current login first');const id=randomUUID(),account={id,label:a.label||a.phone,apiId:Number(a.apiId),apiHash:a.apiHash};if(!Number.isInteger(account.apiId)||account.apiId<=0||! /^[a-f0-9]{32}$/i.test(a.apiHash))throw Error('Invalid API ID/hash');const c=await tg.connect({...account,proxy:normalizeProxy(proxy())});const ask=kind=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{challenges.delete(id);reject(Error('Login timed out'));broadcast();},180000);challenges.set(id,{kind,resolve,reject,timer});broadcast();});void c.start({phoneNumber:async()=>a.phone,phoneCode:()=>ask('code'),password:()=>ask('password'),onError:e=>{throw e;}}).then(async()=>{config.accounts.push({...account,apiHash:lock(account.apiHash),session:lock(c.session.save())});save();await c.disconnect();tg.clients.delete(id);broadcast();}).catch(e=>audit({operation:'login',reason:e.message}));return id;}
 case 'challenge':return [...challenges].map(([id,v])=>({id,kind:v.kind}));
 case 'answer':{const r=challenges.get(a.id);if(!r)throw Error('Expired challenge');clearTimeout(r.timer);challenges.delete(a.id);r.resolve(a.value);return true;}
 case 'remove':await tg.clients.get(a.account)?.disconnect();tg.clients.delete(a.account);config.accounts=config.accounts.filter(x=>x.id!==a.account);delete config.policies[a.account];save();broadcast();return true;
 case 'job-cancel':{const j=jobs.get(a.id);if(j.operation!=='search_all')throw Error('Only search jobs can be cancelled');jobs.cancel(a.id);for(const r of gate.list())if(r.payload.jobId===a.id)gate.cancel(r.id);broadcast();return true;}
 default:throw Error('Unknown command');
 }
}
async function boot(){
 file=path.join(app.getPath('userData'),'vault.json');config=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{accounts:[],policies:{},audit:[],token:lock(randomBytes(32).toString('hex'))};config.notifications={corner:'bottom-right',width:460,privacy:false,dndUntil:0,...config.notifications};
 const migrate=!config.rulesState;gate.rules=new RuleBook(config.rulesState||{},state=>{config.rulesState=state;save();});
 if(migrate){for(const [account,p] of Object.entries(config.policies||{})){if(p.mode==='ask')continue;gate.rules.change({action:'create',rule:{name:'Imported read policy',account,effect:'allow',operations:['read_all'],selector:p.mode==='only'?{chats:p.chats}:{}}});if(p.mode==='only'||p.mode==='except'&&p.chats.length)gate.rules.change({action:'create',rule:{name:'Imported read exclusions',account,effect:'deny',operations:['read_all'],selector:p.mode==='only'?{excludeChats:p.chats}:{chats:p.chats}}});}config.policies={};}gate.policies=config.policies||{};
 gate.grants=new Map((config.grants||[]).map(g=>[g.key,g]));gate.persistGrants=list=>{config.grants=list;save();};
 gate.metadata=async(account,chat)=>{const c=await client(account),e=await c.getEntity(chat),m=identityFromEntity(e);if(gate.rules.rules.some(r=>r.selector.folderIds.length)){const ds=await c.getDialogs({limit:undefined}),d=ds.find(d=>require('telegram/Utils').getPeerId(d.entity).toString()===chat);m.folderIds=d?[d.archived?1:0,...(await advanced.folderData(c)).filter(f=>advanced.matchesFolder(f,d)).map(f=>f.id)]:[];}return m;};
 memories=new MemoryBook(config.memoriesCipher?JSON.parse(unlock(config.memoriesCipher)):{},state=>{const previous=config.memoriesCipher;try{config.memoriesCipher=lock(JSON.stringify(state));save();}catch(e){config.memoriesCipher=previous;throw e;}});
 jobs=new Jobs(config.jobsCipher?JSON.parse(unlock(config.jobsCipher)):[],items=>{config.jobsCipher=lock(JSON.stringify(items));save();});save();ipcMain.handle('command',command);
 win=window();win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();}});tray=new Tray(nativeImage.createFromPath(path.join(assets,'icon.png')).resize({width:32,height:32}));tray.on('double-click',()=>navigate());tray.on('click',()=>navigate());rebuildTray();
 if(approvalSmoke)win.webContents.once('did-finish-load',()=>require('../test/approval-smoke.cjs')({app,gate,memories,win,getPopup:()=>popup,getTray:()=>tray,setAccounts:a=>{config.accounts=a;},finish:()=>{quitting=true;app.quit();}}));
 else try{server=await serve({token:unlock(config.token),gate,accounts:()=>config.accounts,client,jobs,memories,onEvent:audit});}catch(e){audit({operation:'server_error',reason:e.message});}
 const timer=setInterval(()=>{if(config.notifications.dndUntil&&config.notifications.dndUntil<=Date.now()){config.notifications.dndUntil=0;save();showNotification();}},1000);timer.unref();
}
if(!app.requestSingleInstanceLock())app.quit();else app.whenReady().then(boot).catch(e=>{console.error(e);app.quit();});
app.on('second-instance',()=>win?.show());app.on('before-quit',()=>{quitting=true;gate.close();server?.close();for(const c of tg.clients.values())c.disconnect();});
