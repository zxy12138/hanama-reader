window.BookDrawingUI={create({container,run,getState,onState,onEdit,refresh}){
 const fields=['model','width','height','steps','scale','seed'];
 container.insertAdjacentHTML('beforeend',`<details class="job-details"><summary>高级 · 绘图参数与余额</summary>
 <label class="field-label">绘图模型<select class="text-field" data-job-param="model">${['5-full','5-curated','4-5-full','4-5-curated','4-full','4-curated','3','furry-3'].map(m=>`<option value="nai-diffusion-${m}">NovelAI ${m}</option>`).join('')}</select></label>
 <label class="field-label">尺寸预设<select class="text-field" data-size><option value="1216x832">横图 · 1216 × 832</option><option value="832x1216">竖图 · 832 × 1216</option><option value="1024x1024">方图 · 1024 × 1024</option><option value="1536x1024">大横图 · 1536 × 1024</option><option value="1024x1536">大竖图 · 1024 × 1536</option><option value="custom">自定义</option></select></label>
 <div class="drawing-grid">${[['width','宽度（像素）',64,2048,64],['height','高度（像素）',64,2048,64],['steps','步数',1,50,1],['scale','提示词引导强度',0,10,.1],['seed','种子（-1 随机）',-1,4294967295,1]].map(([k,label,min,max,step])=>`<label>${label}<input class="text-field" data-job-param="${k}" type="number" min="${min}" max="${max}" step="${step}"></label>`).join('')}</div>
 <p class="note">宽高为 64 的倍数，总像素不超过 3,145,728。参数随任务保存，继续任务时沿用；修改后点击开始将新建任务，已有图片保留。</p>
 <button class="btn" data-balance-refresh>检测连接 / 刷新余额</button><p data-balance role="status">余额尚未查询</p><p data-balance-error role="status"></p>
 <p class="note">余额差额来自生成前后查询；其他客户端同时消费、充值会影响差额。未知扣费不会记为 0。V5 免费额度可能在任务中耗尽，逐张费用以服务端为准。</p></details>`);
 const $=s=>container.querySelector(s);let account=null,querying=false;
 container.insertAdjacentHTML('afterbegin',`<details class="job-details"><summary>高级 · 角色、服装与画风</summary>
 <label class="check"><input type="checkbox" data-auto-characters checked>自动统一角色与服装（推荐）</label><p class="note">自动建立人物档案、记住已用服装，正文明确换装时再更换。未知外貌在后文有依据时补齐，手动设定不覆盖；远程对话人物不强行入镜。会使用大模型额度。</p>
 <label class="check"><input type="checkbox" data-job-style-enabled checked>固定本书画风</label>
 <label class="field-label">画风提示词<textarea class="text-field" data-job-style rows="3" maxlength="2000" placeholder="例如 anime style, clean lineart, soft cel shading"></textarea></label>
 <label class="field-label">画风负面词<textarea class="text-field" data-job-style-negative rows="2" maxlength="2000"></textarea></label>
 <button class="btn" data-save-job-style>保存并固定本书画风</button>
 <label class="field-label">试画内容提示词<textarea class="text-field" data-style-test-prompt rows="3" maxlength="16000" placeholder="例如 quiet garden, cherry blossoms, sunlight, no humans"></textarea></label>
 <button class="btn" data-test-job-style>按当前参数试画 1 张（可能扣费）</button><p class="note">使用下面的模型和尺寸，叠加上面的画风词。试画保存到图库，不插入正文，不推进整书任务。可收起面板等待。</p><p data-style-status role="status"></p><img data-style-result hidden alt="画风试画结果" style="max-width:100%;max-height:360px;object-fit:contain">
 </details>`);
 let testing=false,locked=false,lastInput='';
 function style(){return {enabled:$('[data-job-style-enabled]').checked,prompt:$('[data-job-style]').value,negativePrompt:$('[data-job-style-negative]').value};}
 function extra(){return {style:style(),autoCharacters:$('[data-auto-characters]').checked};}
 function edit(){const signature=JSON.stringify([value(),extra()]);if(signature===lastInput)return;lastInput=signature;onEdit();}
 for(const selector of ['[data-job-style-enabled]','[data-job-style]','[data-job-style-negative]','[data-auto-characters]'])$(selector).oninput=edit;
 $('[data-save-job-style]').onclick=async()=>{try{onState(await run('drawing.style',{storyId:getState().story.id,style:style()}));$('[data-style-status]').textContent='本书画风已保存；新任务使用此画风，已有任务续跑仍沿用原来的画风。';}catch(e){$('[data-style-status]').textContent=e.message;}};
 $('[data-test-job-style]').onclick=async()=>{if(testing)return;testing=true;$('[data-test-job-style]').disabled=true;$('[data-style-status]').textContent='正在试画，可收起面板继续阅读…';try{const result=await run('bookJob.testImage',{storyId:getState().story.id,drawing:value(),style:style(),prompt:$('[data-style-test-prompt]').value.trim()});onState(result.state);const image=result.state.gallery.find(p=>p.id===result.result.imageId);if(image){$('[data-style-result]').src=image.dataUrl;$('[data-style-result]').hidden=false;}$('[data-style-status]').textContent='试画已保存到图库。满意后可保存画风，再开始整书配图。';await refresh();}catch(e){$('[data-style-status]').textContent=e.message;}finally{testing=false;$('[data-test-job-style]').disabled=locked;$('[data-save-job-style]').disabled=locked;}};
 function value(){return Object.fromEntries(fields.map(k=>[k,k==='model'?$(`[data-job-param="${k}"]`).value:Number($(`[data-job-param="${k}"]`).value)]));}
 function preset(){const p=value(),v=p.width+'x'+p.height;$('[data-size]').value=[...$('[data-size]').options].some(o=>o.value===v)?v:'custom';}
 function fill(p,s=getState()?.story.drawingStyle,auto=true){for(const k of fields)$(`[data-job-param="${k}"]`).value=p[k]??({model:'nai-diffusion-5-full',width:1216,height:832,steps:28,scale:6,seed:-1}[k]);preset();s=s||{enabled:true,prompt:'anime style, clean lineart, soft cel shading, visual novel',negativePrompt:'photorealistic, 3d, oil painting, watercolor, sketch'};$('[data-job-style-enabled]').checked=s.enabled;$('[data-job-style]').value=s.prompt;$('[data-job-style-negative]').value=s.negativePrompt;$('[data-auto-characters]').checked=auto;lastInput=JSON.stringify([value(),extra()]);}
 function showAccount(a){account=a;const n=v=>v==null?'未知':v.toLocaleString();$('[data-balance]').textContent=a?`账户余额：${n(a.balance)} Anlas · 订阅：${a.tier==null?'未知':a.tier>=3?'Opus':a.tier===2?'Scroll':a.tier===1?'Tablet':'Paper'}${a.usage?' · V5 免费额度：'+(a.usage.isNegative?'已耗尽':n(a.usage.percent)+'%'):''} · 查询于 ${new Date(a.checkedAt).toLocaleTimeString()}`:'余额尚未查询';}
 async function check(){if(querying)return;querying=true;$('[data-balance-refresh]').disabled=true;$('[data-balance-error]').textContent='正在查询…';try{const s=await run('drawing.account');onState(s);showAccount(s.account);$('[data-balance-error]').textContent='';await refresh();}catch(e){$('[data-balance-error]').textContent='查询失败：'+e.message+(account?'；上方为上次查询结果。':'；当前余额未知。');}finally{querying=false;$('[data-balance-refresh]').disabled=locked;}}
 for(const k of fields){const field=$(`[data-job-param="${k}"]`),changed=()=>{preset();edit();};field.oninput=changed;field.onchange=changed;}
 $('[data-size]').onchange=()=>{const size=$('[data-size]').value;if(size==='custom')return;const [w,h]=size.split('x');$('[data-job-param="width"]').value=w;$('[data-job-param="height"]').value=h;edit();};
 $('[data-balance-refresh]').onclick=check;
 return {value,extra,fill,showAccount,check,disable(running,busy){locked=busy;container.querySelectorAll('input,select,textarea').forEach(n=>n.disabled=running);$('[data-test-job-style]').disabled=busy||testing;$('[data-save-job-style]').disabled=busy||testing;$('[data-balance-refresh]').disabled=busy||querying;}};
}};
