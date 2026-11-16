const test=require('node:test'),assert=require('node:assert/strict'),edit=require('../desktop/image-prompt-edit.cjs'),nai=require('../desktop/novelai.cjs');
test('图片提示词编辑校验角色身份和完整字段，不接受模型额外的操作参数',()=>{
 const story={id:'s',images:[]},gallery=[{id:'i',characterSnapshots:[{id:'a',name:'人物',prompt:'black hair',negativePrompt:'',sceneOutfit:'white shirt'}]}];
 const args={imageId:'i',instruction:'换成蓝色外套',prompt:'garden',negativePrompt:'blur',seed:-1,style:{enabled:true,prompt:'anime',negativePrompt:'3d'},characters:[{id:'a',enabled:true,prompt:'black hair',negativePrompt:'',outfit:'white shirt'}]};
 const {body,contract}=edit.prepare(story,gallery,nai.defaults,args);assert.match(body.messages[1].content,/蓝色外套/);
 const data={...args,characters:[{...args.characters[0],outfit:'blue coat'}],replace:true,apiKey:'ignored'};
 const result=contract.validate(data);assert.equal(result.characters[0].outfit,'blue coat');assert.equal(result.replace,undefined);assert.equal(result.apiKey,undefined);
 assert.throws(()=>contract.validate({...data,characters:[{...data.characters[0],id:'invented'}]}),{code:'MODEL_OUTPUT_INVALID'});
 assert.throws(()=>contract.validate({...data,style:null}),{code:'MODEL_OUTPUT_INVALID'});
 assert.throws(()=>edit.prepare(story,gallery,nai.defaults,{...args,instruction:''}));
});
