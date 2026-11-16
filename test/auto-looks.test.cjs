const {test}=require('node:test'),assert=require('node:assert/strict');
const chars=require('../desktop/characters.cjs'),looks=require('../desktop/auto-looks.cjs'),contracts=require('../desktop/model-contracts.cjs'),jobs=require('../desktop/book-jobs.cjs'),auto=require('../desktop/auto-characters.cjs'),redraw=require('../desktop/image-redraw.cjs');
function fixture(){const c=chars.profile({name:'小岚',prompt:'black hair',wardrobe:[]});return {id:'book',characters:[c],images:[],messages:[{id:'m',text:'小岚穿蓝衣。\n小岚走入花园。\n小岚换上绿衣。'}]};}
test('自动记衣服并精确去重；沿用不受模型重新编写影响，换装不改人设',()=>{
 const s=fixture(),id=s.characters[0].id,job={cursor:0},base={needsCharacters:true,characterIds:[id],characterPresence:{[id]:'physical'}},apply=p=>({...base,...looks.prepare(s,job,{...base,...p})});
 const first=apply({characterOutfits:{[id]:'blue shirt, boots'},characterOutfitActions:{[id]:'change'}});assert.equal(s.characters[0].wardrobe.length,1);assert.equal(job.autoLooks,undefined,'未出图不提前更新连续记忆');looks.remember(s,job,first);
 const next=apply({characterOutfits:{[id]:'red dress'},characterOutfitActions:{[id]:'keep'}});assert.equal(next.characterOutfits[id],'blue shirt, boots');assert.equal(s.characters[0].wardrobe.length,1);
 const reordered=apply({characterOutfits:{[id]:'boots, blue_shirt'},characterOutfitActions:{[id]:'change'}});assert.equal(reordered.characterOutfitIds[id],first.characterOutfitIds[id]);
 const changed=apply({characterOutfits:{[id]:'green coat'},characterOutfitActions:{[id]:'change'}});assert.equal(s.characters[0].wardrobe.length,2);assert.equal(changed.characterOutfits[id],'green coat');assert.equal(s.characters[0].prompt,'black hair');assert.equal(s.characters[0].defaultOutfitId,'');
 const empty=apply({characterOutfitActions:{[id]:'none'}});assert.equal(empty.characterOutfits[id],'');looks.remember(s,job,empty);assert.equal(apply({characterOutfitActions:{[id]:'keep'}}).characterOutfits[id],'');
});
test('无人和远程不建立衣服，不改连续记忆；非法决策由契约拦截',()=>{
 const s=fixture(),id=s.characters[0].id,job={autoLooks:{[id]:{outfit:'blue shirt',outfitId:''}}},before=structuredClone(job);
 for(const scene of [{needsCharacters:false,characterIds:[id],characterOutfits:{[id]:'red dress'}},{needsCharacters:true,characterIds:[id],characterPresence:{[id]:'remote'},characterOutfits:{[id]:'red dress'}}]){const out=looks.prepare(s,job,scene);looks.remember(s,job,scene);assert.deepEqual(out.characterOutfits,{});}
 assert.deepEqual(job,before);assert.equal(s.characters[0].wardrobe.length,0);
 assert.throws(()=>contracts.scene(chars.catalog(s),true).validate({prompt:'garden',needsCharacters:true,characterIds:[id],characterPresence:{[id]:'physical'},characterOutfitActions:{[id]:'guess'}}),e=>e.code==='MODEL_OUTPUT_INVALID');
});
test('契约展开默认服装前保留缺省与显式空值，自动配图不会穿回默认或恢复已取消的服装',()=>{
 const c=chars.profile({name:'小岚',aliases:'岚',prompt:'black hair',wardrobe:[{id:'default',name:'默认装',prompt:'white shirt'},{id:'recent',name:'当前装',prompt:'blue coat'}],defaultOutfitId:'default'}),s={characters:[c]},job={autoLooks:{[c.id]:{outfitId:'recent',outfit:'blue coat'}}};
 const contract=contracts.scene(chars.catalog(s),true),base={prompt:'garden',negativePrompt:'',needsCharacters:true,characterIds:['岚'],characterPresence:{'岚':'physical'}};
 const apply=raw=>{const normalized=contract.validate({...base,...raw});return {normalized,fields:looks.prepare(s,job,normalized)};};
 const missing=apply({characterOutfits:{},characterOutfitIds:{},characterOutfitActions:{}});
 assert.equal(missing.normalized.characterOutfits[c.id],'white shirt','契约仍支持默认衣橱，原始未选择的语义由动作保存');
 assert.equal(missing.normalized.characterOutfitActions[c.id],'keep');assert.equal(missing.fields.characterOutfits[c.id],'blue coat');
 for(const raw of [{characterOutfits:{'岚':''}},{characterOutfitIds:{'岚':''}},{characterOutfits:{'岚':''},characterOutfitIds:{'岚':''}}]){
  const empty=apply(raw);assert.equal(empty.normalized.characterOutfitActions[c.id],'none');assert.equal(empty.fields.characterOutfits[c.id],'');
 }
 const changed=apply({characterOutfits:{'岚':'green coat'}});assert.equal(changed.normalized.characterOutfitActions[c.id],'change');assert.equal(changed.fields.characterOutfits[c.id],'green coat');
 const chosen=apply({characterOutfitIds:{'岚':'default'}});assert.equal(chosen.fields.characterOutfits[c.id],'white shirt','明确选择默认服装仍可换装');
 const rawEmpty=looks.prepare(s,job,{...base,characterIds:[c.id],characterPresence:{[c.id]:'physical'},characterOutfits:{[c.id]:''}});assert.equal(rawEmpty.characterOutfits[c.id],'','直接调用也不能把显式留空当成缺省');
 assert.equal(looks.prepare(s,{},missing.normalized).characterOutfits[c.id],'white shirt','首次出现且无连续记忆时仍使用用户默认服装');
});
test('自动档案仅补全未知外貌，不改人工设定或已有形象',()=>{
 const c={...chars.profile({name:'小岚',prompt:'person'}),autoCreated:true},s={characters:[c]},text='小岚有黑色短发。',candidate={name:'小岚',evidence:text,appearance:'黑色短发',prompt:'black short hair'};
 auto.apply(s,{characters:[candidate]},text);assert.equal(c.prompt,'black short hair');
 auto.apply(s,{characters:[{...candidate,prompt:'red hair'}]},text);assert.equal(c.prompt,'black short hair');
 const manual=chars.profile({name:'小岚',prompt:'person'});auto.apply({characters:[manual]},{characters:[candidate]},text);assert.equal(manual.prompt,'person');
});
test('整书自动配图暂停续跑保留衣服记忆，每段自动建档，明确换装才切换',async()=>{
 const s=fixture(),id=s.characters[0].id,job=jobs.create(s,[],'draw');job.autoCharacters=true;let stop=false,outputs=[],calls=0;
 const ctx={story:s,rules:[],save:async()=>{},paused:()=>stop,catalog:()=>chars.catalog(s),sceneIds:p=>chars.sceneIds(s,p),call:async(body,_label,contract)=>{
  const index=job.cursor;let value;if(contract.kind==='scan')value={characters:[]};else{calls++;if(index>0)assert.match(body.messages[0].content,/recentOutfit/);value={prompt:'garden',negativePrompt:'',needsCharacters:true,characterIds:[id],characterPresence:{[id]:'physical'},characterOutfits:{[id]:index===2?'green coat':index===1?'hallucinated red dress':'blue shirt'},characterOutfitActions:{[id]:index===1?'keep':'change'}};}
  return {choices:[{message:{content:JSON.stringify(contract.validate(value))}}]};},generate:async args=>{outputs.push(args);if(outputs.length===1)stop=true;return {imageId:'image'+outputs.length};}};
 await jobs.run(job,ctx);assert.equal(job.cursor,1);assert.equal(job.autoLooks[id].outfit,'blue shirt');
 const durable=JSON.parse(JSON.stringify(job));Object.assign(job,durable);stop=false;await jobs.run(job,ctx);
 assert.deepEqual(outputs.map(p=>p.characterOutfits[id]),['blue shirt','blue shirt','green coat']);assert.equal(calls,3);assert.equal(s.characters[0].wardrobe.length,2);assert.equal(job.status,'completed');
 // Older paused jobs can reconstruct their last outfit without re-running paid work.
 delete job.autoLooks;looks.resume(s,job);assert.equal(job.autoLooks[id].outfit,'green coat');
});
test('一键重绘使用图片快照、随机种子和原位替换，不复制未授权参数',()=>{
 const image={id:'img',scenePrompt:'garden',sceneNegativePrompt:'text',referenceCharacterId:'c',characterSnapshots:[{id:'c',prompt:'black hair',sceneOutfit:'blue shirt',negativePrompt:''}],styleSnapshot:{enabled:true,prompt:'anime'}};
 const a=redraw.quick({images:[{id:'img',pending:false}]},[image],{imageId:'img',prompt:'injected',seed:9});assert.equal(a.seed,-1);assert.equal(a.prompt,'garden');assert.equal(a.replace,true);assert.equal(a.characters[0].outfit,'blue shirt');assert.equal(a.useReference,true);assert.equal(redraw.quick({images:[]},[image],{imageId:'img'}).replace,false);
});
