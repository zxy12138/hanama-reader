const {randomUUID,createHash}=require('node:crypto'),layout=require('../story-layout.js'),model=require('../reader-model.js'),manual=require('./manual-hide.cjs');
const fingerprint=s=>createHash('sha256').update(JSON.stringify([s.id,s.contentRevision,s.messages.map(m=>[m.id,m.text])])).digest('hex');
function scan(story,args){
 const start=layout.anchor(story,args.start),end=layout.anchor(story,args.end),texts=story.messages.map(m=>model.normalize(m.text));let offset=0;
 const blocks=texts.map((text,i)=>{const b={id:story.messages[i].id,start:offset,end:offset+text.length,index:i};offset+=text.length+1;return b;});
 const a=blocks.find(b=>b.id===start.messageId).start+start.offset,b=blocks.find(b=>b.id===end.messageId).start+end.offset;
 if(b<=a||b-a>20000)throw Error('请选择 1–20,000 字的正文范围');
 const full=texts.join('\n'),needle=full.slice(a,b);if(!needle.trim())throw Error('不能批量屏蔽纯空白内容');
 const matches=[];let at=full.indexOf(needle),truncated=false;
 while(at>=0){if(matches.length>=5000){truncated=true;break;}const spans=blocks.filter(p=>p.start<at+needle.length&&p.end>at).map(p=>({messageId:p.id,from:Math.max(0,at-p.start),to:Math.min(p.end,at+needle.length)-p.start}));
  if(spans.length)matches.push({id:String(matches.length),spans,selected:at===a,location:`第 ${blocks.find(p=>p.id===spans[0].messageId).index+1} 条 · 第 ${spans[0].from+1} 字`,before:full.slice(Math.max(0,at-60),at),after:full.slice(at+needle.length,at+needle.length+60)});
  at=full.indexOf(needle,at+needle.length);
 }
 return {token:randomUUID(),storyId:story.id,fingerprint:fingerprint(story),text:needle,matches,truncated};
}
function describe(review){return {token:review.token,storyId:review.storyId,text:review.text,matches:review.matches.map(({spans,...m})=>m),truncated:review.truncated};}
function apply(story,review,ids){
 if(!review||review.storyId!==story.id||review.fingerprint!==fingerprint(story))throw Error('正文或屏蔽状态已变化，请重新查找相同内容');
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!review.matches.some(m=>m.id===id)))throw Error('请选择有效的匹配位置');
 const chosen=review.matches.filter(m=>ids.includes(m.id)),historyStart=story.manualHideHistory?.length||0;let count=0;
 for(const match of chosen){const first=match.spans[0],last=match.spans.at(-1);count+=manual.hide(story,{start:{messageId:first.messageId,offset:first.from},end:{messageId:last.messageId,offset:last.to}}).count;}
 const entries=story.manualHideHistory.splice(historyStart),groupId=entries[0].id,groups=new Set(entries.map(e=>e.id));
 for(const m of story.messages)for(const span of m.manualExcluded||[])if(groups.has(span.groupId))span.groupId=groupId;
 story.manualHideHistory.push({id:groupId,time:Date.now(),restoreOnUndo:entries.flatMap(e=>e.restoreOnUndo||[])});
 return {count,matches:chosen.length};
}
module.exports={scan,describe,apply};
