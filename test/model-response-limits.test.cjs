const {test}=require('node:test'),assert=require('node:assert/strict');
const {readResponse}=require('../desktop/model-stream.cjs'),core=require('../desktop/core.cjs');
const event=data=>'data: '+JSON.stringify(data)+'\n\n';
const stream=events=>new Response(new ReadableStream({start(c){for(const e of events)c.enqueue(Buffer.from(e));c.close();}}),{headers:{'content-type':'text/event-stream'}});
test('协议格式超过旧 4 MB 上限但正文很小时正常接收',async()=>{
 const parts=Array.from({length:800},()=>event({metadata:'x'.repeat(6000),choices:[{delta:{content:'字'}}]}));parts.push(event({choices:[{delta:{},finish_reason:'stop'}]}),'data: [DONE]\n\n');assert.ok(Buffer.byteLength(parts.join(''))>4*1024*1024);
 const r=await readResponse(stream(parts));assert.equal(r.choices[0].message.content,'字'.repeat(800));
});
test('长思考仅截断展示，后续正文、usage、结束原因完整接收',async()=>{
 const parts=Array.from({length:100},()=>event({choices:[{delta:{reasoning_content:'思'.repeat(20000)}}]}));parts.push(event({choices:[{delta:{content:'{"remove":[]}'},finish_reason:'stop'}]}),event({usage:{prompt_tokens:10,completion_tokens:20}}),'data: [DONE]\n\n');
 const r=await readResponse(stream(parts)),m=r.choices[0].message;assert.equal(m.content,'{"remove":[]}');assert.ok(m.reasoning_content.length<81000);assert.match(m.reasoning_content,/仅保留前 80,000/);assert.equal(r.usage.completion_tokens,20);assert.equal(r.choices[0].finish_reason,'stop');
});
test('完整 message 快照不会被当成增量反复拼接',async()=>{
 const r=await readResponse(stream([event({choices:[{message:{content:'第一段',reasoning_content:'思考'}}]}),event({choices:[{message:{content:'第一段第二段',reasoning_content:'思考结束'},finish_reason:'stop'}]}),'data: [DONE]\n\n']));assert.equal(r.choices[0].message.content,'第一段第二段');assert.equal(r.choices[0].message.reasoning_content,'思考结束');
});
test('真实正文过大仍阻止应用，不静默截断；错误会关闭响应流',async()=>{
 let canceled=false;const body=new ReadableStream({start(c){c.enqueue(Buffer.from(event({choices:[{delta:{content:'a'.repeat(4*1024*1024+1)}}]})));},cancel(){canceled=true;}});
 await assert.rejects(readResponse(new Response(body,{headers:{'content-type':'text/event-stream'}})),/实际正文超过 4 MB/);assert.equal(canceled,true);
 await assert.rejects(readResponse(new Response(JSON.stringify({choices:[{message:{content:'a'.repeat(4*1024*1024+1)}}]}))),/实际正文超过 4 MB/);
});
test('异常未结束数据包有单独保护，DONE 后内容不再处理',async()=>{
 await assert.rejects(readResponse(stream([': '+'a'.repeat(8*1024*1024+1)])),/未结束数据包超过 8 MB/);
 const r=await readResponse(stream([event({choices:[{delta:{content:'有效'},finish_reason:'stop'}]})+'data: [DONE]\n\ndata: not json\n\n']));assert.equal(r.choices[0].message.content,'有效');
});
test('非流式长思考也限制展示且保留 JSON 正文',async()=>{
 const r=await readResponse(new Response(JSON.stringify({choices:[{message:{content:'{"remove":[]}',reasoning_content:'a'.repeat(100000)},finish_reason:'stop'}]})));assert.equal(r.choices[0].message.content,'{"remove":[]}');assert.match(r.choices[0].message.reasoning_content,/仅保留前/);
});
test('请求有默认输出上限，并保留调用方明确设定；不重复发请求',async()=>{
 const sent=[];core.setFetch(async(_url,options)=>{sent.push(JSON.parse(options.body));return new Response(JSON.stringify({choices:[{message:{content:'OK'}}]}));});
 const config={baseUrl:'https://test.invalid/v1'};await core.streamChat(config,{});await core.streamChat(config,{max_tokens:4096});await core.streamChat(config,{max_completion_tokens:8192});assert.equal(sent.length,3);assert.equal(sent[0].max_tokens,32768);assert.equal(sent[1].max_tokens,4096);assert.equal(sent[2].max_tokens,undefined);assert.equal(sent[2].max_completion_tokens,8192);
});
