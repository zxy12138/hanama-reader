const {createHash,randomUUID}=require('node:crypto');
const model=require('../reader-model.js');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Exact text only. Never use fuzzy similarity or an LLM to decide deletions.
function fingerprint(story){return hash(story.messages.map(m=>[m.id,m.name,m.text,m.dedupExcluded]));}
function scan(story){
 const lines=[],texts=story.messages.map(m=>model.normalize(m.text)),excluded=new Set();
 story.messages.forEach((m,messageIndex)=>{const text=texts[messageIndex];for(const match of text.matchAll(/[^\n]+(?:\n|$)/g)){
  if(!match[0].trim())continue;const from=match.index,to=from+match[0].length;
  if((m.dedupExcluded||[]).some(s=>s.from<to&&s.to>from))continue;
  lines.push({messageIndex,from,to,text:match[0].replace(/\n$/,''),key:hash([m.name,match[0].replace(/\n$/,'')])});
 }});
 const seen=new Map(),candidates=[];let truncated=false;
 const spans=(start,length)=>{const out=[];for(const line of lines.slice(start,start+length)){const last=out.at(-1);if(last&&last.messageIndex===line.messageIndex&&last.to===line.from)last.to=line.to;else out.push({messageIndex:line.messageIndex,from:line.from,to:line.to});}return out;};
 for(let i=0;i<lines.length;){let best=null;
  for(const earlier of (seen.get(lines[i].key)||[])){
   let length=0,chars=0;
   while(i+length<lines.length&&earlier+length<i&&!excluded.has(earlier+length)&&lines[earlier+length].key===lines[i+length].key){
    // Do not bridge over gaps (blank lines are okay, skipped/hidden nonblank text is not).
    if(length){const adjacent=(a,b)=>a.messageIndex===b.messageIndex? /^\s*$/.test(texts[a.messageIndex].slice(a.to,b.from)):b.messageIndex===a.messageIndex+1&&/^\s*$/.test(texts[a.messageIndex].slice(a.to))&&/^\s*$/.test(texts[b.messageIndex].slice(0,b.from));if(!adjacent(lines[i+length-1],lines[i+length])||!adjacent(lines[earlier+length-1],lines[earlier+length]))break;}
    chars+=lines[i+length].text.length;length++;
   }
   if((chars>=200||length>=2&&chars>=120)&&(!best||chars>best.chars))best={earlier,length,chars};
  }
  if(best){const keep=spans(best.earlier,best.length),remove=spans(i,best.length);candidates.push({id:String(candidates.length),keep,remove,chars:best.chars,paragraphs:best.length});for(let k=0;k<best.length;k++)excluded.add(i+k);i+=best.length;if(candidates.length>=200){truncated=i<lines.length;break;}}
  else {const list=seen.get(lines[i].key)||[];if(list.length<24)list.push(i);seen.set(lines[i].key,list);i++;}
 }
 return {token:randomUUID(),fingerprint:fingerprint(story),candidates,truncated};
}
function describe(story,review){return {token:review.token,truncated:review.truncated,candidates:review.candidates.map(c=>({...c,keepText:excerpt(story,c.keep),removeText:excerpt(story,c.remove),keepLocation:location(story,c.keep[0]),removeLocation:location(story,c.remove[0])}))};}
function excerpt(story,spans){return spans.map(s=>model.normalize(story.messages[s.messageIndex].text).slice(s.from,s.to)).join('\n');}
function location(story,span){const m=story.messages[span.messageIndex];return `第 ${span.messageIndex+1} 条 · ${m.name||'正文'} · 第 ${span.from+1} 字起`;}
function apply(story,review,ids){
 if(review.fingerprint!==fingerprint(story))throw Error('书籍已变化，请重新检查重复内容');
 if(!Array.isArray(ids)||ids.length!==new Set(ids).size||ids.some(id=>!review.candidates.some(c=>c.id===id)))throw Error('去重选择无效');
 const selected=review.candidates.filter(c=>ids.includes(c.id)),batchId=randomUUID();
 for(const c of selected)for(const span of c.remove){const m=story.messages[span.messageIndex];m.dedupExcluded||=[];m.dedupExcluded.push({from:span.from,to:span.to,batchId});}
 if(selected.length)story.contentRevision=(story.contentRevision||0)+1;
 return {count:selected.length,chars:selected.reduce((n,c)=>n+c.chars,0)};
}
function undo(story){for(const m of story.messages)delete m.dedupExcluded;story.contentRevision=(story.contentRevision||0)+1;}
module.exports={scan,describe,apply,undo,fingerprint};
