const {test}=require('node:test'),assert=require('node:assert/strict');const {TelegramSyncTransport:T}=require('../src/sync-telegram.cjs');const C=require('../src/sync-core.cjs');const {mockTelegram}=require('./helpers/sync-telegram.cjs');
test('private channel creation, joining and encrypted upload/download use valid Telegram requests',async()=>{
 const c=mockTelegram(),settings=await T.create(c,'synthetic shared passphrase');assert.equal(settings.channel,'-10012345');const t=new T(c,settings.channel);await t.verify();await t.checkHeader(settings);
 const joined=await T.join(c,settings.channel,'synthetic shared passphrase');assert.equal(joined.key,settings.key);await assert.rejects(T.join(c,settings.channel,'a different long passphrase'),/authenticate/);
 const file=C.seal({v:1,records:{}},settings.key,settings.workspace);const id=await t.send(file,'test-device');const page=await t.read(0);assert.equal(page.files.length,1);assert.equal(page.cursor,id);assert.deepEqual(C.open(page.files[0].buffer,settings.key,settings.workspace),{v:1,records:{}});await t.remove([id]);assert.deepEqual(c.removed,[id]);
});
test('public/shared channels, missing workspace and oversized attachments fail closed',async()=>{
 const c=mockTelegram(),settings=await T.create(c,'synthetic shared passphrase'),t=new T(c,settings.channel);
 c.subscribers=2;await assert.rejects(t.verify(),/private/);c.subscribers=1;c.entity.username='public_channel';await assert.rejects(t.verify(),/private/);delete c.entity.username;
 c.messages.push({id:100,message:'TeleGate encrypted sync v1 test',media:{document:{size:C.MAX_BYTES*2}}});await assert.rejects(t.read(0),/oversized/);
 c.messages.splice(0,1);await assert.rejects(t.checkHeader(settings),/deleted/);
});
