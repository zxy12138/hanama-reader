const nai=require('./novelai.cjs'),assets=require('./image-assets.cjs');
const fields=['model','width','height','steps','scale'];
function parameters(drawing,input={}){return nai.parameters({...drawing,width:768,height:1152,...Object.fromEntries(fields.filter(k=>input[k]!==undefined).map(k=>[k,input[k]])),seed:-1});}
function text(value,name,max,required=false){if(typeof value!=='string'||value.length>max||required&&!value.trim())throw Error(`${name}无效（最多 ${max} 字）`);return value.trim();}
function title(input,story){return {title:text(input.title??story.title,'封面书名',100,true),author:text(input.author||'','作者',80),showText:input.showText!==false};}
function pick(story,gallery,input){const overlay=title(input,story);if(input.imageId===null||input.imageId==='')return {...overlay,imageId:'',updatedAt:Date.now()};const image=gallery.find(i=>i.id===input.imageId&&!i.deletedAt&&!i.missing);if(!image)throw Error('封面图片已删除或不存在，请重新选择');return {...overlay,imageId:image.id,updatedAt:Date.now()};}
function list(story,gallery){return {book:{id:story.id,title:story.title,cover:assets.cover(story.cover,gallery)},candidates:gallery.filter(i=>i.kind==='cover'&&i.sourceStoryId===story.id&&!i.deletedAt&&!i.missing).slice(-40).reverse().map(assets.picture),gallery:gallery.filter(i=>i.kind!=='cover'&&!i.deletedAt&&!i.missing).slice(-300).reverse().map(assets.picture)};}
const promptContract={kind:'cover',hint:'仅返回 JSON {"prompt":"英文封面画面标签","negativePrompt":"英文负面标签"}。不画书名或作者，预留上方标题空间。',validate:d=>({prompt:text(d.prompt,'封面提示词',16000,true),negativePrompt:text(d.negativePrompt||'','负面提示词',16000)})};
module.exports={parameters,text,title,pick,list,promptContract};
