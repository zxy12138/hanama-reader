window.CharacterUI={create({run,getState,onState,render,notify}){
 const root=document.createElement('div');root.id='characterProfiles';
 root.innerHTML=`<p class="studio-note">每个故事独立保存角色。固定外貌会自动带入后续绘图；动作和场景仍按正文变化。</p>
 <div class="character-list" id="characterList"></div><button class="btn wide" id="newCharacter">＋ 新建角色</button>
 <button class="btn primary wide" id="saveCharacterTop">保存角色设定</button><div class="character-editor">
 <label class="field-label">角色名字<input id="characterName" class="text-field" maxlength="80" placeholder="例如：小岚"></label>
 <label class="field-label">别名 / 称呼<input id="characterAliases" class="text-field" maxlength="300" placeholder="例如：岚、林同学（帮助识别同一个人）"></label>
 <label class="field-label">中文外貌设定<textarea id="characterAppearance" class="text-field" rows="4" maxlength="3000" placeholder="例如：黑色齐肩短发，琥珀色眼睛，左侧银色发夹。服装在衣橱单独设置。"></textarea></label>
 <button class="btn wide" id="compileCharacter">让 AI 转为英文绘图标签</button>
 <label class="field-label">外貌提示词 · 可先试图，满意后保存<textarea id="characterPrompt" class="text-field" rows="4" maxlength="4000" placeholder="black hair, bob cut, amber eyes, silver hairclip"></textarea></label>
 <label class="field-label">避免出现的特征<textarea id="characterNegative" class="text-field" rows="2" maxlength="2000" placeholder="例如：long hair, blue eyes"></textarea></label>
 <label class="field-label">角色定稿图 · 从图库选取<select id="characterReference" class="text-field"></select></label>
 <img id="characterReferencePreview" class="character-reference-preview" hidden alt="角色定稿图">
 <button class="btn wide" id="importCharacterReference">从本地导入定稿图</button>
 <div class="drawing-grid"><label>参考强度<input id="characterStrength" class="text-field" type="number" min="0" max="1" step=".05" value=".8"></label><label>保真度<input id="characterFidelity" class="text-field" type="number" min="0" max="1" step=".05" value=".8"></label></div>
 <label class="check"><input type="checkbox" id="characterEnabled" checked>让场景识别使用这个角色</label>
 <div class="character-actions"><button class="btn primary" id="saveCharacter">保存角色</button><button class="btn" id="deleteCharacter">删除档案</button></div>
 <p id="characterStatus" class="studio-note" role="status">先保存角色，再识别场景。</p></div>`;
 document.getElementById('paint').append(root);
 const cast=document.createElement('div');cast.id='characterCast';cast.className='character-cast';
 cast.innerHTML='<strong>本张图的角色</strong><div id="castChoices"></div><label class="field-label">保持形象的方式<select id="castReference" class="text-field"></select></label><p id="castSummary" class="studio-note"></p><p id="castReason" class="studio-note"></p><details class="cast-details"><summary>查看本张固定角色标签</summary><div id="castFixedPrompts"></div></details><button class="btn wide" id="openCharacterProfiles">编辑角色档案</button><button class="btn wide" id="useReferenceModel" hidden>切换到 V4.5 使用参考图</button>';
 document.getElementById('promptText').previousElementSibling.before(cast);
 cast.insertAdjacentHTML('afterbegin','<label class="check"><input type="checkbox" id="autoJudgeCast" checked>生图前让模型判断人物与服装（会使用大模型额度）</label><button class="btn" id="judgeCast">现在判断本张角色</button>');
 root.insertAdjacentHTML('afterbegin',`<div class="rule-card"><b>全书角色生成器</b><p class="studio-note">按批扫描整理后的全文，自动保存进度。先生成候选人设，点击候选检查、修改并保存；不会覆盖已有角色。扫描会使用大模型额度。</p><button class="btn" id="scanCharacters">扫描 / 继续全书</button><button class="btn" id="pauseCharacterScan" disabled>本批完成后暂停</button><button class="btn" id="restartCharacterScan">重新扫描</button><p id="characterScanStatus" role="status"></p><div id="characterCandidates" style="max-height:220px;overflow:auto"></div></div>`);
 document.getElementById('characterPrompt').parentElement.insertAdjacentHTML('afterend',`<label class="field-label">服装方案 · 每行一套英文标签<textarea id="characterOutfits" class="text-field" rows="3" maxlength="3000" placeholder="white shirt, blue skirt\nblack evening dress"></textarea></label><p class="studio-note">固定标签只放发型、五官等稳定外貌。场景识别按正文选择或改写服装；旧标签中的衣服可用「AI 转为英文绘图标签」重新拆分。</p><button class="btn" id="characterPortrait">用已保存角色制作立绘</button>`);
 const $=id=>document.getElementById(id);let currentId='',editorStory='',dirty=false,selected=[],reference='',signature='',outfits={},outfitIds={},views={},scanning=false,pauseScan=false,judgedPrompt='',castContext='',castReason='',castRevision=0,castRenderKey='';
 $('characterPortrait').before(Object.assign(document.createElement('section'),{className:'character-trial',innerHTML:`<b>先看形象，再确定人设</b><p class="studio-note">直接使用上方尚未保存的标签生成。可反复修改、试图，满意后才保存为角色。每次试图均会调用 NovelAI。</p><label class="field-label">本次试穿服装<textarea class="text-field" id="characterTrialOutfit" rows="2" maxlength="1000" placeholder="只填写本次服装，不会写入固定外貌"></textarea></label><label class="field-label">对比种子 · -1 随机<input class="text-field" id="characterTrialSeed" type="number" min="-1" max="4294967295" value="-1"></label><p class="studio-note">试图采用绘图参数面板的模型、分辨率、步数与引导强度。相同种子便于对比修改。</p><button class="btn" id="characterTrialEstimate">查看本次参数 / 费用</button><p id="characterTrialQuote" class="studio-note" role="status"></p><button class="btn primary wide" id="characterTrialGenerate">按当前提示词生成预览</button><select class="text-field" id="characterTrialVersions" aria-label="历史角色试图"><option value="">本书的试图会保存在图库</option></select><img id="characterTrialImage" hidden alt="角色试图预览"><p id="characterTrialInfo" class="studio-note"></p><button class="btn wide" id="characterTrialAdopt" hidden>采用这张图和当时的提示词，保存角色</button>`}));
 const wardrobeHost=document.createElement('div');$('characterOutfits').parentElement.after(wardrobeHost);const wardrobeEditor=WardrobeUI.create({host:wardrobeHost,changed:()=>{dirty=true;status('衣橱有未保存修改，点击保存角色生效。');},legacy:()=>$('characterOutfits').value,trial:prompt=>{$('characterTrialOutfit').value=prompt;$('characterTrialOutfit').scrollIntoView({block:'center',behavior:'smooth'});}});
 let trialId='',trialQuoteKey='',trialQuoteRevision=0;
 function trialParams(){return {model:$('drawingModel').value,width:Number($('imageWidth').value),height:Number($('imageHeight').value),steps:Number($('imageSteps').value),scale:Number($('imageScale').value),seed:Number($('characterTrialSeed').value),characterIds:[],referenceCharacterId:''};}
 function trialSync(){const pictures=(getState()?.gallery||[]).filter(p=>p.portraitDraft&&p.sourceStoryId===getState()?.story.id&&!p.deletedAt&&!p.missing);$('characterTrialVersions').replaceChildren(new Option('选择历史试图',''),...pictures.slice().reverse().map((p,i)=>new Option(`${pictures.length-i}. ${p.caption} · 种子 ${p.seed}`,p.id)));const p=pictures.find(p=>p.id===trialId);$('characterTrialVersions').value=p?.id||'';$('characterTrialImage').hidden=!p;$('characterTrialAdopt').hidden=!p;if(p){$('characterTrialImage').src=p.dataUrl;$('characterTrialImage').draggable=true;$('characterTrialImage').dataset.previewImage=p.id;$('characterTrialInfo').textContent='当时提示词：'+p.portraitDraft.prompt+'\n服装：'+(p.portraitDraft.outfit||'未指定');}else $('characterTrialInfo').textContent='';}
 async function trialQuote(){const revision=++trialQuoteRevision,p=trialParams(),q=await run('drawing.estimate',p);if(revision!==trialQuoteRevision)return;$('characterTrialQuote').textContent=`${p.model} · ${p.width} × ${p.height} · ${p.steps} 步 · 预估 ${q.estimated} Anlas / 张${q.conditionalFree?'（有 V5 额度时可能免费）':''}，实际以服务扣费为准`;}
 $('characterTrialEstimate').onclick=()=>trialQuote().catch(e=>status(e.message));
 $('characterTrialVersions').onchange=()=>{trialId=$('characterTrialVersions').value;trialSync();};
 $('characterTrialGenerate').onclick=async()=>{const button=$('characterTrialGenerate'),storyId=getState().story.id;button.disabled=true;try{const draft={prompt:$('characterPrompt').value.trim(),negativePrompt:$('characterNegative').value,outfit:$('characterTrialOutfit').value};if(!draft.prompt)throw Error('先填写上方的绘图标签，无需提前保存角色');dirty=true;await trialQuote();status('正在生成角色试图，不会修改已保存的人设…');const r=await run('character.preview',{...trialParams(),storyId,name:$('characterName').value,...draft});onState(r.state);trialId=r.result.imageId;render();trialSync();if(getState().story.id!==storyId)return;$('characterTrialSeed').value=r.result.seed;status('试图已保存到图库。可以修改标签再次生成，满意后采用；已填入本次种子便于对比。');}catch(e){status(e.message);}finally{button.disabled=false;}};
 $('characterTrialAdopt').onclick=()=>{const p=(getState().gallery||[]).find(p=>p.id===trialId&&!p.deletedAt);if(!p?.portraitDraft)return;if(!$('characterName').value.trim()){status('请为这个角色填写名字，再采用试图。');$('characterName').focus();return;}$('characterPrompt').value=p.portraitDraft.prompt;$('characterNegative').value=p.portraitDraft.negativePrompt||'';$('characterReference').value=p.id;const outfit=p.portraitDraft.outfit;if(outfit&&!$('characterOutfits').value.split('\n').includes(outfit))$('characterOutfits').value=[$('characterOutfits').value,outfit].filter(Boolean).join('\n');dirty=true;preview();$('saveCharacter').click();};
 const notifyCast=()=>{castRevision++;document.dispatchEvent(new Event('hanama:cast-changed'));};
 function selection(){return {autoJudgeCast:$('autoJudgeCast').checked,castPolicyVersion:judgedPrompt&&judgedPrompt===$('promptText').value?2:0,castContext,castReason,characterIds:[...selected],referenceCharacterId:reference,characterOutfits:Object.fromEntries(selected.filter(id=>Object.hasOwn(outfits,id)).map(id=>[id,outfits[id]])),characterOutfitIds:Object.fromEntries(selected.filter(id=>Object.hasOwn(outfitIds,id)).map(id=>[id,outfitIds[id]])),characterViews:Object.fromEntries(selected.filter(id=>views[id]).map(id=>[id,views[id]]))};}
 function status(text){$('characterStatus').textContent=text;}
 function preview(){const p=(getState()?.gallery||[]).find(p=>p.id===$('characterReference').value&&!p.deletedAt);$('characterReferencePreview').hidden=!p;if(p)$('characterReferencePreview').src=p.dataUrl||'';}
 function fill(c){
  currentId=c?.id||'';dirty=false;wardrobeEditor.fill(c);
  $('characterOutfits').value=c?.outfits||'';
  for(const [id,key] of [['characterName','name'],['characterAliases','aliases'],['characterAppearance','appearance'],['characterPrompt','prompt'],['characterNegative','negativePrompt'],['characterReference','referenceImageId']])$(id).value=c?.[key]||'';
  $('characterStrength').value=c?.strength??.8;$('characterFidelity').value=c?.fidelity??.8;$('characterEnabled').checked=c?.enabled!==false;$('deleteCharacter').disabled=!currentId;preview();status(c?'已加载角色，修改后点击保存。':'新角色：先填写提示词试图，满意后再填写名字并保存。');
 }
 function castKey(){return JSON.stringify([getState()?.story.id,getState()?.story.characters,selected,reference,outfits,outfitIds,views,castReason,$('drawingModel')?.value]);}
 function manualCast(reason='手动设置本张角色与服装'){judgedPrompt='';$('autoJudgeCast').checked=false;castReason=reason;$('castReason').textContent=reason;}
 function drawCast(){
  const nextKey=castKey();if(nextKey===castRenderKey)return;castRenderKey=nextKey;
  const profiles=(getState()?.story.characters||[]).filter(c=>c.enabled!==false);selected=selected.filter(id=>profiles.some(c=>c.id===id));
  const choices=$('castChoices');choices.replaceChildren();
  if(!profiles.length){const p=document.createElement('p');p.className='studio-note';p.textContent='还没有角色档案。先设定形象，后续场景会自动匹配。';choices.append(p);}
  for(const c of profiles){const label=document.createElement('label');label.className='character-chip';const input=document.createElement('input');input.type='checkbox';input.checked=selected.includes(c.id);input.onchange=()=>{manualCast('手动选择出场角色');selected=input.checked?[...selected,c.id]:selected.filter(id=>id!==c.id);drawCast();notifyCast();};label.append(input,document.createTextNode(c.name));choices.append(label);}
  for(const c of profiles.filter(c=>selected.includes(c.id))){
   const label=document.createElement('label');label.className='field-label';label.textContent=c.name+' · 本场服装';
   const pick=document.createElement('select');pick.className='text-field';pick.dataset.outfitFor=c.id;pick.append(new Option('按角色默认服装','@default'),new Option('本次自定义 / 不固定',''),...(c.wardrobe||[]).map(o=>new Option(o.name,o.id)));
   const chosen=Object.hasOwn(outfitIds,c.id)?outfitIds[c.id]:Object.hasOwn(outfits,c.id)?'':'@default';pick.value=chosen;
   const view=document.createElement('select');view.className='text-field';view.setAttribute('aria-label',c.name+'镜头方向');view.dataset.viewFor=c.id;view.append(new Option('正面 / 其他角度','front'),new Option('背影 · 使用背面设定','back'));view.value=views[c.id]||'front';
   const input=document.createElement('input');input.className='text-field';input.dataset.sceneOutfit=c.id;input.maxLength=1000;
   const preset=(c.wardrobe||[]).find(o=>o.id===(chosen==='@default'?c.defaultOutfitId:chosen));input.value=preset?(view.value==='back'&&preset.backPrompt?preset.backPrompt:preset.prompt):outfits[c.id]||'';input.placeholder='本次英文服装标签；留空表示不固定';input.readOnly=!!preset;
   const manual=()=>manualCast();
   pick.onchange=()=>{manual();if(pick.value==='@default'){delete outfits[c.id];delete outfitIds[c.id];}else{outfitIds[c.id]=pick.value;outfits[c.id]=pick.value?(c.wardrobe||[]).find(o=>o.id===pick.value)?.prompt||'':'';}drawCast();notifyCast();};
   input.oninput=()=>{manual();outfits[c.id]=input.value;outfitIds[c.id]='';pick.value='';castRenderKey=castKey();notifyCast();};view.onchange=()=>{manual();views[c.id]=view.value;drawCast();notifyCast();};label.append(pick,input,view);
   if(c.outfits){const legacy=document.createElement('select');legacy.className='text-field';legacy.append(new Option('选取旧版逐行服装',''),...c.outfits.split('\n').filter(Boolean).map(v=>new Option(v,v)));legacy.onchange=()=>{manual();outfits[c.id]=legacy.value;outfitIds[c.id]='';drawCast();notifyCast();};label.append(legacy);}choices.append(label);
  }
  const available=profiles.filter(c=>selected.includes(c.id)&&c.referenceImageId);
  if(!available.some(c=>c.id===reference))reference='';
  $('castReference').replaceChildren(new Option('仅固定设定 · 所有模型',''),...available.map(c=>new Option('参考图 · '+c.name,c.id)));$('castReference').value=reference;
  const model=$('drawingModel')?.value||getState()?.drawing?.model||'',needsModel=!!reference&&!model.startsWith('nai-diffusion-4-5-');
  $('useReferenceModel').hidden=!needsModel;
  const names=profiles.filter(c=>selected.includes(c.id)).map(c=>c.name);
  $('castFixedPrompts').replaceChildren(...profiles.filter(c=>selected.includes(c.id)).map(c=>{const p=document.createElement('p');p.textContent=c.name+'：'+c.prompt+(c.negativePrompt?'\n避免：'+c.negativePrompt:'');return p;}));
  $('castReason').textContent=castReason;
  $('castSummary').textContent=names.length?`本张：${names.join('、')}。`+(reference?'使用 1 张主要角色参考图；仅 V4.5，额外约 5 Anlas，且不适用 Opus 免费档。多人参考可能混合，本次只传所选角色的定稿图。':'自动附加档案中的固定绘图标签。参考图可在上方选择；文字设定不能保证每次五官完全相同。'):'未选择固定角色，按场景提示词生成。';
 }
 function apply(value={}){castRevision++;$('autoJudgeCast').checked=typeof value.autoJudgeCast==='boolean'?value.autoJudgeCast:value.castPolicyVersion===2||!((value.characterIds||[]).length||Object.keys(value.characterOutfits||{}).length||String(value.castReason||'').includes('手动'));castContext=value.castContext||'';castReason=value.castReason||'';judgedPrompt=value.castPolicyVersion===2?value.prompt||'':'';selected=[...(value.characterIds||[])];reference=value.referenceCharacterId||'';outfits={...value.characterOutfits};outfitIds={...value.characterOutfitIds};views={...value.characterViews};drawCast();}
 function useScene(scene){castRevision++;$('autoJudgeCast').checked=true;castContext=scene.castContext||'';castReason=scene.castReason||'';judgedPrompt=scene.castPolicyVersion===2&&typeof scene.prompt==='string'?scene.prompt:'';selected=scene.needsCharacters===false?[]:[...(scene.characterIds||[])];outfits={...scene.characterOutfits};outfitIds={...scene.characterOutfitIds};views={...scene.characterViews};const refs=(getState().story.characters||[]).filter(c=>selected.includes(c.id)&&c.referenceImageId);reference=Object.values(outfits).some(Boolean)||!$('drawingModel').value.startsWith('nai-diffusion-4-5-')?'':refs.length===1?refs[0].id:'';drawCast();}
 function sync(){
  const s=getState();if(!s)return;
  trialSync();
  const quoteKey=JSON.stringify([trialParams(),s.account]);if(quoteKey!==trialQuoteKey){trialQuoteKey=quoteKey;trialQuote().catch(e=>{$('characterTrialQuote').textContent=e.message;});}
  const scan=s.story.characterScan;$('characterScanStatus').textContent=scan?`${scan.completed?'扫描完成':'已保存进度'} · ${scan.cursor} / ${scan.total} 字 · ${scan.candidates.length} 个候选`:'';
  $('characterCandidates').replaceChildren(...(scan?.candidates||[]).map(c=>{const b=document.createElement('button');b.className='btn';b.textContent=c.name;b.title=c.evidence;b.onclick=()=>{if(dirty&&!confirm('放弃未保存的修改，查看候选？'))return;const existing=s.story.characters?.find(p=>p.name===c.name);fill({...c,id:existing?.id||'',referenceImageId:existing?.referenceImageId||''});dirty=true;status('候选人设，请核对原文、补充外貌后保存。');};return b;}));
  if(editorStory!==s.story.id){editorStory=s.story.id;currentId='';dirty=false;selected=[];reference='';outfits={};outfitIds={};views={};signature='';judgedPrompt='';castContext='';castReason='';$('autoJudgeCast').checked=true;pauseScan=true;}
  const key=JSON.stringify([s.story.characters,(s.gallery||[]).map(p=>[p.id,p.deletedAt,p.missing])]);
  if(key!==signature){
   signature=key;const list=$('characterList');list.replaceChildren();
   for(const c of s.story.characters||[]){const b=document.createElement('button');b.className='btn character-item';b.textContent=c.name+(c.enabled===false?' · 已停用':c.referenceImageId?' · 有定稿图':' · 固定设定');b.onclick=()=>{if(!dirty||confirm('放弃当前未保存的角色修改？'))fill(c);};list.append(b);}
   const old=$('characterReference').value;$('characterReference').replaceChildren(new Option('暂不指定定稿图',''),...(s.gallery||[]).filter(p=>!p.deletedAt&&!p.missing).map((p,i)=>new Option(`${i+1}. ${p.caption||'故事插图'}`,p.id)));$('characterReference').value=old;
   if(!dirty)fill((s.story.characters||[]).find(c=>c.id===currentId));preview();
  }
  drawCast();
 }
 for(const input of root.querySelectorAll('input,textarea,select'))input.addEventListener('input',()=>{dirty=true;status('有未保存修改 · 点击「保存角色」生效');if(input.id==='characterReference')preview();});
 $('newCharacter').onclick=()=>{if(!dirty||confirm('放弃当前未保存的角色修改？'))fill();};
 $('saveCharacter').onclick=async()=>{
  try{const s=getState(),p={...wardrobeEditor.value(),id:currentId,name:$('characterName').value,aliases:$('characterAliases').value,appearance:$('characterAppearance').value,prompt:$('characterPrompt').value,outfits:$('characterOutfits').value,negativePrompt:$('characterNegative').value,referenceImageId:$('characterReference').value,strength:Number($('characterStrength').value),fidelity:Number($('characterFidelity').value),enabled:$('characterEnabled').checked};
   const result=await run('character.save',{storyId:s.story.id,profile:p});onState(result.state);currentId=result.characterId;dirty=false;signature='';render();fill(getState().story.characters.find(c=>c.id===currentId));status('角色已保存；后续生图会使用最新设定。');notifyCast();
  }catch(e){status(e.message);}
 };
 $('saveCharacterTop').onclick=()=>$('saveCharacter').click();
 $('deleteCharacter').onclick=async()=>{if(!currentId||!confirm('删除这个角色档案？已有图片和图库原图会保留。'))return;try{onState(await run('character.delete',{storyId:getState().story.id,id:currentId}));dirty=false;currentId='';signature='';render();notifyCast();}catch(e){status(e.message);}};
 $('compileCharacter').onclick=async()=>{const id=editorStory,roleId=currentId,before=[$('characterAppearance').value,$('characterPrompt').value,$('characterOutfits').value];status('正在转换设定，可在控制台查看返回…');try{const r=await run('character.compile',{storyId:id,appearance:$('characterAppearance').value});if(id!==editorStory||roleId!==currentId||JSON.stringify(before)!==JSON.stringify([$('characterAppearance').value,$('characterPrompt').value,$('characterOutfits').value])){notify('角色内容已变化，未覆盖你新的编辑；需要时请重新转换。');return;}$('characterPrompt').value=r.prompt;$('characterOutfits').value=r.outfits||'';dirty=true;status('标签已填入，请检查后保存角色。');}catch(e){status(e.message);}};
 $('importCharacterReference').onclick=async()=>{try{const r=await run('character.reference',{storyId:getState().story.id});if(r.canceled)return;onState(r.state);dirty=true;sync();$('characterReference').value=r.imageId;preview();status('定稿图已存入图库，点击「保存角色」绑定。');}catch(e){status(e.message);}};
 $('castReference').onchange=()=>{manualCast('手动选择角色参考方式');reference=$('castReference').value;drawCast();notifyCast();};
 $('openCharacterProfiles').onclick=()=>document.dispatchEvent(new Event('hanama:open-characters'));
 $('useReferenceModel').onclick=()=>{$('drawingModel').value='nai-diffusion-4-5-full';$('drawingModel').dispatchEvent(new Event('input'));drawCast();};
 $('drawingModel').addEventListener('input',drawCast);
 document.addEventListener('hanama:reference-image',e=>{
  const s=getState(),profiles=s.story.characters||[];if(!profiles.length){notify('先创建并保存一个角色，再从图库指定定稿图。');document.dispatchEvent(new Event('hanama:open-characters'));return;}
  const d=document.createElement('dialog'),title=document.createElement('h3'),select=document.createElement('select'),save=document.createElement('button'),cancel=document.createElement('button'),note=document.createElement('p');
  title.textContent='将这张图设为角色定稿';select.className='text-field';select.append(...profiles.map(c=>new Option(c.name,c.id)));save.className='btn primary';save.textContent='绑定到这个角色';cancel.className='btn';cancel.textContent='取消';note.textContent='会替换该角色之前绑定的定稿图，图库原图保留。';
  cancel.onclick=()=>d.close();save.onclick=async()=>{save.disabled=true;try{const c=getState().story.characters.find(c=>c.id===select.value);if(!c)throw Error('角色已删除');const r=await run('character.save',{storyId:s.story.id,profile:{...c,referenceImageId:e.detail.imageId}});onState(r.state);render();d.close();notify('已绑定角色定稿图；选择场景后可启用参考图模式。');}catch(err){note.textContent=err.message;save.disabled=false;}};
  d.append(title,select,note,save,cancel);d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();
 });
 async function scanAll(restart=false){if(scanning)return;const storyId=getState().story.id;scanning=true;pauseScan=false;$('scanCharacters').disabled=true;$('restartCharacterScan').disabled=true;$('pauseCharacterScan').disabled=false;try{do{if(getState().story.id!==storyId)break;const next=await run('character.scan',{storyId,restart});restart=false;onState(next);render();if(next.story.characterScan.completed)break;}while(!pauseScan);}catch(e){status(e.message);}finally{scanning=false;$('scanCharacters').disabled=false;$('restartCharacterScan').disabled=false;$('pauseCharacterScan').disabled=true;}}
 $('scanCharacters').onclick=()=>scanAll();$('pauseCharacterScan').onclick=()=>{pauseScan=true;status('当前批次完成后暂停，进度会保存。');};$('restartCharacterScan').onclick=()=>{if(confirm('重新扫描将替换扫描候选和进度，已保存角色不受影响。'))scanAll(true);};
 $('characterPortrait').onclick=()=>{if(dirty||!currentId){status('请先保存角色设定，再制作立绘。');return;}selected=[currentId];outfits={};outfitIds={};views={};reference='';$('autoJudgeCast').checked=false;drawCast();$('promptText').value='solo, character reference portrait, simple background, standing, full body';$('promptText').dispatchEvent(new Event('input'));$('negativePrompt').value='multiple people';$('autoInsertImage').checked=false;notifyCast();document.dispatchEvent(new Event('hanama:open-prompts'));notify('立绘提示词已准备，可改服装与提示词，确认费用后点击生成；生成后可从图库绑定定稿图。');};
 async function judge(force=false){if(!force&&judgedPrompt&&judgedPrompt===$('promptText').value)return;if(!force&&!$('autoJudgeCast').checked||!(getState().story.characters||[]).some(c=>c.enabled!==false))return;const storyId=getState().story.id,prompt=$('promptText').value,revision=castRevision,context=castContext,text=('当前画面：'+prompt+'\n素材参考（只判断当前画面实际入镜者）：'+(context||$('sourceText')?.value||'').slice(0,6000)).trim();const r=await run('character.match',{storyId,text});if(getState().story.id!==storyId)throw Error('书籍已切换，请重新判断');if(revision!==castRevision||prompt!==$('promptText').value||context!==castContext)throw Error('人物或画面已修改，已保留你的新设置，请重新点击判断或生成');useScene({...r,castContext:context});judgedPrompt=prompt;notifyCast();return r;}
 $('autoJudgeCast').onchange=()=>{judgedPrompt='';notifyCast();};
 document.addEventListener('hanama:cast-new-selection',e=>{if(e.detail?.storyId!==getState()?.story.id||!e.detail?.accepted)return;judgedPrompt='';castContext='';castReason='';$('autoJudgeCast').checked=true;castRevision++;});
 $('judgeCast').onclick=async()=>{try{await judge(true);notify('已更新本张出场角色和服装，可手动修改；无人场景不注入角色。');}catch(e){notify(e.message);}};
 return {root,selection,apply,useScene,sync,judge};
}};
