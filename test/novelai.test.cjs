const {test}=require('node:test');
const assert=require('node:assert/strict');
const {deflateRawSync}=require('node:zlib');
const nai=require('../desktop/novelai.cjs'),core=require('../desktop/core.cjs');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
function zip(bytes){
  const data=deflateRawSync(bytes),name=Buffer.from('image_0.png'),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(data.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+data.length,16);
  return Buffer.concat([local,name,data,central,name,end]);
}
test('NovelAI 分辨率、步数、种子限制和 V5/V4 提示词协议',()=>{
  assert.throws(()=>nai.parameters({width:1000}),/64/);assert.throws(()=>nai.parameters({width:2048,height:2048}),/总像素/);assert.throws(()=>nai.parameters({steps:0}),/步数/);assert.throws(()=>nai.parameters({seed:4294967296}),/种子/);
  const p=nai.payload({prompt:'girl in cherry garden',negativePrompt:'blurry',seed:42});
  assert.equal(p.parameters.seed,42);assert.equal(p.parameters.n_samples,1);assert.equal(p.parameters.v4_prompt.caption.base_caption,p.input);assert.equal(p.parameters.v4_negative_prompt.caption.base_caption,'blurry');assert.equal(p.parameters.noise_schedule,'karras');
  assert.equal(nai.payload({model:'nai-diffusion-3',prompt:'garden'}).parameters.v4_prompt,undefined);
});
test('费用区分付费、Opus 免费及未知 V5 剩余额度',()=>{
  assert.equal(nai.estimate({width:1024,height:1024,steps:28}).paid,30);
  assert.equal(nai.estimate({width:1024,height:1024,steps:28},{tier:3,usage:{percent:97,isNegative:false}}).estimated,0);
  assert.equal(nai.estimate({}, {tier:3}).conditionalFree,true);
  assert.equal(nai.estimate({}, {tier:3,usage:{percent:0,isNegative:false}}).free,false);
  assert.equal(nai.estimate({model:'nai-diffusion-4-5-full'}, {tier:3}).free,true);
  assert.equal(nai.estimate({steps:29},{tier:3}).free,false);
  assert.equal(nai.estimate({width:1536,height:1024},{tier:3}).free,false);
});
test('账户包装结构和未知余额不被误报为零',()=>{
  const a=nai.parseAccount({data:{subscription:{tier:3,trainingStepsLeft:{fixedTrainingStepsLeft:1000,purchasedTrainingSteps:7478},usage:{percent:97,isNegative:false}}}});
  assert.equal(a.balance,8478);assert.equal(a.tier,3);assert.equal(a.usage.percent,97);assert.equal(nai.parseAccount({}).balance,null);
  assert.equal(nai.parseAccount({subscription:{trainingStepsLeft:123}}).balance,123);
  assert.equal(nai.parseAccount({anlas:false}).balance,null);
  assert.equal(nai.parseAccount({anlas:' '}).balance,null);
  assert.equal(nai.parseAccount({anlas:0}).balance,0);
});
test('处理真实 PNG / deflate ZIP 并阻止超大和破损图片包',()=>{
  assert.deepEqual(nai.extractImage(image),image);assert.deepEqual(nai.extractImage(zip(image)),image);
  const broken=zip(image);broken.writeUInt32LE(40*1024*1024,broken.indexOf(Buffer.from([80,75,1,2]))+24);
  assert.throws(()=>nai.extractImage(broken),/大小/);assert.throws(()=>nai.extractImage(Buffer.from('not a zip')),/有效/);
});
test('生成发送一次请求、禁重定向，结果可插图导出，错误不泄露凭据',async()=>{
  let count=0;
  const r=await nai.generate({...nai.defaults,apiKey:'private-test-token'},{prompt:'garden',seed:123},async(url,options)=>{
    count++;assert.equal(url,'https://image.novelai.net/ai/generate-image');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer private-test-token');return new Response(zip(image));
  });
  assert.equal(count,1);assert.equal(r.seed,123);assert.match(r.dataUrl,/^data:image\/png;base64,/);
  const html=core.exportHtml({title:'test',messages:[{id:'a',name:'角色',text:'正文'}],images:[{afterId:'a',...r}]},[]);assert.ok(html.includes(r.dataUrl));
  count=0;await assert.rejects(()=>nai.generate({...nai.defaults,apiKey:'secret'},{prompt:'garden'},async()=>{count++;return new Response('secret',{status:500});}),e=>/500/.test(e.message)&&!/secret/.test(e.message));assert.equal(count,1);
});
test('Ollama 云使用 tags 模型列表且保持固定版本标识',async()=>{
  core.setFetch(async url=>{assert.equal(url,'https://ollama.com/api/tags');return new Response(JSON.stringify({models:[{name:'deepseek-v4.1-flash:1017'}]}));});
  assert.deepEqual(await core.listModels({baseUrl:'https://ollama.com/v1'}),['deepseek-v4.1-flash:1017']);core.setFetch((...args)=>fetch(...args));
});
