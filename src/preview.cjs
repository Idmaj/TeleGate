const {Api}=require('telegram');const {HTMLParser}=require('telegram/extensions/html');const {MarkdownParser}=require('telegram/extensions/markdown');
function preview(a){if(!a.text)return null;const [text,entities]=a.entities?[a.text,a.entities.map(e=>new Api['MessageEntity'+e.type](e))]:a.format==='markdown'?MarkdownParser.parse(a.text):HTMLParser.parse(a.text);return HTMLParser.unparse(text,entities);}
module.exports={preview};
