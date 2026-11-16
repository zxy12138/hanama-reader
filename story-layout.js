(function(root,factory){const lib=factory(typeof module==='object'&&module.exports?require('./reader-model.js'):root.ReaderModel);if(typeof module==='object'&&module.exports)module.exports=lib;else root.StoryLayout=lib;})(globalThis,model=>{
  const textOf=m=>model.normalize(m.text);
  function offset(text,value){let n=Math.max(0,Math.min(text.length,Math.trunc(Number(value)||0)));if(n>0&&n<text.length&&/[\uD800-\uDBFF]/.test(text[n-1])&&/[\uDC00-\uDFFF]/.test(text[n]))n--;return n;}
  function anchor(story,value){const m=story.messages.find(m=>m.id===value?.messageId);if(!m)throw Error('文字位置不属于当前故事');const text=textOf(m);const n=value.offset===undefined?text.length:Number(value.offset);if(!Number.isInteger(n)||n<0||n>text.length)throw Error('文字位置已失效，请重新选择');return {messageId:m.id,offset:offset(text,n)};}
  function segments(message,analysis,original=false){let pos=0;return (original?[{text:textOf(message),hidden:false}]:analysis.segments).map(s=>{const from=pos;pos+=s.text.length;return {...s,from,to:pos};});}
  function flow(message,analysis,images,original=false){
    const parts=segments(message,analysis,original),text=textOf(message),items=images.filter(i=>i.afterId===message.id&&!i.pending).map((image,index)=>{
      let at=offset(text,image.offset===undefined?text.length:image.offset);
      if(!original){const hidden=parts.find(s=>s.hidden&&s.from<at&&at<s.to);if(hidden)at=hidden.to;}
      return {type:'image',image,offset:at,index};
    }).sort((a,b)=>a.offset-b.offset||a.index-b.index),result=[];let imageIndex=0;
    for(const s of parts){let at=s.from;while(imageIndex<items.length&&items[imageIndex].offset<=s.to){const im=items[imageIndex++];if(im.offset>at)result.push({...s,type:'text',text:s.text.slice(at-s.from,im.offset-s.from),from:at,to:im.offset});result.push(im);at=Math.max(at,im.offset);}if(at<s.to)result.push({...s,type:'text',text:s.text.slice(at-s.from),from:at});}
    result.push(...items.slice(imageIndex));return original?result:foldExcluded(result);
  }
  // Display only: never modify exclusions, source text, export or stored offsets.
  function foldExcluded(parts){const out=[];for(let i=0;i<parts.length;i++){const s=parts[i],last=out.at(-1);if(s.type==='text'&&s.hidden&&last?.type==='text'&&last.hidden){last.text+=s.text;last.to=s.to;last.hiddenChars+=s.text.length;last.rules=[...new Set([...(last.rules||[]),...(s.rules||[])])];}
   else if(s.type==='text'&&!s.hidden&&!s.text.trim()&&last?.hidden&&parts[i+1]?.type==='text'&&parts[i+1].hidden){last.text+=s.text;last.to=s.to;}
   else out.push({...s,...(s.hidden?{hiddenChars:s.text.length}:{})});}return out;}
  function index(story){let total=0;const rows=story.messages.map(m=>{const start=total;total+=textOf(m).length+1;return {message:m,start,end:total-1};});return {rows,total:Math.max(0,total-1)};}
  function absolute(story,a){const valid=anchor(story,a),row=index(story).rows.find(r=>r.message.id===valid.messageId);return row.start+valid.offset;}
  function fromAbsolute(story,n){const {rows}=index(story);const row=rows.find(r=>n<=r.end)||rows.at(-1);return {messageId:row.message.id,offset:offset(textOf(row.message),n-row.start)};}
  function chapters(story,rules=[]){
    if(!story.messages.length)return [];
    const analyzed=model.analyzeMessages(story.messages,rules),{rows,total}=index(story),heads=[];
    for(const [i,row] of rows.entries())for(const s of segments(row.message,analyzed.messages[i])){
      if(s.hidden)continue;
      const re=/^(?:[ \t]*#{1,3}[ \t]+[^\n]{1,75}|[ \t]*(?:第[〇零一二三四五六七八九十百千万两\d]+[章节卷回部]|Chapter[ \t]+\d+)[^\n]{0,65})$/gim;let match;
      while((match=re.exec(s.text))){const at=row.start+s.from+match.index;if(at>row.start&&textOf(row.message)[s.from+match.index-1]!=='\n')continue;heads.push({title:match[0].trim().replace(/^#+\s*/,''),at});}
    }
    if(!heads.length)return rows.map((r,i)=>({id:'message-'+i,title:`对话 ${i+1} · ${r.message.name}`,start:{messageId:r.message.id,offset:0},end:{messageId:r.message.id,offset:textOf(r.message).length},fallback:true}));
    if(heads[0].at>0)heads.unshift({title:'序言 / 章节前内容',at:0});
    return heads.map((h,i)=>({id:'chapter-'+i,title:h.title,start:fromAbsolute(story,h.at),end:fromAbsolute(story,heads[i+1]?.at??total),fallback:false}));
  }
  function source(story,rules,scope={mode:'messages',from:0,to:0}){
    if(!story.messages.length)throw Error('请先导入故事');
    let start,end;
    if(scope.mode==='selection'){start=anchor(story,scope.start);end=anchor(story,scope.end);}
    else {
      const rows=scope.mode==='chapters'?chapters(story,rules):story.messages.map(m=>({start:{messageId:m.id,offset:0},end:{messageId:m.id,offset:textOf(m).length}}));
      const from=scope.mode==='all'?0:Number(scope.from??0),to=scope.mode==='all'?rows.length-1:Number(scope.to??from);
      if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=rows.length)throw Error('请选择有效的起止范围');
      start=rows[from].start;end=rows[to].end;
    }
    const lo=absolute(story,start),hi=absolute(story,end);if(hi<=lo)throw Error('选中范围为空或顺序不正确');
    const analysis=model.analyzeMessages(story.messages,rules),{rows}=index(story),pieces=[];
    for(const [i,row] of rows.entries()){
      if(row.end<lo||row.start>hi)continue;
      for(const s of segments(row.message,analysis.messages[i])){if(s.hidden)continue;const a=Math.max(s.from,lo-row.start),b=Math.min(s.to,hi-row.start);if(b>a)pieces.push({afterId:row.message.id,start:a,end:b,text:textOf(row.message).slice(a,b)});}
    }
    const chars=pieces.reduce((sum,p)=>sum+p.text.length,0);if(!pieces.some(p=>p.text.trim()))throw Error('范围内没有可用正文；被排除的内容不会发给模型');
    return {pieces,chars,start,end,text:pieces.map(p=>p.text).join('\n')};
  }
  function batches(pieces,limit=12000){
    if(!Number.isInteger(limit)||limit<3000||limit>20000)throw Error('每批字数需为 3000–20000');
    const out=[];let batch=[],size=0;
    for(const p of pieces){let at=0;while(at<p.text.length){let length=Math.min(limit-size,p.text.length-at);if(length===0){out.push(batch);batch=[];size=0;continue;}let end=offset(p.text,at+length);if(end===at){out.push(batch);batch=[];size=0;continue;}
      if(end<p.text.length){const br=p.text.lastIndexOf('\n',end-1);if(br>at+length*.6)end=br+1;}
      batch.push({...p,text:p.text.slice(at,end),start:p.start+at,end:p.start+end});size+=end-at;at=end;if(size>=limit){out.push(batch);batch=[];size=0;}
    }}if(batch.length)out.push(batch);if(out.length>10)throw Error('范围过大，超过 10 批；请缩小章节或对话范围，分次处理');return out;
  }
  return {offset,anchor,segments,flow,chapters,source,batches,absolute};
});
