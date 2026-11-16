(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.ReaderModel = model;
})(globalThis, () => {
  const normalize = text => String(text).replace(/\r\n?/g, '\n');
  function analyzeMessages(messages, rules) {
    const texts = messages.map(m => normalize(m.text));
    const full = texts.join('\n'), intervals = [], stats = [];
    rules.forEach((rule, index) => {
      const stat = { matches: 0, unclosed: 0 }; stats.push(stat);
      const start = normalize(rule.start || ''), end = normalize(rule.end || '');
      if (!rule.enabled || !start || !end) return;
      let cursor = 0;
      while (cursor < full.length) {
        const a = full.indexOf(start, cursor);
        if (a < 0) break;
        const b = full.indexOf(end, a + start.length);
        if (b < 0) { stat.unclosed++; break; }
        stat.matches++;
        const from = rule.includeBounds ? a : a + start.length;
        const to = rule.includeBounds ? b + end.length : b;
        if (to > from) intervals.push({ from, to, rules: [index] });
        cursor = b + end.length;
      }
    });
    let messageStart=0;
    messages.forEach((m,i)=>{for(const span of [...(m.aiExcluded||[]),...(m.dedupExcluded||[]),...(m.manualExcluded||[])]){if(Number.isInteger(span.from)&&Number.isInteger(span.to)&&span.from>=0&&span.to<=texts[i].length&&span.to>span.from)intervals.push({from:messageStart+span.from,to:messageStart+span.to,rules:[]});}messageStart+=texts[i].length+1;});
    intervals.sort((a,b) => a.from-b.from || a.to-b.to);
    let merged=[];
    for (const interval of intervals) {
      const last=merged.at(-1);
      if (last && interval.from < last.to) { last.to=Math.max(last.to,interval.to);last.rules=[...new Set([...last.rules,...interval.rules])]; }
      else merged.push({...interval});
    }
    let origin=0;const restored=[];messages.forEach((m,i)=>{for(const r of m.restoredRanges||[])if(Number.isInteger(r.from)&&Number.isInteger(r.to)&&r.from>=0&&r.to<=texts[i].length&&r.to>r.from)restored.push({from:origin+r.from,to:origin+r.to});origin+=texts[i].length+1;});
    for(const r of restored)merged=merged.flatMap(s=>r.to<=s.from||r.from>=s.to?[s]:[...(r.from>s.from?[{...s,to:r.from}]:[]),...(r.to<s.to?[{...s,from:r.to}]:[])]);
    let offset=0, hiddenChars=0;
    const results=texts.map(text => {
      let cursor=0; const segments=[];
      for(const interval of merged) {
        const from=Math.max(0,interval.from-offset),to=Math.min(text.length,interval.to-offset);
        if(to<=from)continue;
        if(from>cursor)segments.push({text:text.slice(cursor,from),hidden:false});
        segments.push({text:text.slice(from,to),hidden:true,rules:interval.rules});hiddenChars+=to-from;cursor=to;
      }
      if(cursor<text.length)segments.push({text:text.slice(cursor),hidden:false});
      offset+=text.length+1;
      return {segments,text:segments.filter(s=>!s.hidden).map(s=>s.text).join('')};
    });
    return {messages:results,stats,hiddenChars,matches:stats.reduce((n,s)=>n+s.matches,0)};
  }
  function findMatches(text, query) {
    if(!query)return [];
    const found=[];let cursor=0;
    while(cursor<=text.length-query.length){const i=text.indexOf(query,cursor);if(i<0)break;found.push({start:i,end:i+query.length});cursor=i+query.length;}
    return found;
  }
  const appearanceDefaults={size:16,color:'#584550',background:'#fffdfb',font:'serif',lineHeight:2.1,pageWidth:null};
  function normalizeAppearance(value={}) {
    if(!value||typeof value!=='object')value={};
    const number=(n,min,max,fallback)=>Number.isFinite(Number(n))&&n!==null?Math.min(max,Math.max(min,Number(n))):fallback;
    const color=(v,fallback)=>/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
    return {size:number(value.size,12,36,16),color:color(value.color,appearanceDefaults.color),background:color(value.background,appearanceDefaults.background),font:['serif','sans','kai'].includes(value.font)?value.font:'serif',lineHeight:number(value.lineHeight,1.4,2.6,2.1),pageWidth:value.pageWidth!=null&&Number.isFinite(Number(value.pageWidth))&&Number(value.pageWidth)>0?Math.round(number(value.pageWidth,240,4000,820)):null};
  }
  function searchFromAnchor(hits,anchor,direction=1) {
    if(!hits.length)return {index:-1,wrapped:false};
    const compare=(a,b)=>a.messageIndex-b.messageIndex||a.segmentIndex-b.segmentIndex;
    if(direction>0){const index=hits.findIndex(h=>compare(h,anchor)>0||(compare(h,anchor)===0&&h.end>anchor.offset));return {index:index<0?0:index,wrapped:index<0};}
    for(let i=hits.length-1;i>=0;i--){const h=hits[i];if(compare(h,anchor)<0||(compare(h,anchor)===0&&h.start<=anchor.offset))return {index:i,wrapped:false};}
    return {index:hits.length-1,wrapped:true};
  }
  return {analyzeMessages,findMatches,normalize,appearanceDefaults,normalizeAppearance,searchFromAnchor};
});
