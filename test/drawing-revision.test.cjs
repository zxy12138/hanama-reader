const test=require('node:test'),assert=require('node:assert/strict');
const style=require('../desktop/drawing-style.cjs'),contracts=require('../desktop/model-contracts.cjs'),characters=require('../desktop/characters.cjs'),redraw=require('../desktop/image-redraw.cjs'),nai=require('../desktop/novelai.cjs'),layout=require('../story-layout.js'),reader=require('../reader-model.js');
test('统一画风保留内容与光照，去掉冲突的完整画风标签，重复生成不叠加',()=>{
 const input={prompt:'red hair, sunset, oil painting, artist:example, holding a watercolor brush',negativePrompt:'blurry, realistic'};
 const first=style.apply(input);assert.match(first.prompt,/red hair, sunset/);assert.match(first.prompt,/holding a watercolor brush/);assert.doesNotMatch(first.prompt,/oil painting|artist:/);assert.match(first.prompt,/anime style/);assert.match(first.negativePrompt,/blurry/);
 assert.deepEqual(style.apply(first),first);assert.equal(style.apply(input,{enabled:false}).prompt,input.prompt);
 assert.throws(()=>style.settings({prompt:''}),/填写/);assert.throws(()=>style.settings({negativePrompt:'x'.repeat(2001)}),/2000/);
 const water=style.apply({prompt:'anime style, red rose'},{prompt:'watercolor (medium)',negativePrompt:'3d'});assert.equal(water.prompt,'red rose, watercolor (medium)');
});
const catalog=[{id:'a',name:'小岚',prompt:'black hair',enabled:true},{id:'b',name:'小泽',prompt:'blue hair',enabled:true}];
test('按人判断实体与远程，过滤远端人物的服装，意识声音不注入固定角色',()=>{
 const d=contracts.match(catalog,true).validate({needsCharacters:true,characterIds:['a','b'],characterPresence:{a:'physical',b:'remote'},characterOutfits:{a:'white shirt',b:'red coat'}});
 assert.deepEqual(d.characterIds,['a']);assert.deepEqual(d.characterOutfits,{a:'white shirt'});
 assert.deepEqual(contracts.match(catalog,true).validate({...d,characterIds:['a'],characterPresence:{a:'mental'}}).characterIds,[]);
 assert.throws(()=>contracts.match(catalog,true).validate({needsCharacters:true,characterIds:['a']}),/characterPresence/);
 const cast=characters.compose({characters:catalog},[],{model:nai.defaults.model,...d});assert.equal(cast.characterPrompts.length,1);assert.equal(cast.characterPrompts[0].prompt,'black hair, white shirt');
 assert.equal(characters.compose({characters:catalog},[],{characterIds:['b'],characterPresence:{b:'voice'},referenceCharacterId:'b'}).characterPrompts.length,0);
});
test('重绘按图片快照编辑，保留位置与参数，不依赖当前角色档案、不修改原图',()=>{
 const image={id:'img',prompt:'old',model:nai.defaults.model,width:832,height:1216,steps:24,scale:5,seed:99,characterSnapshots:[{...catalog[0],sceneOutfit:'white shirt'}]};
 const story={id:'book',characters:[],messages:[{id:'m',text:'甲乙丙丁'}],images:[{...image,afterId:'m',offset:2,pending:false}]},before=structuredClone({image,story});
 const args={imageId:'img',prompt:'new scene',negativePrompt:'bad anatomy',replace:true,characters:[{id:'a',enabled:true,prompt:'silver hair',negativePrompt:'',outfit:'blue dress'}]};
 const p=redraw.prepare(story,[image],nai.defaults,args);assert.equal(p.args.afterId,'m');assert.equal(p.args.offset,2);assert.equal(p.args.seed,99);assert.equal(p.args.steps,24);assert.equal(p.args.replaceImageId,'img');assert.equal(p.cast.characterPrompts[0].prompt,'silver hair, blue dress');assert.deepEqual({image,story},before);
 assert.equal(redraw.prepare(story,[image],nai.defaults,{...args,replace:false}).args.portraitPreview,true);
 assert.throws(()=>redraw.prepare({...story,images:[]},[image],nai.defaults,args),/不在当前正文/);
 assert.throws(()=>redraw.prepare(story,[{...image,deletedAt:1}],nai.defaults,args),/原图已删除/);
 assert.throws(()=>redraw.prepare(story,[image],nai.defaults,{...args,characters:[]}),/列表/);
});
test('连续屏蔽与空行仅合并显示，不扩大原始屏蔽、导出或素材范围，保留图片边界',()=>{
 const m={id:'m',text:'甲\n\n乙正文丙丁',manualExcluded:[{from:0,to:1},{from:3,to:4},{from:6,to:7},{from:7,to:8}]};
 const analyzed=reader.analyzeMessages([m],[]),before=structuredClone(analyzed);const flow=layout.flow(m,analyzed.messages[0],[]);
 assert.deepEqual(flow.map(s=>[s.text,s.hidden]),[['甲\n\n乙',true],['正文',false],['丙丁',true]]);
 assert.deepEqual(analyzed,before);assert.equal(analyzed.messages[0].text,'\n\n正文');assert.equal(analyzed.hiddenChars,4);
 const withImage=layout.flow(m,analyzed.messages[0],[{id:'i',afterId:'m',offset:1}]);assert.equal(withImage.filter(s=>s.hidden).length,3);assert.equal(withImage[1].type,'image');
 assert.equal(layout.flow(m,analyzed.messages[0],[],true)[0].text,m.text);
});
test('长批次场景复查使用落点附近素材，不截取成整批开头',()=>{
 const text='开头场景。'.repeat(1500)+'小岚在房间接听电话，另一端是小泽。';
 const context=characters.context([{afterId:'m',start:0,end:text.length,text}],'m',text.length);
 assert.ok(context.length<=5500);assert.match(context,/另一端是小泽/);
});
test('本书画风随存档保存与切换，修改一本不影响另一本',async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),{WorkspaceStore}=require('../desktop/workspace-store.cjs');
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../.reader-test/style-books-')),file=path.join(dir,'story.json'),store=new WorkspaceStore(file);
 const first={id:'first',title:'甲',messages:[{id:'m',text:'正文'}],images:[],drawingStyle:style.settings({prompt:'watercolor (medium)',negativePrompt:'3d'})};
 await store.save(first,[]);const next=store.switchTo({id:'second',title:'乙',messages:[{id:'n',text:'正文乙'}],images:[]},first,[]);assert.equal(next.story.drawingStyle,undefined);await store.save(next.story,[]);
 const restored=new WorkspaceStore(file);await restored.load();assert.equal(restored.archives.first.story.drawingStyle.prompt,'watercolor (medium)');
});
