const {test}=require('node:test'),assert=require('node:assert/strict');
const characters=require('../desktop/characters.cjs'),contracts=require('../desktop/model-contracts.cjs'),nai=require('../desktop/novelai.cjs'),redraw=require('../desktop/image-redraw.cjs'),jobs=require('../desktop/book-jobs.cjs');
function fixture(){const c=characters.profile({name:'小岚',prompt:'black hair, amber eyes',backPrompt:'black hair, hair ribbon',negativePrompt:'blue eyes',wardrobe:[{id:'school',name:'学院制服',prompt:'white shirt, blue skirt',backPrompt:'white sailor collar, blue skirt',negativePrompt:'red dress'},{id:'travel',name:'旅行装',prompt:'green coat, boots'}],defaultOutfitId:'school'});return {id:'book',characters:[c],images:[],messages:[{id:'m',text:'小岚换上旅行装，背对镜头。'}]};}
test('衣橱默认、明确换装、显式留空互不混淆，固定外貌不变',()=>{
 const story=fixture(),c=story.characters[0],base={model:nai.defaults.model,characterIds:[c.id]};
 const a=characters.compose(story,[],base);assert.equal(a.characterPrompts[0].prompt,'black hair, amber eyes, white shirt, blue skirt');
 const b=characters.compose(story,[],{...base,characterOutfitIds:{[c.id]:'travel'},characterOutfits:{[c.id]:'hallucinated red dress'}});assert.equal(b.characterPrompts[0].prompt,'black hair, amber eyes, green coat, boots');assert.equal(b.characterSnapshots[0].sceneOutfitName,'旅行装');
 const empty=characters.compose(story,[],{...base,characterOutfits:{[c.id]:''}});assert.equal(empty.characterPrompts[0].prompt,c.prompt);
 assert.equal(c.prompt,'black hair, amber eyes');assert.equal(c.defaultOutfitId,'school');
 assert.throws(()=>characters.compose(story,[],{...base,characterOutfitIds:{[c.id]:'other-character-outfit'}}),/不属于/);
});
test('背影替换正面特征，角色服装负面词分通道，无人和远程角色无注入',()=>{
 const story=fixture(),c=story.characters[0],base={model:nai.defaults.model,characterIds:[c.id],characterViews:{[c.id]:'back'}};
 const cast=characters.compose(story,[],base),payload=nai.payload({...nai.defaults,...cast,prompt:'garden'});
 assert.equal(payload.parameters.v4_prompt.caption.char_captions[0].char_caption,'black hair, hair ribbon, white sailor collar, blue skirt, from behind');assert.doesNotMatch(payload.input,/skirt|hair/);
 assert.equal(cast.characterPrompts[0].negativePrompt,'blue eyes, red dress');
 assert.equal(characters.compose(story,[],{...base,characterPresence:{[c.id]:'remote'}}).characterPrompts.length,0);
 assert.equal(characters.compose(story,[],{...base,needsCharacters:false}).characterPrompts.length,0);
});
test('模型服装 ID 校验、别名归一、遥远人物过滤与缺省兼容',()=>{
 const story=fixture(),c=story.characters[0],contract=contracts.scene(characters.catalog(story),true),input={prompt:'walking',negativePrompt:'',needsCharacters:true,characterIds:[c.name],characterPresence:{[c.name]:'physical'},characterOutfitIds:{[c.name]:'travel'},characterViews:{[c.name]:'back'}};
 const p=contract.validate(input);assert.equal(p.characterOutfits[c.id],'green coat, boots');assert.equal(p.characterOutfitIds[c.id],'travel');assert.equal(p.characterViews[c.id],'back');
 assert.throws(()=>contract.validate({...input,characterOutfitIds:{[c.name]:'missing'}}),e=>e.code==='MODEL_OUTPUT_INVALID');
 const remote=contract.validate({...input,characterPresence:{[c.name]:'remote'}});assert.deepEqual(remote.characterOutfitIds,{});
 const defaulted=contract.validate({...input,characterOutfitIds:undefined,characterViews:undefined});assert.equal(defaulted.characterOutfits[c.id],'white shirt, blue skirt');
});
test('旧版逐行服装兼容且稳定，档案更新保留衣橱，删除默认服装需重新选择',()=>{
 const input={name:'旧角色',prompt:'black hair',outfits:'white dress\nblue coat'},c=characters.profile(input);
 assert.equal(c.wardrobe.length,2);assert.deepEqual(characters.catalog({characters:[{...input,id:'old'}]})[0].wardrobe,c.wardrobe);
 const updated=characters.profile({...input,name:'新名字'},c);assert.deepEqual(updated.wardrobe,c.wardrobe);
 assert.throws(()=>characters.profile({...input,wardrobe:[],defaultOutfitId:'missing'}),/默认服装/);
 assert.throws(()=>characters.profile({...input,wardrobe:[{id:'x',name:'服装',prompt:'a'},{id:'x',name:'服装二',prompt:'b'}]}),/重复/);
});
test('重绘沿用旧图快照，背影和负面词不丢失，不因现有人设变化改写',()=>{
 const story=fixture(),c=story.characters[0],cast=characters.compose(story,[],{model:nai.defaults.model,characterIds:[c.id],characterViews:{[c.id]:'back'}});
 const image={id:'old',...nai.defaults,characterSnapshots:cast.characterSnapshots};c.prompt='red hair';c.wardrobe[0].prompt='changed';
 assert.equal(image.characterSnapshots[0].wardrobe[0].prompt,'white shirt, blue skirt','图片衣橱快照不随当前角色修改');
 // Simulate the durable snapshot stored when the image was generated.
 image.characterSnapshots=structuredClone(cast.characterSnapshots);const snap=image.characterSnapshots[0];
 const result=redraw.prepare(story,[image],nai.defaults,{imageId:'old',prompt:'garden',negativePrompt:'',characters:[{id:c.id,enabled:true,prompt:snap.prompt,negativePrompt:snap.negativePrompt,outfit:snap.sceneOutfit}]});
 assert.equal(result.cast.characterPrompts[0].prompt,'black hair, hair ribbon, white sailor collar, blue skirt, from behind');assert.equal(result.cast.characterPrompts[0].negativePrompt,'blue eyes, red dress');
});
test('整书配图保存衣橱选择，暂停再继续不会重问模型或丢失视角',async()=>{
 const story=fixture(),c=story.characters[0],job=jobs.create(story,[],'draw',{autoCharacters:false});let pause=false,calls=0,generated;
 const ctx={story,rules:[],save:async()=>{},catalog:()=>characters.catalog(story),sceneIds:p=>characters.sceneIds(story,p),paused:()=>pause,call:async(_body,_title,contract)=>{calls++;const p=contract.validate({prompt:'garden',negativePrompt:'',needsCharacters:true,characterIds:[c.id],characterPresence:{[c.id]:'physical'},characterOutfitIds:{[c.id]:'travel'},characterViews:{[c.id]:'back'}});pause=true;return {choices:[{message:{content:JSON.stringify(p)}}]};},generate:async args=>{generated=args;return {imageId:'new'};}};
 await jobs.run(job,ctx);assert.equal(job.status,'paused');assert.equal(job.units[0].prompt.characterOutfitIds[c.id],'travel');
 pause=false;await jobs.run(JSON.parse(JSON.stringify(job)),ctx);assert.equal(calls,1);assert.equal(generated.characterViews[c.id],'back');assert.equal(generated.characterOutfits[c.id],'green coat, boots');
});
