const {randomUUID}=require('node:crypto'),layout=require('../story-layout.js'),model=require('../reader-model.js');
function add(story,args){
 const start=layout.anchor(story,args.start),end=layout.anchor(story,args.end);
 if(layout.absolute(story,end)<=layout.absolute(story,start))throw Error('请先选中一段正文');
 const existing=(story.bookmarks||[]).find(b=>JSON.stringify(b.start)===JSON.stringify(start)&&JSON.stringify(b.end)===JSON.stringify(end));if(existing)return existing;
 const first=story.messages.findIndex(m=>m.id===start.messageId),last=story.messages.findIndex(m=>m.id===end.messageId);
 let excerpt='';for(let i=first;i<=last&&excerpt.length<180;i++){const text=model.normalize(story.messages[i].text);excerpt+=text.slice(i===first?start.offset:0,Math.min(i===last?end.offset:text.length,(i===first?start.offset:0)+180-excerpt.length))+' ';}
 excerpt=excerpt.trim().slice(0,180);if(!excerpt)throw Error('请选择包含文字的段落');
 const counts=Array.from({length:6},(_,i)=>(story.bookmarks||[]).filter(b=>b.colorIndex===i).length),colorIndex=counts.indexOf(Math.min(...counts));
 const bookmark={id:randomUUID(),start,end,excerpt,colorIndex,createdAt:Date.now()};(story.bookmarks||=[]).push(bookmark);return bookmark;
}
function remove(story,id){story.bookmarks=(story.bookmarks||[]).filter(b=>b.id!==id);}
module.exports={add,remove};
