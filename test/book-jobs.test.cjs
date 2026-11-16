const {test}=require('node:test'),assert=require('node:assert/strict');
const jobs=require('../desktop/book-jobs.cjs'),model=require('../reader-model.js'),core=require('../desktop/core.cjs');
const story=text=>({id:'test',messages:[{id:'m',name:'测试',text}],images:[]});
const response=data=>({choices:[{message:{content:JSON.stringify(data)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20}});
test('JSON 中引用的 think 原文不会被当成模型推理剥离',()=>{const {cleanMessage}=require('../desktop/model-stream.cjs');const content=JSON.stringify({remove:[{piece:0,text:'<think>分析</think>',reason:'reasoning'}]});assert.equal(cleanMessage({content}).content,content);assert.equal(cleanMessage({content:'<think>模型自身推理</think>'+content}).content,content);});
test('百万字全文分批无十批限制，合并短段落及 Unicode 边界',()=>{
 const s=story('故事文字。\n'.repeat(170000)),clean=jobs.create(s,[],'clean');assert.ok(clean.units.length>100);assert.ok(clean.units.every(u=>u.pieces.reduce((n,p)=>n+p.end-p.start,0)<=6000));
 const small=story('第一段。\n第二段。\n');assert.equal(jobs.create(small,[],'draw').units.length,2);assert.equal(jobs.create(small,[],'draw',{group:'passage'}).units.length,1);
 const emoji=story('字'.repeat(5999)+'😀结尾');const j=jobs.create(emoji,[],'clean');assert.equal(j.units.map(u=>u.pieces.map(p=>emoji.messages[0].text.slice(p.start,p.end)).join('')).join(''),emoji.messages[0].text);
});
test('优化只添加精确屏蔽，阅读/素材/导出一致，原文和图片位置保留',async()=>{
 const s=story('开场。<think>规划下一句</think>故事继续。');s.images=[{id:'image',afterId:'m',offset:s.messages[0].text.length}];const original=s.messages[0].text,j=jobs.create(s,[],'clean');
 await jobs.run(j,{story:s,rules:[],save:async()=>{},call:async()=>response({remove:[{piece:0,text:'<think>规划下一句</think>',reason:'reasoning'}]})});
 assert.equal(s.messages[0].text,original);assert.equal(s.images[0].offset,original.length);assert.equal(model.analyzeMessages(s.messages,[]).messages[0].text,'开场。故事继续。');assert.ok(!core.exportHtml(s,[]).includes('规划下一句'));assert.equal(j.cursor,1);assert.equal(j.usage.output,20);
 const d=jobs.create(s,[],'draw');assert.equal(d.units.length,1);assert.ok(!d.units[0].pieces.map(p=>original.slice(p.start,p.end)).join('').includes('think'));
});
test('歧义摘录和截断响应保留原文并进入待检查，不阻断整书',async()=>{
 const s=story('正文。正文。');const j=jobs.create(s,[],'clean');await jobs.run(j,{story:s,rules:[],save:async()=>{},call:async()=>response({remove:[{piece:0,text:'正文',reason:'artifact'}]})});assert.equal(s.messages[0].aiExcluded,undefined);assert.equal(j.cursor,1);assert.equal(j.status,'completed');assert.equal(jobs.summary(j).reviewItems,1);
 const j2=jobs.create(s,[],'clean');await jobs.run(j2,{story:s,rules:[],save:async()=>{},call:async()=>({...response({remove:[]}),choices:[{message:{content:'{"remove":[]}'},finish_reason:'length'}]})});assert.equal(jobs.summary(j2).reviewItems,1);assert.equal(s.messages[0].aiExcluded,undefined);
});
test('行号和相邻原文定位重复字符，拒绝错误行号及近似改写，统一换行',()=>{
 const s=story('符号***正文\n标记***结尾\n<think>\n思考\n</think>\n'),u=jobs.create(s,[],'clean').units[0];
 const result=jobs.removals(s,u,{remove:[{piece:0,fromLine:2,toLine:2,text:'***',reason:'artifact'},{piece:0,text:'***',before:'符号',after:'正文',reason:'artifact'},{piece:0,fromLine:3,toLine:5,text:'<think>\r\n思考\r\n</think>\r\n',reason:'reasoning'},{piece:0,fromLine:100,toLine:100,text:'***',reason:'artifact'},{piece:0,text:'符号**正文',reason:'artifact'}]});
 assert.equal(result.spans.length,3);assert.equal(result.issues.length,2);assert.equal(result.spans[0].from,s.messages[0].text.lastIndexOf('***'));assert.equal(result.spans[1].from,s.messages[0].text.indexOf('***'));assert.ok(result.spans.every(p=>p.to<=s.messages[0].text.length));
});
test('混合返回只屏蔽可靠摘录并继续，旧失败任务不重跑前两批，待检查可单独重试',async()=>{
 const s=story('甲。甲。元分析'),j=jobs.create(s,[],'clean');j.units=[...j.units,...structuredClone(j.units),...structuredClone(j.units),...structuredClone(j.units)];j.cursor=2;j.status='failed';let calls=0;
 await jobs.run(j,{story:s,rules:[],save:async()=>{},call:async()=>{calls++;return response({remove:calls===1?[{piece:0,text:'甲',reason:'artifact'},{piece:0,text:'元分析',reason:'reasoning'}]:[]});}});
 assert.equal(calls,2);assert.equal(j.cursor,4);assert.equal(j.status,'completed');assert.equal(jobs.summary(j).reviewBatches,1);assert.equal(s.messages[0].aiExcluded.length,1);assert.equal(jobs.reviewDetails(j,s).items[0].batch,3);
 const resumed=JSON.parse(JSON.stringify(j));jobs.retryReview(resumed);await jobs.run(resumed,{story:s,rules:[],save:async()=>{},call:async()=>{calls++;return response({remove:[{piece:0,text:'甲',before:'甲。',reason:'artifact'},{piece:0,text:'元分析',reason:'reasoning'}]});}});
 assert.equal(calls,3);assert.equal(resumed.cursor,4);assert.equal(jobs.summary(resumed).reviewItems,0);assert.equal(s.messages[0].aiExcluded.length,2);assert.equal(resumed.hiddenChars,4);
});
test('已保存的优化回复可直接校验，不重复请求；网络错误仍暂停',async()=>{
 const s=story('正文。'),j=jobs.create(s,[],'clean');j.units[0].cleanResult=response({remove:[]});await jobs.run(j,{story:s,rules:[],save:async()=>{},call:async()=>{throw Error('不应再请求')}});assert.equal(j.status,'completed');
 const failed=jobs.create(s,[],'clean');await assert.rejects(jobs.run(failed,{story:s,rules:[],save:async()=>{},call:async()=>{throw Error('HTTP 401')}}),/HTTP 401/);assert.equal(failed.cursor,0);assert.equal(failed.status,'failed');
});
test('提示词保存后暂停，序列化重启继续不重复请求提示词',async()=>{
 const s=story('春日。\n秋日。');let j=jobs.create(s,[],'draw'),paused=false,calls=0,images=0;
 const ctx={story:s,rules:[],save:async()=>{},call:async()=>{calls++;return response({prompt:'garden',negativePrompt:'blurry',characterIds:[]})},generate:async args=>{images++;s.images.push({id:String(images),bookJobKey:args.bookJobKey});return {imageId:String(images)}},paused:()=>paused,notify:()=>{if(j.units[j.cursor]?.phase==='prompt')paused=true;}};
 await jobs.run(j,ctx);assert.equal(calls,1);assert.equal(images,0);assert.equal(j.cursor,0);
 j=JSON.parse(JSON.stringify(j));paused=false;ctx.notify=()=>{};await jobs.run(j,ctx);assert.equal(calls,2);assert.equal(images,2);assert.equal(j.status,'completed');
 await jobs.run(j,ctx);assert.equal(images,2);
});
test('图片接收后、游标保存前崩溃可去重；未收到图片不自动重试',async()=>{
 const s=story('花园。'),j=jobs.create(s,[],'draw');let generated=0;const ctx={story:s,rules:[],save:async()=>{},call:async()=>response({prompt:'garden',negativePrompt:'',characterIds:[]}),generate:async()=>{generated++;throw Error('连接中断')}};
 await assert.rejects(jobs.run(j,ctx),/连接中断/);await assert.rejects(jobs.run(j,ctx),/可能已扣费/);assert.equal(generated,1);
 s.images.push({id:'received',bookJobKey:j.id+':0'});await jobs.run(j,ctx);assert.equal(j.status,'completed');assert.equal(generated,1);
 const j2=jobs.create(s,[],'draw');j2.units[0].phase='uncertain';jobs.resolve(j2,'skip');await jobs.run(j2,ctx);assert.equal(j2.status,'completed');
});
test('正文或规则变化拒绝用旧位置继续；任务不保存密钥',async()=>{
 const s=story('故事。'),j=jobs.create(s,[],'draw');s.messages[0].text+='新段落';await assert.rejects(jobs.run(j,{story:s,rules:[],save:async()=>{}}),/已变化/);
 const clean=jobs.create(s,[],'clean');s.messages[0].aiExcluded=[{from:0,to:1}];assert.equal(clean.fingerprint,jobs.fingerprint(s,[],'clean'));
});

function outputLimit(){
 const {assertAnswer}=require('../desktop/model-stream.cjs');
 return assertAnswer({choices:[{finish_reason:'length',message:{reasoning_content:'只返回思考'}}],usage:{completion_tokens:128}});
}

test('优化触顶后缩小当前批次，暂停续跑保留已检查的小批与原始坐标',async()=>{
 const hidden='<think>写作规划</think>';
 const first='甲'.repeat(800)+hidden+'\n',second='乙'.repeat(first.length);
 const s=story(first+second);let job=jobs.create(s,[],'clean'),pause=false,calls=0;
 const ctx={story:s,rules:[],save:async()=>{},paused:()=>pause,call:async(body)=>{
  calls++;
  const pieces=JSON.parse(body.messages.at(-1).content);
  if(calls===1)return outputLimit();
  if(calls===2){assert.equal(pieces[0].lines.map(l=>l.text).join('\n'),first);pause=true;return response({remove:[{piece:0,text:hidden,reason:'reasoning'}]});}
  assert.equal(pieces[0].lines[0].text,second);
  return outputLimit();
 }};
 await jobs.run(job,ctx);
 assert.equal(job.status,'paused');assert.equal(calls,2);assert.equal(s.messages[0].aiExcluded,undefined);
 job=JSON.parse(JSON.stringify(job));pause=false;
 await jobs.run(job,ctx);
 assert.equal(job.status,'completed');assert.equal(calls,3);
 assert.deepEqual(s.messages[0].aiExcluded.map(x=>[x.from,x.to]),[[800,800+hidden.length]]);
 assert.match(jobs.reviewDetails(job,s).items[0].source,/^乙/);
 assert.equal(job.usage.output,276);
});

test('配图提示词触顶仅重试当前文字步骤，结果完整才出图',async()=>{
 const s=story('春日庭院。');let calls=0,images=0;
 const ctx={story:s,rules:[],save:async()=>{},call:async(body,title)=>{
  if(++calls===1)return outputLimit();
  assert.match(title,/精简重试/);assert.equal(body.messages.at(-1).content,'春日庭院。');
  return response({prompt:'garden',negativePrompt:'',characterIds:[]});
 },generate:async()=>{images++;return {imageId:'result'};}};
 await jobs.run(jobs.create(s,[],'draw'),ctx);assert.equal(calls,2);assert.equal(images,1);
 const failed=jobs.create(s,[],'draw');calls=0;ctx.call=async()=>{calls++;return outputLimit();};
 await assert.rejects(jobs.run(failed,ctx),/输出上限/);assert.equal(calls,2);assert.equal(images,1);assert.equal(failed.cursor,0);
});

test('续跑使用最新可见文字，跳过全隐藏段并丢弃过时的提示词',async()=>{
 const s=story('第一段。\n秘密庭院。\n全段隐藏。'),j=jobs.create(s,[],'draw');
 j.cursor=1;j.followReadingEdits=true;
 j.units[1].prompt={prompt:'旧提示词',negativePrompt:'',characterIds:[]};
 s.messages[0].manualExcluded=[{from:5,to:7},{from:11,to:s.messages[0].text.length}];
 j.fingerprint=jobs.fingerprint(s,[],'draw');
 let requests=0,images=0;
 await jobs.run(j,{story:s,rules:[],save:async()=>{},call:async body=>{
  requests++;assert.equal(body.messages.at(-1).content,'庭院。\n');return response({prompt:'garden',negativePrompt:'',characterIds:[]});
 },generate:async args=>{images++;assert.equal(args.offset,11);return {imageId:'new'};}});
 assert.equal(j.status,'completed');assert.equal(requests,1);assert.equal(images,1);assert.equal(j.units[2].phase,'skipped');
});
