const {test}=require('node:test'),assert=require('node:assert/strict'),auto=require('../desktop/auto-characters.cjs'),jobs=require('../desktop/book-jobs.cjs'),chars=require('../desktop/characters.cjs');
test('自动角色按姓名别名去重，不覆盖人工档案；歧义与虚构证据不写入',()=>{
 const original=chars.profile({name:'林月',aliases:'小月',prompt:'silver hair',enabled:false}),story={characters:[original]},text='小月走来。陈星穿着蓝色衬衫。';
 const candidate={name:'陈星',evidence:'陈星穿着蓝色衬衫。',prompt:'person',outfits:'blue shirt'};
 assert.equal(auto.apply(story,{characters:[{name:'小月',evidence:'小月走来。',prompt:'red hair'},candidate,candidate]},text).length,1);
 assert.equal(story.characters[0],original);assert.equal(story.characters[0].enabled,false);assert.equal(story.characters[1].prompt,'person');assert.equal(story.characters[1].outfits,'blue shirt');
 assert.throws(()=>auto.apply(story,{characters:[{...candidate,name:'不存在'}]},text),/证据/);
 assert.throws(()=>auto.apply(story,{characters:[{name:'新名',aliases:'小月',evidence:'新名与小月',prompt:'person'}]},'新名与小月'),/冲突/);
 assert.equal(story.characters.length,2);
});
test('发现角色先存档，暂停续跑不重复扫描；同段生成可引用新 ID，画风随任务传入',async()=>{
 let story={id:'s',messages:[{id:'m',text:'陈星走来。'}],images:[]},j=jobs.create(story,[],'draw');j.autoCharacters=true;j.style={enabled:true,prompt:'watercolor (medium)',negativePrompt:'3d'};let scans=0,prompts=0,stop=false;
 const ctx={story,rules:[],save:async()=>{},paused:()=>stop,catalog:()=>chars.catalog(story),sceneIds:p=>chars.sceneIds(story,p),call:async(req,label,contract)=>{
  let data;if(label.startsWith('自动建立角色')){scans++;stop=true;data={characters:[{name:'陈星',prompt:'person',evidence:'陈星走来。'}]};}else{prompts++;assert.match(req.messages[0].content,/陈星/);const id=story.characters[0].id;data={prompt:'garden',negativePrompt:'blurry',needsCharacters:true,characterIds:[id],characterPresence:{[id]:'physical'}};}
  return {choices:[{message:{content:JSON.stringify(contract.validate(data))}}]};},generate:async args=>{assert.equal(args.style.prompt,'watercolor (medium)');assert.equal(args.characterIds[0],story.characters[0].id);return {imageId:'img'};}};
 await jobs.run(j,ctx);assert.equal(j.status,'paused');assert.equal(scans,1);assert.equal(prompts,0);assert.equal(j.units[0].charactersScanned,true);
 j=JSON.parse(JSON.stringify(j));stop=false;await jobs.run(j,ctx);assert.equal(scans,1);assert.equal(prompts,1);assert.equal(j.status,'completed');assert.equal(j.addedCharacters,1);
});
