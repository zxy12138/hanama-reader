const {test}=require('node:test'),assert=require('node:assert/strict');
const {restore}=require('../desktop/settings-loader.cjs'),nai=require('../desktop/novelai.cjs'),core=require('../desktop/core.cjs');
const defaults={baseUrl:'',model:'',globalPrompt:'default',apiKey:''};
test('单套密钥解密失败不丢失地址、模型、全局提示词和另一套凭据',()=>{
 const saved={baseUrl:'https://ollama.com/v1',model:'deepseek-v4.1-flash:1017',globalPrompt:'saved',encryptedKey:Buffer.from('bad').toString('base64'),root:'project',drawing:{...nai.defaults,encryptedKey:Buffer.from('good').toString('base64')}};
 const s=restore(saved,defaults,nai.defaults,b=>{if(b.toString()==='bad')throw Error('decrypt failed');return 'image-key';},nai.parameters);
 assert.equal(s.config.baseUrl,saved.baseUrl);assert.equal(s.config.model,saved.model);assert.equal(s.config.globalPrompt,'saved');assert.equal(s.config.apiKey,'');assert.equal(s.drawing.apiKey,'image-key');assert.equal(s.root,'project');assert.equal(s.unreadable.language,true);assert.equal(s.unreadable.drawing,false);assert.match(s.issues[0],/解密/);assert.ok(saved.encryptedKey);
});
test('损坏的绘图参数不阻止恢复大模型连接',()=>{
 const s=restore({baseUrl:'https://ollama.com/v1',model:'model',encryptedKey:'YQ==',drawing:{width:1,encryptedKey:'Yg=='}},defaults,nai.defaults,b=>b.toString(),nai.parameters);
 assert.equal(s.config.apiKey,'a');assert.equal(s.drawing.width,nai.defaults.width);assert.equal(s.drawing.apiKey,'b');assert.match(s.issues[0],/参数/);
});
test('空地址和畸形地址给出可操作提示，禁止未配置请求进入网络',async()=>{
 let calls=0;core.setFetch(async()=>{calls++;throw Error('should not fetch');});
 await assert.rejects(()=>core.streamChat({},{}),/地址未加载/);await assert.rejects(()=>core.streamChat({baseUrl:'ollama.com/v1'},{}),/格式无效/);assert.equal(calls,0);assert.equal(core.endpoint(' https://ollama.com/v1 ','chat/completions'),'https://ollama.com/v1/chat/completions');
});
