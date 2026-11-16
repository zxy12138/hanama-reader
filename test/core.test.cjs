const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { exclude, parseStory, endpoint, withinRoot, exportHtml } = require('../desktop/core.cjs');
const rule = {start:'<think>',end:'</think>',enabled:true,includeBounds:true};
test('兼容接口发送模型请求，禁止重定向携带密钥',async()=>{
  const oldFetch=global.fetch;let captured;
  global.fetch=async(url,options)=>{captured={url,options};return {ok:true,json:async()=>({data:[{id:'test-model'}]})}};
  try{const {request}=require('../desktop/core.cjs');const result=await request({baseUrl:'https://example.test/v1',apiKey:'test-only'},'models');assert.equal(result.data[0].id,'test-model');assert.equal(captured.url,'https://example.test/v1/models');assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers.Authorization,'Bearer test-only');await request({baseUrl:'https://example.test/v1'},'chat/completions',{model:'test-model',messages:[]});assert.equal(captured.options.method,'POST');assert.equal(JSON.parse(captured.options.body).model,'test-model');global.fetch=async()=>({ok:false,status:401});await assert.rejects(request({baseUrl:'https://example.test'},'models'),/HTTP 401/)}finally{global.fetch=oldFetch}
});
test('跨行重复排除且保留未闭合片段',()=>{assert.equal(exclude('a<think>\nb\n</think>c<think>d</think>e<think>f',[rule]),'ace<think>f');assert.equal(exclude('a<think>b</think>c',[{...rule,includeBounds:false}]),'a<think></think>c')});
test('读取酒馆 JSONL 并跳过元数据',()=>{const s=parseStory('{"user_name":"me"}\n{"name":"凛","mes":"你好"}\n{"is_user":true,"mes":"hi"}','story.jsonl');assert.equal(s.messages.length,2);assert.equal(s.messages[1].isUser,true);assert.equal(s.title,'story');assert.throws(()=>parseStory('{oops}','story.jsonl'),/第 1 行/)});
test('API 地址保留用户版本路径且拒绝明文远程服务',()=>{assert.equal(endpoint('https://example.test/v1/','models'),'https://example.test/v1/models');assert.equal(endpoint('http://localhost:1234/v1','models'),'http://localhost:1234/v1/models');assert.throws(()=>endpoint('http://example.test','models'));assert.throws(()=>endpoint('https://user:secret@example.test','models'))});
test('拒绝授权目录外的路径',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'hanama-test-'));try{await fs.writeFile(path.join(root,'ok.txt'),'hi');assert.equal(await withinRoot(root,'ok.txt'),await fs.realpath(path.join(root,'ok.txt')));await assert.rejects(withinRoot(root,'..'),/超出/);await assert.rejects(withinRoot('',root),/授权/)}finally{await fs.rm(root,{recursive:true,force:true})}});
test('导出转义文字和图片说明并嵌入图片',()=>{const html=exportHtml({title:'<script>x</script>',messages:[{id:'0',name:'凛',text:'你好<think>secret</think><img src=x onerror=alert(1)>'}],images:[{afterId:'0',dataUrl:'data:image/png;base64,AAAA',caption:'<bad>'}]},[rule]);assert.ok(!html.includes('secret'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('data:image/png;base64,AAAA'));assert.ok(html.includes('&lt;bad&gt;'))});
