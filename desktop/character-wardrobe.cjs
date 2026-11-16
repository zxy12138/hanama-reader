// Reader-owned wardrobe data and deterministic composition. No provider or UI state.
const {randomUUID,createHash}=require('node:crypto');
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
function text(v,max,label){if(typeof v!=='string'||v.length>max)throw Error(label+'格式无效或过长');return v.trim();}
function list(character){
 if(Array.isArray(character.wardrobe))return character.wardrobe;
 return [...new Set(String(character.outfits||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean))].slice(0,30).map((prompt,i)=>({id:'legacy-'+createHash('sha256').update(prompt).digest('hex').slice(0,16),name:'服装 '+(i+1),prompt,backPrompt:'',negativePrompt:''}));
}
function normalize(input,previous={}){
 const source=input.wardrobe===undefined?list(previous.wardrobe===undefined?{...previous,outfits:input.outfits??previous.outfits}:previous):input.wardrobe;
 if(!Array.isArray(source)||source.length>30)throw Error('每个角色最多保存 30 套服装');
 const ids=new Set(),names=new Set(),wardrobe=source.map(v=>{
  if(!v||typeof v!=='object')throw Error('服装方案格式无效');
  const id=v.id===undefined?randomUUID():text(v.id,100,'服装 ID'),name=text(v.name,80,'服装名字'),prompt=text(v.prompt,1000,'服装标签');
  if(!id||!name||!prompt||ids.has(id)||names.has(name))throw Error('服装需要独立的名字、ID 和非空标签，不能重复');
  ids.add(id);names.add(name);return {id,name,prompt,backPrompt:text(v.backPrompt??'',1000,'背面服装'),negativePrompt:text(v.negativePrompt??'',1000,'服装负面标签')};
 });
 const defaultOutfitId=text(input.defaultOutfitId??previous.defaultOutfitId??'',100,'默认服装');
 if(defaultOutfitId&&!ids.has(defaultOutfitId))throw Error('默认服装已删除，请重新选择');
 return {wardrobe,defaultOutfitId,backPrompt:text(input.backPrompt??previous.backPrompt??'',4000,'角色背面标签')};
}
function map(value,label){if(value===undefined)return {};if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+'必须是对象');return value;}
function resolve(catalog,scene,ids){
 const outfits=map(scene.characterOutfits,'场景服装'),chosen=map(scene.characterOutfitIds,'服装选择'),views=map(scene.characterViews,'角色视角');
 const characterOutfits={},characterOutfitIds={},characterViews={},details={};
 for(const [key,value] of Object.entries(chosen)){if(!ids.includes(key))throw Error('服装选择只能关联本张出场角色');if(typeof value!=='string')throw Error('服装 ID 必须是字符串');}
 for(const [key,value] of Object.entries(views)){if(!ids.includes(key)||!['front','back'].includes(value))throw Error('角色视角必须是出场角色的 front 或 back');}
 for(const id of ids){
  const c=catalog.find(c=>c.id===id);if(!c)throw Error('角色档案不存在');
  const view=views[id]||'front',presetId=own(chosen,id)?chosen[id]:own(outfits,id)?'':c.defaultOutfitId||'';
  const preset=presetId?list(c).find(o=>o.id===presetId):null;
  if(presetId&&!preset)throw Error('所选服装不属于该角色或已删除，请重新选择');
  const outfit=preset?(view==='back'&&preset.backPrompt?preset.backPrompt:preset.prompt):own(outfits,id)?text(outfits[id],1000,'服装标签'):'';
  characterOutfits[id]=outfit;characterOutfitIds[id]=presetId;characterViews[id]=view;
  details[id]={outfit,presetId,name:preset?.name||'',negativePrompt:preset?.negativePrompt||'',view,prompt:view==='back'&&c.backPrompt?c.backPrompt:c.prompt};
 }
 return {characterOutfits,characterOutfitIds,characterViews,details};
}
const policy='衣橱 wardrobe 中每套衣服都有唯一 id、name、prompt。画面有对应服装时在 characterOutfitIds 中以角色 ID 为键、衣服 ID 为值，程序会原样注入，禁止改写或叠加其他套装。原文明示新衣服而衣橱无匹配时，在 characterOutfits 写本场英文标签，并将对应 characterOutfitIds 设为 ""。原文未提及服装时省略这两个对象中该角色的键，程序会使用用户指定的 defaultOutfitId（如有）；不要随意挑选衣橱第一套。明确不固定服装时使用 characterOutfits:{角色ID:""} 和 characterOutfitIds:{角色ID:""}。不要把衣橱衣服再写进场景 prompt。characterViews 以出场角色 ID 为键，值为 front 或 back；背影用 back，程序选择已保存的背面设定。仅对 physical 实体选择服装和视角；无人画面所有这些对象均为空。';
module.exports={list,normalize,resolve,policy};
