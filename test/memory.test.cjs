const {test}=require('node:test'),assert=require('node:assert/strict');
const {MemoryBook,maintenance}=require('../src/memory.cjs');
const {Gate}=require('../src/gate.cjs');
const globalScope={kind:'global'},chatScope={kind:'chat',account:'a',chat:'123'};
function change(book,scope,changes){return book.change({scope,expectedRevision:book.revision,changes,reason:'Owner requested'});}
const create=(title,text)=>({action:'create',title,text});
const waitFor=async gate=>{for(let i=0;i<100;i++){if(gate.pending.size)return gate.list()[0];await new Promise(r=>setTimeout(r,5));}throw Error('No approval');};

test('memory scopes combine global and exact account/chat notes and survive reload',()=>{
 let saved;const book=new MemoryBook({},s=>saved=s);change(book,globalScope,[create('Style','Be concise.')]);change(book,chatScope,[create('Topics','Use the planning topic for release coordination.')]);change(book,{kind:'chat',account:'b',chat:'123'},[create('Private','Other account note')]);
 const restored=new MemoryBook(saved),context=restored.context(chatScope);assert.equal(context.global[0].text,'Be concise.');assert.equal(context.chat[0].text,'Use the planning topic for release coordination.');assert.equal(context.chat.length,1);assert.equal(restored.context().chat.length,0);assert.equal(restored.context({kind:'chat',account:'a',chat:'999'}).chat.length,0);
 context.chat[0].text='mutated';assert.notEqual(restored.context(chatScope).chat[0].text,'mutated');
});

test('memory cleanup deletes, updates and creates atomically without touching unrelated notes',()=>{
 const commits=[],book=new MemoryBook({},s=>commits.push(s));change(book,chatScope,[create('Old','Use the legacy project name.'),create('Terminology','Use the legacy project name.'),create('Topic','Use the planning topic.')]);
 const [old,style,topic]=book.context(chatScope).chat;const preview=book.preview({scope:chatScope,expectedRevision:book.revision,reason:'Update project terminology',changes:[create('Length','Keep it short.'),{action:'update',id:style.id,text:'Use the current project name.'},{action:'delete',id:old.id}]});
 assert.deepEqual(preview.changes.map(c=>c.action),['delete','update','create']);assert.equal(book.context(chatScope).chat.length,3);book.apply(preview);assert.equal(commits.length,2);
 const notes=book.context(chatScope).chat;assert.ok(!notes.some(n=>n.id===old.id));assert.equal(notes.find(n=>n.id===style.id).text,'Use the current project name.');assert.equal(notes.find(n=>n.id===topic.id).text,'Use the planning topic.');
});

test('memory is free text: topic instructions and contradictory prose are not interpreted or blocked',()=>{
 const book=new MemoryBook();change(book,chatScope,[create('One','Track releases in the planning topic. 🚀'),create('Two','Track releases in the delivery topic.')]);assert.equal(book.entries.length,2);assert.match(book.entries[0].text,/🚀/);
 assert.match(maintenance,/concise/);assert.match(maintenance,/updating/);assert.match(maintenance,/contradictory/);assert.match(maintenance,/Before proposing/);assert.match(maintenance,/After approval/);
});

test('memory refuses cross-scope edits, duplicate targets and stale revisions',()=>{
 const book=new MemoryBook();change(book,chatScope,[create('Note','Original')]);const note=book.entries[0];
 assert.throws(()=>change(book,globalScope,[{action:'delete',id:note.id}]),/not found/);
 assert.throws(()=>change(book,chatScope,[{action:'delete',id:note.id},{action:'update',id:note.id,text:'Replacement'}]),/only once/);
 const preview=book.preview({scope:chatScope,expectedRevision:book.revision,reason:'Update',changes:[{action:'update',id:note.id,text:'Replacement'}]});change(book,globalScope,[create('Other','Preserve')]);assert.throws(()=>book.apply(preview),/changed/);assert.equal(book.entries.find(n=>n.id===note.id).text,'Original');
});

test('memory persistence failure rolls back the entire batch and revision',()=>{
 const book=new MemoryBook();change(book,globalScope,[create('Keep','Original')]);const before=book.snapshot();book.persist=()=>{throw Error('Disk full');};
 assert.throws(()=>change(book,globalScope,[{action:'delete',id:book.entries[0].id},create('New','Replacement')]),/Disk full/);assert.deepEqual(book.snapshot(),before);
});

test('AI memory changes require dedicated one-time approval and preserve rejection reason',async()=>{
 const gate=new Gate(()=>{}),book=new MemoryBook();gate.rules.change({action:'create',rule:{name:'Everything readable',account:'*',effect:'allow',operations:['read_all']}});
 const input={scope:globalScope,expectedRevision:0,reason:'User asked to remember',changes:[create('Tone','Use the current project name.')]};
 const first=book.propose(gate,input).catch(e=>e);const r=await waitFor(gate);assert.equal(r.operation,'memory_change');assert.equal(r.write,true);assert.equal(r.scope,null);assert.equal(book.entries.length,0);assert.throws(()=>gate.decide(r.id,true,'',{seconds:null}),/Reusable permissions/);gate.decide(r.id,false,'Too broad');assert.match((await first).message,/Too broad/);assert.equal(book.revision,0);
 const next=book.propose(gate,input);gate.decide((await waitFor(gate)).id,true);assert.equal((await next).memory.global[0].text,'Use the current project name.');assert.equal(book.revision,1);gate.close();
});

test('pending memory proposal cannot overwrite a newer owner edit or bypass pause',async()=>{
 const gate=new Gate(()=>{}),book=new MemoryBook(),input={scope:chatScope,expectedRevision:0,reason:'User requested',changes:[create('Terminology','Use the current project name.')]};
 const pending=book.propose(gate,input).catch(e=>e);const r=await waitFor(gate);change(book,chatScope,[create('Owner edit','Preserve this')]);gate.decide(r.id,true);assert.match((await pending).message,/changed/);assert.equal(book.entries[0].text,'Preserve this');
 gate.rules.pause('a',true);await assert.rejects(book.propose(gate,{...input,expectedRevision:book.revision}),/paused/);gate.close();
});
