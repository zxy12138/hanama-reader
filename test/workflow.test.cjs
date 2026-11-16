const {test}=require('node:test'),assert=require('node:assert/strict');
const layout=require('../story-layout.js'),model=require('../reader-model.js'),core=require('../desktop/core.cjs');
const {readResponse}=require('../desktop/model-stream.cjs'),{createActivity}=require('../desktop/activity.cjs');
const story=text=>({id:'test',title:'测试',messages:[{id:'0',name:'正文',text}],images:[]});
test('单消息中的章节、跨消息章节和选择范围精确提取，不发送排除内容',()=>{
 const s=story('序\r\n第一章 初见\r\n春日<hide>秘密\n第二章 假标题</hide>相遇\n第二章 归途\n回家');
 const rules=[{start:'<hide>',end:'</hide>',enabled:true,includeBounds:true}];
 assert.deepEqual(layout.chapters(s,rules).map(c=>c.title),['序言 / 章节前内容','第一章 初见','第二章 归途']);
 const source=layout.source(s,rules,{mode:'chapters',from:1,to:1});assert.equal(source.pieces.map(p=>p.text).join(''),'第一章 初见\n春日相遇\n');assert.ok(!source.text.includes('秘密'));
 s.messages.push({id:'1',name:'正文',text:'尾声'});assert.ok(layout.source(s,rules,{mode:'chapters',from:2,to:2}).text.endsWith('尾声'));
 const select=layout.source(s,rules,{mode:'selection',start:{messageId:'0',offset:2},end:{messageId:'0',offset:5}});assert.equal(select.text,'第一章');
 assert.throws(()=>layout.source(s,rules,{mode:'messages',from:1,to:0}),/有效/);
});
test('长篇按批无损拆分，保留原始字符落点，拒绝超上限而不截断',()=>{
 const text='甲'.repeat(2999)+'🌸'+'乙'.repeat(6000),pieces=[{afterId:'0',start:10,end:10+text.length,text}];
 const batches=layout.batches(pieces,3000);assert.equal(batches.flat().map(p=>p.text).join(''),text);
 for(const b of batches){assert.ok(b.reduce((n,p)=>n+p.text.length,0)<=3000);for(const p of b){assert.equal(p.text,text.slice(p.start-10,p.end-10));assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(p.text));}}
 assert.throws(()=>layout.batches([{...pieces[0],text:'甲'.repeat(30001)}],3000),/10 批/);
});
test('图片精确位置、旧图尾部兼容、隐藏区投影和待插入图的导出',()=>{
 const s=story('甲[秘密]乙🌸尾'),rules=[{start:'[',end:']',enabled:true,includeBounds:true}],dataUrl='data:image/png;base64,AAAA';
 s.images=[{id:'a',afterId:'0',offset:1,dataUrl},{id:'b',afterId:'0',offset:3,dataUrl},{id:'c',afterId:'0',dataUrl},{id:'d',afterId:'0',offset:0,pending:true,dataUrl}];
 const a=model.analyzeMessages(s.messages,rules).messages[0],flow=layout.flow(s.messages[0],a,s.images);
 assert.deepEqual(flow.filter(s=>s.type==='image').map(s=>s.offset),[1,5,9]);assert.equal(flow.filter(s=>s.type==='text').map(s=>s.text).join(''),s.messages[0].text);
 assert.equal(layout.anchor(s,{messageId:'0',offset:7}).offset,6);assert.throws(()=>layout.anchor(s,{messageId:'0',offset:100}),/失效/);
 const html=core.exportHtml(s,rules);assert.equal((html.match(/<img /g)||[]).length,3);assert.ok(!html.includes('秘密'));assert.match(html,/<div class="prose">甲<img/);assert.match(html,/乙🌸尾<img/);
});
test('SSE 任意字节分片恢复中文思考、内容及并行工具调用',async()=>{
 const events=[{choices:[{delta:{reasoning_content:'观察樱花🌸'}}]},{choices:[{delta:{content:'完成',tool_calls:[{index:0,id:'a',function:{name:'get_story',arguments:'{'}}]}}]},{choices:[{delta:{tool_calls:[{index:1,id:'b',function:{name:'drawing_account',arguments:'{}'}},{index:0,function:{arguments:'}'}}]},finish_reason:'tool_calls'}]},{usage:{total_tokens:40}}];
 const bytes=Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n');
 const body=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.subarray(i,i+3));c.close();}}),updates=[];
 const response=await readResponse(new Response(body,{headers:{'content-type':'text/event-stream'}}),m=>updates.push(m));
 const m=response.choices[0].message;assert.equal(m.reasoning_content,'观察樱花🌸');assert.equal(m.content,'完成');assert.deepEqual(m.tool_calls.map(c=>c.function.arguments),['{}','{}']);assert.equal(response.usage.total_tokens,40);assert.ok(updates.length>1);
});
test('JSON 回退、think 标签、流提前中断、HTTP 与用户取消均不自动重试',async()=>{
 let r=await readResponse(new Response(JSON.stringify({choices:[{message:{content:'<think>服务返回的解释</think>答案'}}]})));assert.equal(r.choices[0].message.content,'答案');assert.equal(r.choices[0].message.reasoning_content,'服务返回的解释');
 await assert.rejects(()=>readResponse(new Response('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n',{headers:{'content-type':'text/event-stream'}})),/提前结束/);
 let calls=0;core.setFetch(async(_url,options)=>{calls++;options.signal.throwIfAborted();return new Response('',{status:500});});
 await assert.rejects(()=>core.streamChat({baseUrl:'https://test.invalid/v1'},{},()=>{}),/HTTP 500/);assert.equal(calls,1);
 const c=new AbortController();c.abort();await assert.rejects(()=>core.streamChat({baseUrl:'https://test.invalid/v1'},{},()=>{},c.signal),{name:'AbortError'});assert.equal(calls,2);
});
test('控制台密钥脱敏、内存条数限制和清空事件',()=>{
 const events=[],activity=createActivity(e=>events.push(e),()=>['private-key']);const id=activity.start('任务');activity.update(id,{reasoning:'private-key 返回',answer:'答案'});assert.ok(!JSON.stringify(activity.list()).includes('private-key'));assert.match(activity.list()[0].reasoning,/隐藏/);
 for(let i=0;i<61;i++)activity.start(String(i));assert.equal(activity.list().length,60);activity.clear();assert.equal(activity.list().length,0);assert.deepEqual(events.at(-1),{clear:true});
});
