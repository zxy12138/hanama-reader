// Automatic clothing continuity belongs to the chronological job, not the global role.
const {randomUUID}=require('node:crypto'),characters=require('./characters.cjs'),wardrobe=require('./character-wardrobe.cjs');
const key=text=>String(text||'').toLowerCase().replaceAll('_',' ').split(',').map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean).sort().join(',');
function catalog(job,base){return base.map(c=>({...c,recentOutfit:job.autoLooks?.[c.id]||null}));}
function prepare(story,job,scene){
 const ids=characters.sceneIds(story,scene),outfits={...scene.characterOutfits},choices={...scene.characterOutfitIds},updates=[];
 for(const id of ids){
  const c=story.characters.find(c=>c.id===id),action=scene.characterOutfitActions?.[id]??(Object.hasOwn(outfits,id)||Object.hasOwn(choices,id)?(outfits[id]||choices[id]?'change':'none'):'keep'),last=job.autoLooks?.[id];
  if(action==='none'){outfits[id]='';choices[id]='';}
  else if(action==='keep'&&last){outfits[id]=last.outfit;choices[id]=wardrobe.list(c).some(o=>o.id===last.outfitId)?last.outfitId:'';}
  if(choices[id]||!outfits[id])continue;
  const items=wardrobe.list(c),match=items.find(o=>key(o.prompt)===key(outfits[id])||(scene.characterViews?.[id]==='back'&&o.backPrompt&&key(o.backPrompt)===key(outfits[id])));
  if(match){choices[id]=match.id;continue;}
  if(items.length>=30)continue; // Continue drawing with scene tags; never evict a saved outfit.
  let n=items.length+1;while(items.some(o=>o.name==='自动服装 '+n))n++;
  const value={id:randomUUID(),name:'自动服装 '+n,prompt:outfits[id],backPrompt:'',negativePrompt:''};
  updates.push({id,wardrobe:[...items,value]});choices[id]=value.id;
 }
 const projected={characters:(story.characters||[]).map(c=>({...c,...updates.find(u=>u.id===c.id)}))};
 const fields=characters.sceneFields(projected,{...scene,characterOutfits:outfits,characterOutfitIds:choices});
 for(const update of updates)Object.assign(story.characters.find(c=>c.id===update.id),{wardrobe:update.wardrobe,updatedAt:Date.now()});
 return fields;
}
function remember(story,job,scene){
 job.autoLooks||={};const ids=scene.needsCharacters===false?[]:(scene.characterIds||[]).filter(id=>(story.characters||[]).some(c=>c.id===id&&c.enabled!==false)&&(!scene.characterPresence||scene.characterPresence[id]==='physical'));for(const id of ids){
  const c=story.characters.find(c=>c.id===id),outfitId=scene.characterOutfitIds?.[id]||'',preset=wardrobe.list(c).find(o=>o.id===outfitId);
  job.autoLooks[id]={outfitId:preset?.id||'',outfit:preset?.prompt||scene.characterOutfits?.[id]||'',name:preset?.name||'',unit:job.cursor};
 }
}
function resume(story,job){if(job.autoLooks)return;job.autoLooks={};for(const unit of job.units.slice(0,job.cursor))if(unit.phase==='done'&&unit.prompt)remember(story,job,unit.prompt);}
const policy='自动配图模式：角色档案由软件维护，你不用重新设计已有角色。recentOutfit 是本任务中该角色上次实际使用的衣服。逐个实体角色返回 characterOutfitActions:{角色ID:"keep"或"change"或"none"}：原文没有明确新服装、换装或与旧衣冲突时 keep，软件会沿用上次衣服；原文明确新服装时 change，同时选择已有 characterOutfitIds 或填入 characterOutfits；确实不应约束服装时 none。首次出现没有 recentOutfit 时按原文明示服装选择，没有线索不编造。场景转移不等于换衣服。场景 prompt 只描述动作环境，不重复固定外貌和服装。新服装会自动记入衣橱，不需要用户操作。';
module.exports={catalog,prepare,remember,resume,policy};
