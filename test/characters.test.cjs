const test=require('node:test'),assert=require('node:assert/strict'),characters=require('../desktop/characters.cjs'),nai=require('../desktop/novelai.cjs');
const profile=characters.profile({name:'小岚',aliases:'林同学',appearance:'黑色短发，琥珀色眼睛',prompt:'black bob cut, amber eyes',negativePrompt:'blue eyes',referenceImageId:'ref'});
const story={characters:[profile]},png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
test('角色固定设定与场景分离，模型角色 ID 严格校验',()=>{
 const cast=characters.compose(story,[],{model:nai.defaults.model,characterIds:[profile.id]});
 const payload=nai.payload({...nai.defaults,...cast,prompt:'walking along a river'});
 assert.equal(payload.parameters.v4_prompt.caption.char_captions[0].char_caption,profile.prompt);
 assert.equal(payload.input,'walking along a river');
 assert.deepEqual(payload.parameters.v4_prompt.caption.char_captions[0].centers,[{x:.5,y:.5}]);
 assert.equal(payload.parameters.v4_negative_prompt.caption.char_captions[0].char_caption,'blue eyes');
 assert.deepEqual(characters.sceneIds(story,{characterIds:[profile.id]}),[profile.id]);
 assert.throws(()=>characters.sceneIds(story,{}),/未返回/);
 assert.throws(()=>characters.sceneIds(story,{characterIds:['invented']}),/不存在|删除/);
 assert.throws(()=>characters.compose({characters:[{...profile,enabled:false}]},[],{characterIds:[profile.id]}),/停用/);
 assert.equal(characters.compose(story,[],{model:nai.defaults.model}).characterPrompts.length,0);
});
test('定稿图只允许支持的模型与一个主要角色，参考收费不会误报免费',()=>{
 const args={...nai.defaults,model:'nai-diffusion-4-5-full',characterIds:[profile.id],referenceCharacterId:profile.id},gallery=[{id:'ref',dataUrl:png}];
 const cast=characters.compose(story,gallery,args),quote=nai.estimate({...args,...cast},{tier:3});
 assert.equal(quote.free,false);assert.equal(quote.referenceCost,5);assert.equal(quote.paid,nai.estimate(args).paid+5);
 assert.throws(()=>characters.compose(story,gallery,{...args,model:nai.defaults.model}),/V4.5/);
 assert.throws(()=>characters.compose(story,[{...gallery[0],deletedAt:1}],args),/回收站/);
 assert.throws(()=>characters.compose(story,gallery,{...args,characterIds:[]}),/出场角色/);
});
test('参考图通过 multipart 二进制上传，JSON 仅携带命名 part 引用',()=>{
 const payload=nai.payload({...nai.defaults,model:'nai-diffusion-4-5-full',prompt:'portrait',preciseReferences:[{dataUrl:png,strength:.8,fidelity:.9}]});
 const encoded=nai.httpBody(payload),body=encoded.body.toString('latin1');
 assert.match(encoded.contentType,/multipart\/form-data/);
 assert.match(body,/name="request"/);assert.match(body,/name="director_ref_0"/);assert.match(body,/director_reference_images_cached/);
 assert.ok(encoded.body.includes(Buffer.from(png.split(',')[1],'base64')));
 assert.ok(!body.includes('data:image'));assert.ok(!body.includes('"director_reference_images":'));
 assert.equal(payload.parameters.director_reference_secondary_strength_values[0],.1);
 assert.match(nai.httpBody(nai.payload({...nai.defaults,prompt:'tree'})).contentType,/application\/json/);
});
