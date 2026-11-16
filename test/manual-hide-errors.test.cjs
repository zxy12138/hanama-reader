const {test}=require('node:test'),assert=require('node:assert/strict'),hide=require('../desktop/manual-hide.cjs'),core=require('../desktop/core.cjs'),errors=require('../desktop/service-errors.cjs'),{readResponse}=require('../desktop/model-stream.cjs'),jobs=require('../desktop/book-jobs.cjs');
test('划词按坐标跨消息屏蔽，不影响重复文本、原文和图片；撤销保留独立屏蔽',()=>{
 const s={id:'book',title:'书',messages:[{id:'a',name:'角色',text:'保留相同文字\r\n要隐藏'},{id:'b',name:'角色',text:'也隐藏。相同文字'}],images:[{afterId:'b',offset:4}]},before=JSON.stringify(s.messages),job=jobs.create(s,[],'draw');
 hide.hide(s,{start:{messageId:'a',offset:7},end:{messageId:'b',offset:4}});const cleaned=core.analyzeMessages(s.messages,[]);assert.equal(cleaned.messages[0].text,'保留相同文字\n');assert.equal(cleaned.messages[1].text,'相同文字');assert.equal(s.images[0].offset,4);assert.notEqual(job.fingerprint,jobs.fingerprint(s,[],'draw'));assert.ok(!core.exportHtml(s,[]).includes('要隐藏'));
 s.messages[0].aiExcluded=[{from:0,to:2}];hide.hide(s,{start:{messageId:'b',offset:4},end:{messageId:'b',offset:6}});hide.undo(s);assert.equal(core.analyzeMessages(s.messages,[]).messages[1].text,'相同文字');hide.undo(s);assert.equal(s.messages[0].aiExcluded.length,1);assert.equal(JSON.stringify(s.messages.map(({manualExcluded,aiExcluded,...m})=>m)),before);assert.throws(()=>hide.undo(s),/没有可以撤销/);
});
test('无效选区不写入，保存序列化后仍可撤销',()=>{
 const s={messages:[{id:'a',text:'测试正文'}]};assert.throws(()=>hide.hide(s,{start:{messageId:'a',offset:3},end:{messageId:'a',offset:1}}),/有效/);assert.equal(s.manualHideHistory,undefined);hide.hide(s,{start:{messageId:'a',offset:1},end:{messageId:'a',offset:3}});const copy=JSON.parse(JSON.stringify(s));hide.undo(copy);assert.equal(core.analyzeMessages(copy.messages,[]).messages[0].text,'测试正文');
});
test('失败原因分类保留技术信息，不武断断言连接关闭的具体来源',()=>{
 for(const [raw,term] of [['net::ERR_CONNECTION_CLOSED','仅凭此错误无法确定'],['net::ERR_TIMED_OUT','超时'],['HTTP 401','身份验证'],['HTTP 403','拒绝访问'],['HTTP 429','配额'],['HTTP 500','服务端错误']]){const detail=errors.explain(Error(raw));assert.ok(detail.includes(term));assert.ok(detail.includes(raw));assert.equal(errors.explain(Error(detail)),detail);}
 assert.equal(errors.providerError({error:{}}),'服务未提供具体原因');assert.ok(!errors.explain(Error('HTTP 401 secret-value'),['secret-value']).includes('secret-value'));
});
test('流式及非流式服务错误保留原因和错误码并隐藏密钥',async()=>{
 const e={error:{code:'rate_limit_exceeded',message:'too many requests secret-key'}};for(const response of [new Response('data: '+JSON.stringify(e)+'\n\n',{headers:{'content-type':'text/event-stream'}}),new Response(JSON.stringify(e))])await assert.rejects(readResponse(response,()=>{},['secret-key']),err=>err.message.includes('rate_limit_exceeded')&&err.message.includes('too many requests')&&!err.message.includes('secret-key'));
 const error=await errors.httpError(new Response(JSON.stringify(e),{status:429}),['secret-key']);assert.match(error.message,/HTTP 429/);assert.match(error.message,/rate_limit_exceeded/);assert.ok(!error.message.includes('secret-key'));
});
