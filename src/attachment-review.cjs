const {createHash}=require('node:crypto');
const MAX_PREVIEW_BYTES=256*1024,MAX_IMAGE_BYTES=2*1024*1024;
function attachments(payload){return payload.files|| (payload.base64?[{filename:payload.filename,base64:payload.base64}]:[]);}
function decode(file){
 if(typeof file.base64!=='string'||file.base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(file.base64))throw Error('Invalid attachment encoding');
 const bytes=Buffer.from(file.base64,'base64');if(bytes.toString('base64')!==file.base64)throw Error('Invalid attachment encoding');if(!bytes.length||bytes.length>10*1024*1024)throw Error('Each attachment must be 1 byte to 10 MB');return bytes;
}
function describe(file,index){
 const bytes=decode(file),review={index,filename:file.filename||'attachment.bin',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),requiresExport:true};
 let type;
 if(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))type='image/png';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';
 else if(['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()))type='image/gif';
 else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')type='image/webp';
 if(type&&bytes.length<=MAX_IMAGE_BYTES){review.image='data:'+type+';base64,'+bytes.toString('base64');review.requiresExport=false;}
 else if(bytes.length<=MAX_PREVIEW_BYTES){
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)){review.text=text;review.requiresExport=false;}}catch{}
 }
 return review;
}
function review(payload){return attachments(payload).map(describe);}
module.exports={attachments,decode,review};
