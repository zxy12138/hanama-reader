(function(){
  const models=[['nai-diffusion-5-full','V5 Full'],['nai-diffusion-5-curated','V5 Curated'],['nai-diffusion-4-5-full','V4.5 Full'],['nai-diffusion-4-5-curated','V4.5 Curated'],['nai-diffusion-4-full','V4 Full'],['nai-diffusion-4-curated','V4 Curated'],['nai-diffusion-3','V3 Anime'],['nai-diffusion-furry-3','V3 Furry']];
  function create({run,api,getState,onState,render,notify}){
    const el=id=>document.getElementById(id),panel=el('paint');let active=false,revision=0,lastStory=null,lastPlan=null,workflow,characterUI;
    panel.innerHTML=`<div class="eyebrow">NOVELAI STUDIO</div><h3>让故事里的瞬间成为画面</h3><p class="desc">按章节挑选场景，或选中文字放入素材框。模型编写提示词，生成后拖到正文。</p>
      <button class="btn wide" id="generateBtn">✧ 自动识别场景与生成提示词</button><div id="scenePlans"></div>
      <div class="rule-result">⌖ 插入位置</div><select class="text-field" id="imageAfter" aria-label="图片插入位置"></select>
      <label class="field-label" for="promptText">画面提示词 · 可自由修改</label><textarea class="text-field" id="promptText" rows="5" placeholder="先自动规划场景，或填写画面描述…"></textarea>
      <label class="field-label" for="negativePrompt">负面提示词</label><textarea class="text-field" id="negativePrompt" rows="2" placeholder="lowres, bad anatomy, blurry, watermark"></textarea>
      <label class="field-label" for="drawingModel">绘图模型</label><select class="text-field" id="drawingModel">${models.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select>
      <label class="field-label" for="imageSize">画面分辨率</label><select class="text-field" id="imageSize"><option value="1216,832">横幅 · 1216 × 832</option><option value="832,1216">立绘 · 832 × 1216</option><option value="1024,1024">方形 · 1024 × 1024</option><option value="1344,768">宽屏 · 1344 × 768</option><option value="1536,1024">高清横幅 · 1536 × 1024</option><option value="custom">自定义尺寸</option></select>
      <div class="drawing-grid"><label>宽度<input class="text-field" type="number" id="imageWidth" min="64" max="2048" step="64"></label><label>高度<input class="text-field" type="number" id="imageHeight" min="64" max="2048" step="64"></label><label>步数<input class="text-field" type="number" id="imageSteps" min="1" max="50"></label><label>引导强度<input class="text-field" type="number" id="imageScale" min="0" max="10" step="0.1"></label></div>
      <label class="field-label" for="imageSeed">种子 · -1 为随机</label><input class="text-field" type="number" id="imageSeed" min="-1" max="4294967295"><button class="btn wide" id="saveDrawingParams">保存绘图参数</button>
      <div class="drawing-account"><p id="drawingAccount">尚未检测账户</p><button class="btn" id="refreshDrawingAccount">检测连接 / 刷新余额</button></div>
      <div class="drawing-quote"><strong id="imageQuote" role="status">正在计算费用…</strong><small>每次生成 1 张。预估供参考，最终扣费以服务端为准。</small></div>
      <button class="btn primary wide" id="createIllustration">生成并插入正文</button><p class="note" id="drawingStatus" role="status">图片与正文会一起保存，可导出成单个 HTML 文件。</p><div id="generationResult" class="drawing-preview"></div>`;
    el('drawingModel').insertAdjacentHTML('afterend', '<details class="studio-fold" id="bookStyleSettings"><summary>本书统一画风</summary><label class="check"><input id="bookStyleEnabled" type="checkbox">所有新插图使用同一画风</label><label class="field-label">画风预设<select id="bookStylePreset" class="text-field"><option value="custom">自定义</option><option value="anime">日系动画 · 清晰线条</option><option value="watercolor">柔和水彩</option><option value="manga">黑白漫画</option></select></label><label class="field-label">画风标签<textarea id="bookStylePrompt" class="text-field" rows="2" maxlength="2000"></textarea></label><label class="field-label">画风负面标签<textarea id="bookStyleNegative" class="text-field" rows="2" maxlength="2000"></textarea></label><button id="saveBookStyle" class="btn">保存本书画风</button><p id="bookStyleStatus" class="note">默认日系动画风格。新生图、角色试图和整书生图都会沿用；旧图可点击重绘。保持同一绘图模型更有利于统一效果。</p></details>');
    const styles={anime:{enabled:true,prompt:'anime style, clean lineart, soft cel shading, visual novel',negativePrompt:'photorealistic, 3d, oil painting, watercolor, sketch'},watercolor:{enabled:true,prompt:'watercolor (medium), soft colors, delicate lines',negativePrompt:'photorealistic, 3d, pixel art, oil painting'},manga:{enabled:true,prompt:'manga style, monochrome, greyscale, clean lineart',negativePrompt:'color, photorealistic, 3d, watercolor'}};
    let styleSignature='';
    function fillStyle(style){el('bookStyleEnabled').checked=style.enabled!==false;el('bookStylePrompt').value=style.prompt;el('bookStyleNegative').value=style.negativePrompt||'';el('bookStylePreset').value=Object.keys(styles).find(k=>styles[k].prompt===style.prompt&&styles[k].negativePrompt===style.negativePrompt)||'custom';}
    el('bookStylePreset').onchange=()=>{const style=styles[el('bookStylePreset').value];if(style)fillStyle(style);};
    for(const id of ['bookStylePrompt','bookStyleNegative'])el(id).oninput=()=>el('bookStylePreset').value='custom';
    el('saveBookStyle').onclick=async()=>{try{onState(await run('drawing.style',{storyId:getState().story.id,style:{enabled:el('bookStyleEnabled').checked,prompt:el('bookStylePrompt').value,negativePrompt:el('bookStyleNegative').value}}));sync();el('bookStyleStatus').textContent='本书画风已保存，之后的新图会统一沿用。';}catch(e){el('bookStyleStatus').textContent=e.message;}};
    characterUI=window.CharacterUI?.create({run,getState,onState,render,notify});
    function params(){return {...characterUI?.selection(),model:el('drawingModel').value,width:Number(el('imageWidth').value),height:Number(el('imageHeight').value),steps:Number(el('imageSteps').value),scale:Number(el('imageScale').value),seed:Number(el('imageSeed').value)};}
    function accountLabel(a){if(!a)return '尚未检测账户';return `连接成功 · ${['Paper','Tablet','Scroll','Opus'][Math.min(a.tier??-1,3)]||'订阅未知'} · ${a.balance==null?'余额未知':a.balance+' Anlas'}${a.usage?' · V5 额度 '+(a.usage.isNegative?'已耗尽':a.usage.percent+'%'):''}`;}
    async function quote(){const rev=++revision;if(!getState()||!el('imageWidth').value||!el('imageHeight').value)return;try{const q=await run('drawing.estimate',params());if(rev!==revision)return;el('imageQuote').textContent=q.conditionalFree?`预计免费需有 V5 额度；付费约 ${q.paid} Anlas / 张`:q.free?'预计 0 Anlas / 张 · 符合当前 Opus 条件':`预计 ${q.estimated} Anlas / 张${q.accountKnown?'':' · 未检测订阅'}${q.referenceCost?' · 含参考图附加费 '+q.referenceCost:''}`;el('createIllustration').disabled=active;}catch(e){if(rev===revision){el('imageQuote').textContent=e.message;el('createIllustration').disabled=true;}}}
    function setSizePreset(){const value=el('imageWidth').value+','+el('imageHeight').value;el('imageSize').value=[...el('imageSize').options].some(o=>o.value===value)?value:'custom';}
    let drawingSignature='',positionSignature='';
    function sync(){
      const s=getState();if(!s)return;
      const d=s.drawing||{model:models[0][0],width:1216,height:832,steps:28,scale:6,seed:-1};
      const signature=JSON.stringify(d);
      if(signature!==drawingSignature){drawingSignature=signature;for(const [id,key] of [['drawingModel','model'],['imageWidth','width'],['imageHeight','height'],['imageSteps','steps'],['imageScale','scale'],['imageSeed','seed']])el(id).value=d[key];setSizePreset();}
      const styleKey=JSON.stringify([s.story.id,s.story.drawingStyle]);if(styleKey!==styleSignature){styleSignature=styleKey;fillStyle(s.story.drawingStyle||styles.anime);}
      const storyKey=s.story.id||s.story.title;
      if(storyKey!==lastStory){lastStory=storyKey;el('promptText').value='';el('negativePrompt').value='';el('generationResult').replaceChildren();lastPlan=null;}
      const positions=JSON.stringify([storyKey,s.story.messages.map(m=>[m.id,m.name,m.text.slice(0,24)])]);if(positions!==positionSignature){positionSignature=positions;const chosen=el('imageAfter').value;el('imageAfter').replaceChildren(...s.story.messages.map((m,i)=>new Option(`${i+1}. ${m.name} · ${m.text.slice(0,24).replace(/\s/g,' ')}… 之后`,m.id)));if(s.story.messages.some(m=>m.id===chosen))el('imageAfter').value=chosen;}
      el('drawingAccount').textContent=accountLabel(s.account);
      const plan=s.story.plan||[];
      if(JSON.stringify(plan)!==lastPlan){lastPlan=JSON.stringify(plan);el('scenePlans').replaceChildren();for(const [i,scene] of plan.entries()){
        const card=document.createElement('div');card.className='scene-plan';const reason=document.createElement('p');reason.textContent=`场景 ${i+1}${scene.batch?' · 第 '+scene.batch+' 批':''} · ${scene.reason||'故事插图'}`;const choose=document.createElement('button');choose.className='btn';choose.textContent='编辑提示词 / 生成这张';choose.onclick=()=>{workflow.useScene(scene);el('drawingStatus').textContent='提示词和文字位置已填入，可以修改后生成。';document.dispatchEvent(new Event('hanama:open-prompts'));};const details=document.createElement('details'),summary=document.createElement('summary'),prompt=document.createElement('p');summary.textContent='查看这张图的提示词';prompt.textContent='固定角色：'+(scene.characterIds||[]).map(id=>s.story.characters?.find(c=>c.id===id)?.name||'已删除角色').join('、')+'\n\n'+scene.prompt+'\n\n负面提示词：'+(scene.negativePrompt||'无');details.append(summary,prompt);card.append(reason,details,choose);el('scenePlans').append(card);
      }}
      characterUI?.sync();workflow?.sync();if(active)applyBusy();quote();
    }
    let localBusy=false,remoteBusy=false;const lockedControls=new Map();
    function applyBusy(){active=localBusy||remoteBusy;if(active){document.querySelectorAll(['#paint','#studio-prompts .studio-content','#studio-planning .studio-content','#studio-parameters .studio-content','#studio-characters .studio-content'].map(root=>root+' :is(button,input,select,textarea)').join(',')).forEach(n=>{if(!lockedControls.has(n))lockedControls.set(n,n.disabled);n.disabled=true;});}else{for(const [n,disabled] of lockedControls)if(n.isConnected)n.disabled=disabled;lockedControls.clear();quote();}const consoleButton=el('openPaintConsole');if(consoleButton)consoleButton.disabled=false;}
    function setBusy(value){localBusy=value;applyBusy();}
    async function save(){const {characterIds,referenceCharacterId,characterOutfits,...p}=params();onState(await run('drawing.save',p));}
    el('saveDrawingParams').onclick=async()=>{setBusy(true);try{await save();sync();el('drawingStatus').textContent='绘图参数已保存，重启后继续使用。';}catch(e){el('drawingStatus').textContent=e.message;}finally{setBusy(false);}};
    el('imageSize').onchange=()=>{if(el('imageSize').value!=='custom'){const [w,h]=el('imageSize').value.split(',');el('imageWidth').value=w;el('imageHeight').value=h;}quote();};
    for(const id of ['drawingModel','imageWidth','imageHeight','imageSteps','imageScale','imageSeed'])el(id).oninput=()=>{setSizePreset();quote();};
    el('refreshDrawingAccount').onclick=async()=>{setBusy(true);el('drawingAccount').textContent='正在连接 NovelAI…';try{await save();onState(await run('drawing.account'));sync();}catch(e){el('drawingAccount').textContent=e.message;}finally{setBusy(false);}};
    workflow=DrawingWorkflow.create({characters:characterUI,run,getState,onState,render,notify,setBusy,params,save,sync});
    el('generateBtn').onclick=workflow.planClick;el('createIllustration').onclick=workflow.generateClick;
    api?.onBusy?.(value=>{remoteBusy=value;applyBusy();});document.addEventListener('hanama:cast-changed',quote);
    return {sync,accountLabel};
  }
  window.DrawingUI={create};
})();
