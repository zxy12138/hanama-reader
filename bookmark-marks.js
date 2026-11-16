window.BookmarkMarks={create({reader,storyNode,getStory,jump}){
 const colors=['#b74370','#346ec4','#28826d','#9561bd','#b46b22','#247e91'];
 const color=b=>colors[Number.isInteger(b.colorIndex)&&b.colorIndex>=0&&b.colorIndex<colors.length?b.colorIndex:(String(b.id).split('').reduce((n,c)=>n+c.charCodeAt(0),0))%colors.length];
 const rail=document.createElement('nav');rail.id='bookmarkRail';rail.setAttribute('aria-label','滚动条书签');document.body.append(rail);
 let frame=0,active=null;
 const hidden=()=>{const panel=new URLSearchParams(location.search).get('panel');return document.getElementById('readingView').hidden||!!panel&&panel!=='reader'||reader.getBoundingClientRect().height<=0;};
 function position(){const r=reader.getBoundingClientRect();rail.hidden=hidden()||!getStory()?.bookmarks?.length;rail.style.top=(r.top+16)+'px';rail.style.height=Math.max(0,r.height-32)+'px';rail.style.left=(r.right-(reader.offsetWidth-reader.clientWidth)-44)+'px';}
 function boundary(segment,offset){let left=offset-Number(segment.dataset.rawStart),node;const walk=document.createTreeWalker(segment,NodeFilter.SHOW_TEXT);while(node=walk.nextNode()){if(left<=node.length)return [node,Math.max(0,left)];left-=node.length;}return null;}
 function paint(){
   frame=0;position();const story=getStory();if(!story)return;
   for(let i=0;i<colors.length;i++)CSS.highlights?.delete('bookmark-'+i);
   storyNode.querySelectorAll('.bookmark-folded').forEach(n=>{n.classList.remove('bookmark-folded');n.style.removeProperty('--bookmark-color');});
   if(!CSS.highlights)return;
   const highlights=colors.map(()=>new Highlight()),indices=new Map(story.messages.map((m,i)=>[m.id,i]));
   const segments=[...storyNode.querySelectorAll('.text-segment')].map(node=>({node,index:indices.get(node.closest('.message-block').dataset.id),from:Number(node.dataset.rawStart),to:Number(node.dataset.rawEnd)}));
   for(const b of story.bookmarks||[]){const lo=indices.get(b.start.messageId),hi=indices.get(b.end.messageId),c=color(b),h=highlights[colors.indexOf(c)];if(lo===undefined||hi===undefined)continue;
     for(const s of segments){if(s.index<lo||s.index>hi)continue;const from=Math.max(s.from,s.index===lo?b.start.offset:0),to=Math.min(s.to,s.index===hi?b.end.offset:Infinity);if(to<=from)continue;
       const a=boundary(s.node,from),z=boundary(s.node,to);if(a&&z){const range=document.createRange();range.setStart(...a);range.setEnd(...z);h.add(range);}
       const summary=s.node.closest('details:not([open])')?.querySelector('summary');if(summary){summary.classList.add('bookmark-folded');summary.style.setProperty('--bookmark-color',c);}
     }
   }
   highlights.forEach((h,i)=>CSS.highlights.set('bookmark-'+i,h));
 }
 function update(){
   rail.replaceChildren();const story=getStory(),items=story?.bookmarks||[];let total=0;const offsets=new Map();for(const m of story?.messages||[]){offsets.set(m.id,total);total+=ReaderModel.normalize(m.text).length;}
   const laneEnds=[-99,-99,-99];position();
   for(const b of [...items].sort((a,b)=>(offsets.get(a.start.messageId)+a.start.offset)-(offsets.get(b.start.messageId)+b.start.offset))){if(!offsets.has(b.start.messageId))continue;const ratio=(offsets.get(b.start.messageId)+b.start.offset)/Math.max(1,total),y=ratio*Math.max(1,rail.clientHeight-14);let lane=laneEnds.findIndex(end=>end+3<y);if(lane<0)lane=laneEnds.indexOf(Math.min(...laneEnds));laneEnds[lane]=y+14;
     const button=document.createElement('button');button.className='bookmark-marker';button.dataset.bookmarkId=b.id;button.style.setProperty('--bookmark-color',color(b));button.style.top=`calc(${ratio*100}% - ${ratio*14}px)`;button.style.left=(lane*12)+'px';button.title=b.excerpt;button.setAttribute('aria-label','跳转到书签：'+b.excerpt);button.setAttribute('aria-current',String(active===b.id));button.onclick=()=>{active=b.id;rail.querySelectorAll('button').forEach(n=>n.setAttribute('aria-current',String(n===button)));jump(b);};rail.append(button);
   }
   schedule();
 }
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(paint);}
 new ResizeObserver(update).observe(reader);
 new MutationObserver(position).observe(document.getElementById('readingView'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('resize',update);storyNode.addEventListener('toggle',schedule,true);
 return {update,paint:schedule,color};
}};
