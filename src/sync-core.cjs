const crypto = require('node:crypto');
const {promisify} = require('node:util');
const {z} = require('zod');
const {ruleSchema, READS} = require('./rules.cjs');
const {MemoryBook} = require('./memory.cjs');
const MAX_BYTES = 4 * 1024 * 1024;
const stable = value => JSON.stringify(sort(value));
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
const hash = v => crypto.createHash('sha256').update(stable(v)).digest('hex');
async function deriveKey(password, salt) {
 if (typeof password !== 'string' || password.length < 16 || password.length > 1024) throw Error('Use a sync passphrase of 16–1024 characters.');
 if (!/^[a-f0-9]{32}$/.test(salt)) throw Error('Invalid workspace salt');
 return (await promisify(crypto.scrypt)(password, Buffer.from(salt,'hex'), 32, {N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('base64');
}
function seal(value, key, workspace) {
 const data=Buffer.from(stable(value)); if(data.length>MAX_BYTES)throw Error('Sync workspace exceeds the 4 MB limit.');
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv);c.setAAD(Buffer.from(workspace));
 const encrypted=Buffer.concat([c.update(data),c.final()]);
 return Buffer.from(JSON.stringify({v:1,workspace,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:encrypted.toString('base64')}));
}
function open(buffer,key,workspace){
 if(buffer.length>MAX_BYTES*1.5)throw Error('Sync file is too large');
 const e=JSON.parse(buffer.toString());if(e.v!==1||e.workspace!==workspace)throw Error('Wrong sync workspace');
 const iv=Buffer.from(e.iv,'base64'),tag=Buffer.from(e.tag,'base64');if(iv.length!==12||tag.length!==16)throw Error('Invalid encrypted sync file');
 const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv);d.setAAD(Buffer.from(workspace));d.setAuthTag(tag);
 try{return JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString());}catch{throw Error('Unable to authenticate sync data. Check the passphrase and workspace.');}
}
const grantSchema=z.object({account:z.string(),kind:z.enum(['chat','operation','operation-chat']),chat:z.string().regex(/^-?\d+$/).optional(),operation:z.enum(READS).optional(),expires:z.number().int().positive().nullable(),title:z.string().max(200).optional()}).strict().superRefine((g,c)=>{if(g.kind!=='operation'&&!g.chat||g.kind!=='chat'&&!g.operation)c.addIssue({code:'custom',message:'Invalid saved permission'});});
function validateValue(id,value){
 if(value===null)return null;
 let v;if(id.startsWith('rule:')){const {uses,...fields}=value;v=ruleSchema.parse(fields);if(id!=='rule:'+v.id)throw Error('Rule ID mismatch');}
 else if(id.startsWith('memory:')){v=new MemoryBook({entries:[value]}).entries[0];if(id!=='memory:'+v.id)throw Error('Memory ID mismatch');}
 else if(id.startsWith('grant:'))v=grantSchema.parse(value);else throw Error('Unknown sync record');
 const account=v.account||v.scope?.account;if(account&&account!=='*'&&!/^tg:\d+$/.test(account))throw Error('Sync requires stable Telegram account IDs');
 return v;
}
const clockSchema=z.record(z.string().uuid(),z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));
function validateRecords(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length>10000)throw Error('Invalid sync records');
 const result={};for(const [id,versions]of Object.entries(input)){
  if(!/^(rule|memory|grant):[a-zA-Z0-9-]{1,128}$/.test(id)||!Array.isArray(versions)||!versions.length||versions.length>32)throw Error('Invalid sync record');
  result[id]=versions.map(v=>{const clock=clockSchema.parse(v.clock);if(!Object.keys(clock).length||Object.keys(clock).length>64)throw Error('Invalid device clock');return {clock,value:validateValue(id,v.value)};});
 }return result;
}
const dominates=(a,b)=>Object.entries(b).every(([k,v])=>(a[k]||0)>=v);
function merge(a,b){
 const result={};for(const id of new Set([...Object.keys(a),...Object.keys(b)])){
  const all=[...a[id]||[],...b[id]||[]],unique=new Map();for(const v of all){const k=stable(v.clock),old=unique.get(k);if(old&&stable(old.value)!==stable(v.value))throw Error('Conflicting data for the same device version');unique.set(k,v);}
  const vs=[...unique.values()];result[id]=vs.filter(v=>!vs.some(w=>w!==v&&dominates(w.clock,v.clock))).sort((x,y)=>hash(x).localeCompare(hash(y)));
 }return result;
}
function write(records,id,value,device){
 const clock={};for(const v of records[id]||[])for(const[k,n]of Object.entries(v.clock))clock[k]=Math.max(clock[k]||0,n);
 clock[device]=(clock[device]||0)+1;records[id]=[{clock,value:structuredClone(value)}];
}
function capture(s,current){
 for(const id of new Set([...Object.keys(s.base),...Object.keys(current)]))if(stable(s.base[id]??null)!==stable(current[id]??null))write(s.records,id,current[id]??null,s.device);
 s.base=structuredClone(current);
}
function safeRuleChange(before,after){
 if(stable(before)===stable(after))return true;
 if(!before)return !after||!after.enabled||after.effect!=='allow';
 if(before.effect==='allow')return !after||!after.enabled||after.effect!=='allow';
 return false; // Narrowing selectors or deleting an Ask/Deny can expand access.
}
function automatic(id,before,after){if(id.startsWith('memory:'))return true;if(id.startsWith('grant:'))return !after;return safeRuleChange(before,after);}
function project(s,current,canMap){
 const out=structuredClone(current),pending=[];
 for(const[id,versions]of Object.entries(s.records)){
  const before=current[id]??null,fingerprint=hash(versions);if(s.dismissed[id]===fingerprint)continue;
  if(versions.length===1&&stable(before)===stable(versions[0].value))continue;
  const mapped=versions.every(v=>!v.value||canMap(v.value));
  if(versions.length===1&&mapped&&automatic(id,before,versions[0].value)){if(versions[0].value===null)delete out[id];else out[id]=versions[0].value;}
  else pending.push({id,fingerprint,before,versions,reason:!mapped?'Sign in to the matching Telegram account':versions.length>1?'Concurrent changes require a choice':'Review access change on this device',blocked:!mapped});
 }s.pending=pending;s.base=structuredClone(out);return out;
}
function newState(){return {device:crypto.randomUUID(),records:{},base:{},dismissed:{},pending:[],cursor:0,sentHash:null,ownMessages:[],lastSync:null};}
module.exports={MAX_BYTES,stable,hash,deriveKey,seal,open,validateRecords,merge,write,capture,project,newState,grantSchema};
