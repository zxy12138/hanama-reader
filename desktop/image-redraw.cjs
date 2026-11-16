const nai=require('./novelai.cjs'),characters=require('./characters.cjs'),style=require('./drawing-style.cjs');
function prepare(story,gallery,drawing,args){
 const image=gallery.find(p=>p.id===args.imageId&&!p.deletedAt&&!p.missing);
 if(!image)throw Error('原图已删除或文件缺失，请重新选择');
 for(const key of ['prompt','negativePrompt'])if(typeof args[key]!=='string'||args[key].length>16000||(key==='prompt'&&!args[key].trim()))throw Error('请填写有效提示词（最多 16000 字）');
 const placed=story.images.find(p=>p.id===image.id&&!p.pending);
 if(args.replace===true&&!placed)throw Error('这张图已不在当前正文中，请关闭替换选项后重试');
 const params=nai.parameters({...drawing,...Object.fromEntries(['model','width','height','steps','scale','seed'].filter(k=>image[k]!==undefined).map(k=>[k,image[k]])),seed:args.seed??image.seed??-1});
 const snapshots=image.characterSnapshots||[];
 if(!Array.isArray(args.characters)||args.characters.length!==snapshots.length)throw Error('角色提示词列表已变化，请重新打开图片');
 const edited=snapshots.map((c,i)=>{const v=args.characters[i];if(v.id!==c.id||typeof v.enabled!=='boolean'||typeof v.prompt!=='string'||!v.prompt.trim()||v.prompt.length>4000||typeof v.negativePrompt!=='string'||v.negativePrompt.length>2000||typeof v.outfit!=='string'||v.outfit.length>1000)throw Error('角色提示词无效，请检查外貌、服装和负面标签');return {...c,backPrompt:'',prompt:v.prompt,negativePrompt:v.negativePrompt,sceneOutfit:v.outfit,enabled:v.enabled};});
 const ids=edited.filter(c=>c.enabled).map(c=>c.id),ref=args.useReference===true&&ids.includes(image.referenceCharacterId)?image.referenceCharacterId:'';
 const cast=characters.compose({characters:edited},gallery,{...params,characterIds:ids,referenceCharacterId:ref,characterOutfits:Object.fromEntries(edited.map(c=>[c.id,c.sceneOutfit])),characterViews:Object.fromEntries(edited.filter(c=>c.enabled).map(c=>[c.id,c.sceneView||'front']))});
 return {cast,args:{...params,storyId:story.id,prompt:args.prompt,negativePrompt:args.negativePrompt,style:style.settings(args.style??image.styleSnapshot??story.drawingStyle),caption:image.caption||'重绘插图',redrawOf:image.id,replaceImageId:args.replace===true?image.id:undefined,portraitPreview:args.replace!==true,deferInsert:args.replace!==true,afterId:placed?.afterId,offset:placed?.offset}};
}
function quick(story,gallery,args){
 const image=gallery.find(p=>p.id===args.imageId&&!p.deletedAt&&!p.missing);if(!image)throw Error('图片不存在或已删除');
 return {imageId:image.id,prompt:image.scenePrompt??image.prompt??'',negativePrompt:image.sceneNegativePrompt??image.negativePrompt??'',style:image.styleSnapshot??story.drawingStyle,seed:-1,replace:story.images.some(p=>p.id===image.id&&!p.pending),useReference:!!image.referenceCharacterId,characters:(image.characterSnapshots||[]).map(c=>({id:c.id,enabled:c.enabled!==false,prompt:c.prompt,negativePrompt:c.negativePrompt||'',outfit:c.sceneOutfit||''}))};
}
module.exports={prepare,quick};
