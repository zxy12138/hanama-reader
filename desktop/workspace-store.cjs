const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const clone=v=>structuredClone(v),metadata=picture=>{const {dataUrl,...rest}=picture;return rest;};
class WorkspaceStore{
 constructor(file){this.file=file;this.dir=path.dirname(file);this.gallery=[];this.archives={};this.removedBooks={};this.globalRules=[];this.updatedAt=null;this.failed=false;this.tail=Promise.resolve();}
 async atomic(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';const h=await fs.open(tmp,'wx');try{await h.writeFile(data);await h.sync();}finally{await h.close();}await fs.rename(tmp,file);}
 async load(){
  let saved;try{saved=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;try{saved=JSON.parse(await fs.readFile(this.file+'.bak','utf8'));this.recovered=true;}catch{this.failed=true;throw Error('故事存档无法读取，已保护原文件；请勿重新导入覆盖，需恢复备份');}}
  if(!Array.isArray(saved.story?.messages)||!Array.isArray(saved.rules)){this.failed=true;throw Error('故事存档格式无效，已保护原文件');}
  this.gallery=saved.gallery||[];this.archives=saved.archives||{};this.removedBooks=saved.removedBooks||{};this.globalRules=saved.globalRules||[];this.updatedAt=saved.updatedAt||null;
  for(const item of this.gallery){if(item.asset&&/^[a-f0-9]{64}\.(png|jpeg|webp)$/.test(item.asset)){try{item.dataUrl=`data:image/${path.extname(item.asset).slice(1)};base64,${(await fs.readFile(path.join(this.dir,'images',item.asset))).toString('base64')}`;}catch{item.missing=true;}}}
  saved.story.id||=require('./core.cjs').storyId(saved.story.messages);this.collect(saved.story);saved.story=this.hydrate(saved.story);return saved;
 }
 collect(story){for(const p of story.images||[]){p.id||=randomUUID();let asset=this.gallery.find(i=>i.id===p.id);if(!asset){asset={...p,sourceStoryId:story.id,sourceTitle:story.title,createdAt:Date.now()};this.gallery.push(asset);}else if(p.dataUrl&&!asset.dataUrl)asset.dataUrl=p.dataUrl;}}
 hydrate(story){const result=clone(story);result.images=(result.images||[]).map(p=>({...this.gallery.find(i=>i.id===p.id),...p})).filter(p=>!p.deletedAt);return result;}
 remember(story,rules){if(!story.messages.length)return;this.collect(story);this.archives[story.id]={story:clone({...story,images:(story.images||[]).map(metadata)}),rules:clone(rules)};}
 removeBook(id,story,rules){this.remember(story,rules);const target=this.archives[id];if(!target)throw Error('书籍不存在');this.removedBooks[id]={...target,removedAt:Date.now()};delete this.archives[id];if(id!==story.id)return {story,rules};const next=Object.values(this.archives)[0];return next?{story:this.hydrate(next.story),rules:clone(next.rules)}:{story:{id:'empty-'+randomUUID(),title:'尚未导入故事',messages:[],images:[],useGlobalRules:true},rules:[]};}
 restoreBook(id){const target=this.removedBooks[id];if(!target)throw Error('书籍不在已移除列表');if(this.archives[id])throw Error('书架中已有这本书');this.archives[id]={story:clone(target.story),rules:clone(target.rules)};delete this.removedBooks[id];}
 async deleteRemovedBook(id,story,rules){
  if(typeof id!=='string'||!Object.hasOwn(this.removedBooks,id))throw Error('只能永久删除已移除列表中的书籍');
  if(story.id===id||Object.hasOwn(this.archives,id))throw Error('这本书已恢复到书架，请先移出书架');
  const target=this.removedBooks[id];delete this.removedBooks[id];
  try{await this.save(story,rules,{purgedBookIds:[id]});}catch(e){this.removedBooks[id]=target;throw e;}
 }
 switchTo(incoming,story,rules){this.remember(story,rules);const prior=this.archives[incoming.id]||this.removedBooks[incoming.id];if(prior){delete this.removedBooks[incoming.id];const restored=this.hydrate(prior.story);if(incoming.sources?.length){const old=restored.sources||[];restored.sources=[...incoming.sources.filter(s=>!old.some(p=>p.contentId===s.contentId)),...old.map(s=>({...s,...incoming.sources.find(p=>p.contentId===s.contentId)}))].map(clone);}return {story:restored,rules:clone(prior.rules)};}return {story:{...incoming,useGlobalRules:incoming.useGlobalRules??true},rules:[]};}
 async save(story,rules,{purgedBookIds=[]}={}){
  if(this.failed)throw Error('存档读取失败，已停止写入以保护原数据');this.collect(story);this.remember(story,rules);
  const snapshot={version:4,story:clone({...story,images:(story.images||[]).map(metadata)}),rules:clone(rules),globalRules:clone(this.globalRules),gallery:clone(this.gallery.map(metadata)),archives:clone(this.archives),removedBooks:clone(this.removedBooks),updatedAt:Date.now()};delete snapshot.archives[story.id];
  const imageData=new Map(this.gallery.map(item=>[item.id,item.dataUrl]));
  const job=async()=>{
   for(const item of snapshot.gallery){if(imageData.get(item.id)){if(/^[a-f0-9]{64}\.(png|jpeg|webp)$/.test(item.asset||'')){try{await fs.access(path.join(this.dir,'images',item.asset));continue;}catch{}}const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(imageData.get(item.id));if(!match)throw Error('图片数据无效，尚未保存');const bytes=Buffer.from(match[2],'base64');item.asset=createHash('sha256').update(bytes).digest('hex')+'.'+match[1];const file=path.join(this.dir,'images',item.asset);try{await fs.access(file);}catch{await this.atomic(file,bytes);}const live=this.gallery.find(i=>i.id===item.id);if(live)live.asset=item.asset;delete item.dataUrl;}}
   // The backup is metadata only; immutable image files are shared by both snapshots.
   // A permanent deletion must also leave no restorable book in automatic backup.
   if(purgedBookIds.length)await this.atomic(this.file+'.bak',JSON.stringify(snapshot));
   else try{const previous=await fs.readFile(this.file);JSON.parse(previous);await this.atomic(this.file+'.bak',previous);}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
   await this.atomic(this.file,JSON.stringify(snapshot));this.updatedAt=snapshot.updatedAt;
  };const task=this.tail.then(job);this.tail=task.catch(()=>{});await task;
 }
 removeEverywhere(id){for(const archive of Object.values(this.archives))archive.story.images=(archive.story.images||[]).filter(i=>i.id!==id);}
}
module.exports={WorkspaceStore};
