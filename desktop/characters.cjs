const {randomUUID}=require('node:crypto');
const wardrobe=require('./character-wardrobe.cjs');
function profile(input,previous){
 const text=(key,max,required=false)=>{const v=String(input[key]??'').trim();if(v.length>max||required&&!v)throw Error(`角色${key}需填写且不超过 ${max} 字`);return v;};
 const number=(key,fallback)=>{const n=Number(input[key]??fallback);if(!Number.isFinite(n)||n<0||n>1)throw Error('参考强度与保真度需为 0–1');return n;};
 return {...wardrobe.normalize(input,previous),id:previous?.id||randomUUID(),name:text('name',80,true),aliases:text('aliases',300),appearance:text('appearance',3000),prompt:text('prompt',4000,true),outfits:input.outfits===undefined?previous?.outfits||'':text('outfits',3000),negativePrompt:text('negativePrompt',2000),referenceImageId:text('referenceImageId',100),strength:number('strength',.8),fidelity:number('fidelity',.8),enabled:input.enabled!==false,updatedAt:Date.now()};
}
function select(story,ids=[]){
 if(!Array.isArray(ids)||ids.length>22||ids.some(id=>typeof id!=='string'))throw Error('本张图角色列表无效，最多 22 人');
 return [...new Set(ids)].map(id=>{const c=(story.characters||[]).find(c=>c.id===id&&c.enabled!==false);if(!c)throw Error('所选角色已删除或停用，请重新选择本张图角色');return c;});
}
function compose(story,gallery,input){
 const selected=select(story,sceneIds(story,{...input,characterIds:input.characterIds||[]})),referenceId=input.needsCharacters===false||input.characterPresence&&input.characterPresence[input.referenceCharacterId]!=='physical'?'':input.referenceCharacterId||'',refs=[];
 if(referenceId){
  if(!input.model?.startsWith('nai-diffusion-4-5-'))throw Error('角色参考图需要 V4.5 模型；请切换模型，或选择「仅固定设定」');
  const c=selected.find(c=>c.id===referenceId);if(!c)throw Error('参考角色必须在本张图的出场角色中');
  const image=gallery.find(i=>i.id===c.referenceImageId&&!i.deletedAt&&!i.missing&&i.dataUrl);
  if(!image)throw Error('角色参考图不存在或已进回收站，请重新指定定稿图');
  refs.push({dataUrl:image.dataUrl,strength:c.strength,fidelity:c.fidelity});
 }
 const max=input.model?.startsWith('nai-diffusion-5-')?22:input.model?.startsWith('nai-diffusion-4-')?6:1;
 if(selected.length>max)throw Error(`当前模型每张图最多支持 ${max} 个角色，请调整本张图角色`);
 const resolved=sceneSelection(story,{...input,characterIds:selected.map(c=>c.id)});
 return {characterPrompts:selected.map(c=>{const d=resolved.details[c.id];return {prompt:[d.prompt,d.outfit,d.view==='back'?'from behind':''].filter(Boolean).join(', '),negativePrompt:[c.negativePrompt,d.negativePrompt].filter(Boolean).join(', ')};}),preciseReferences:refs,characterSnapshots:selected.map(c=>{const d=resolved.details[c.id];return {...structuredClone(c),basePrompt:c.basePrompt||c.prompt,baseNegativePrompt:c.baseNegativePrompt??c.negativePrompt,prompt:d.prompt,negativePrompt:[c.negativePrompt,d.negativePrompt].filter(Boolean).join(', '),sceneOutfit:d.outfit,sceneOutfitId:d.presetId,sceneOutfitName:d.name,sceneView:d.view};}),referenceCharacterId:referenceId};
}
function catalog(story){return (story.characters||[]).filter(c=>c.enabled!==false).map(c=>{const {id,name,aliases,appearance,prompt,outfits,negativePrompt,defaultOutfitId,backPrompt}=c;return {id,name,aliases,appearance,prompt,outfits,negativePrompt,defaultOutfitId:defaultOutfitId||'',backPrompt:backPrompt||'',wardrobe:wardrobe.list(c)};});}
function sceneIds(story,scene){
 if(scene.needsCharacters===false)return [];
 if(catalog(story).length&&!Array.isArray(scene.characterIds))throw Error('场景识别未返回出场角色，请重新识别；固定角色尚未自动关联');
 const ids=scene.characterIds??[];select(story,ids);return [...new Set(ids)].filter(id=>!scene.characterPresence||scene.characterPresence[id]==='physical');
}
function sceneSelection(story,scene){const ids=sceneIds(story,scene);if(!ids.length)return {characterOutfits:{},characterOutfitIds:{},characterViews:{},details:{}};const clean={...scene};for(const key of ['characterOutfitIds','characterViews']){if(clean[key]&&typeof clean[key]==='object'&&!Array.isArray(clean[key]))clean[key]=Object.fromEntries(Object.entries(clean[key]).filter(([id])=>!scene.characterPresence||scene.characterPresence[id]==='physical'));}return wardrobe.resolve(story.characters||[],clean,ids);}
function sceneOutfits(story,scene){return sceneSelection(story,scene).characterOutfits;}
function sceneFields(story,scene){const {details,...fields}=sceneSelection(story,scene);return fields;}
const scenePolicy='先判断这张画面是否需要人物。参与对话不等于实体入镜：电话、通讯、传音的另一端，系统提示、内心声音、意识空间中的声音与抽象化身，不得注入固定实体外貌，也不能把他们说出的服装、外貌或动作转移给在场角色。先选定一个镜头视角，再逐人判断。远程对话可以只画当前镜头中的接听者；不要把远端人物放到同一房间。意识空间默认用抽象环境、光影或符号表现；只有原文明示实体形象且本镜头确实展示该实体时才关联固定角色。每个候选 characterIds 必须在 characterPresence 对象中给出类别：physical（本镜头有明确可见实体）、remote（远端对话者）、voice（只有声音）、mental（意识/抽象化身）、mentioned（仅提及）。只有 physical 可以保留在 characterIds，其他人物如需抽象表现仅写在场景 prompt，不用固定档案。characterOutfits 只填写同一个实体人物明确穿着的衣服，不根据台词内容推断。可返回 castReason 简短解释本镜头画谁以及谁不入镜。空镜、环境、建筑、物品特写不为展示角色而强行加人；仅被提及、回忆或不在画面中的人物不算出场。全局提示词或档案中的角色设定不代表必须出场。JSON 增加 needsCharacters 布尔值；无人画面必须为 false 且 characterIds:[]，prompt 明确写 no humans。只有本画面出场的人物才返回 ID。固定 prompt 只用于稳定外貌；衣服以本段正文为准，可参考 outfits，换装时用新的服装。JSON 增加 characterOutfits 对象，以出场角色 ID 为键、该人物本场景的英文服装标签为值，不能把多套衣服同时叠加。';
function context(pieces,afterId,offset){let cursor=0,center=0;const source=pieces.map(p=>{if(p.afterId===afterId&&offset>=p.start&&offset<=p.end)center=cursor+Math.min(p.text.length,offset-p.start);cursor+=p.text.length+1;return p.text;}).join('\n');return source.slice(Math.max(0,center-4000),Math.min(source.length,center+1500));}
module.exports={context,profile,select,compose,catalog,sceneIds,sceneOutfits,sceneFields,scenePolicy:scenePolicy+'\n'+wardrobe.policy};
