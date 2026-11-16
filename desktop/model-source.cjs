// The model selects source keys; exact text and absolute positions remain software-owned.
function anchors(pieces){const out=[];for(const p of pieces){let start=0;while(start<p.text.length){let end=start;while(end<p.text.length){end++;if(/[。！？.!?\n]/.test(p.text[end-1])||end-start>=180)break;}if(end<p.text.length&&/[\uD800-\uDBFF]/.test(p.text[end-1]))end--;const raw=p.text.slice(start,end),text=raw.trim();if(text)out.push({key:'a'+(out.length+1),afterId:p.afterId,text,offset:(p.start||0)+start+raw.indexOf(text)+text.length});const hard=end<p.text.length&&end-start>=179&&!/[。！？.!?\n]/.test(p.text[end-1]);start=hard?end-24:end;}}return out;}
function input(pieces){return anchors(pieces).map(({key,afterId,text})=>({key,afterId,text}));}
module.exports={anchors,input};
