(() => {
  const api = window.hanama;
  const el = id => document.getElementById(id);
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state;
  document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="desktop-ui.css">');
  const links = document.createElement('div');
  links.innerHTML = '<button class="nav" id="assistantNav"><span>✧</span>AI 助手</button><button class="nav" id="settingsNav"><span>⚙</span>模型与设置</button>';
  document.querySelector('.side-label').before(links);
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="settingsDialog" class="large-dialog"><div class="dialog-heading"><div><div class="eyebrow">PREFERENCES</div><h2>让 AI 成为你的创作伙伴</h2></div><button class="btn" id="settingsClose">关闭</button></div>
    <p>连接 OpenAI 兼容服务。全局提示词会用于助手对话与自动插图规划。</p>
    <label class="field-label" for="baseUrl">Base URL（包含 /v1 等服务要求的路径）</label><input class="text-field" id="baseUrl" placeholder="https://你的服务地址/v1">
    <label class="field-label" for="apiKey">API Key</label><input class="text-field" type="password" id="apiKey" autocomplete="off" placeholder="仅保存在本机系统加密存储中">
    <label class="check"><input type="checkbox" id="clearKey">清除已保存的密钥</label>
    <div class="setting-row"><div><label class="field-label" for="modelSelect">当前模型</label><select class="text-field" id="modelSelect"><option value="">请先获取模型列表</option></select></div><button class="btn" id="fetchModels">保存连接并获取模型</button></div>
    <label class="field-label" for="manualModel">手动指定模型（服务不支持模型列表时填写）</label><input class="text-field" id="manualModel" placeholder="优先使用这里填写的模型 ID">
    <label class="field-label" for="globalPrompt">全局提示词</label><textarea class="text-field" id="globalPrompt" rows="5" style="font-family:inherit"></textarea>
    <button class="btn" id="testModel">保存并检测模型连接</button>
    <div class="rule-card"><div class="rule-head">NovelAI 绘图连接</div><label class="field-label" for="naiUrl">绘图服务地址</label><input class="text-field" id="naiUrl" placeholder="https://image.novelai.net"><label class="field-label" for="naiKey">NovelAI API Token</label><input class="text-field" id="naiKey" type="password" autocomplete="off" placeholder="留空保留本机加密凭据"><label class="check"><input type="checkbox" id="clearNaiKey">清除绘图 Token</label><button class="btn" id="testNai">保存并检测绘图连接 / 余额</button><p id="naiStatus" role="status">尚未检测</p></div>
    <div class="rule-card"><div class="rule-head">助手的工作文件夹<button class="btn" id="chooseFolder">选择文件夹</button><button class="btn" id="clearFolder" disabled>清除授权</button></div><small id="rootPath">尚未授权</small><p>默认不授权任何目录。选择后助手可列出这里的文件；发送文件内容给模型前会询问。清除授权不会删除文件。</p></div>
    <p id="settingsStatus" role="status"></p><div class="dialog-actions"><button class="btn primary" id="saveSettings">保存设置</button></div></dialog>
    <dialog id="assistantDialog" class="large-dialog assistant-dialog"><div class="dialog-heading"><div><div class="eyebrow">YOUR STORY COMPANION</div><h2>花间助手</h2></div><button class="btn" id="assistantClose">关闭</button></div><p id="assistantStatus">连接模型后，可以用自然语言操作故事和本地文件。</p>
    <div class="chips"><button class="chip quick">帮我分析当前故事，规划适合插图的位置</button><button class="chip quick">列出工作文件夹里的文件</button><button class="chip quick">把当前故事导出成 HTML</button></div>
    <div class="chat-log" id="chatLog" role="log"><div class="chat-bubble bot">你好，我可以整理对话、设置排除规则、规划和生成 NovelAI 插图，也能帮你从工作文件夹中找到并导入故事。<br>执行外部命令或由助手发起绘图时，会展示具体内容供你确认。</div></div>
    <div class="chat-compose"><textarea class="text-field" id="chatInput" rows="3" placeholder="例如：从工作文件夹导入聊天.jsonl，并隐藏 &lt;think&gt; 之间的内容"></textarea><button class="btn primary" id="sendChat">发送</button></div><div class="dialog-actions" style="margin-top:10px"><button class="btn" id="clearChat">清空对话</button></div></dialog>`);
  async function run(action, args) {
    if (!api) throw Error('请通过 npm start 启动桌面应用；浏览器中仅展示界面');
    return api.invoke(action, args);
  }
  const report = e => toast(e.message || String(e));
  const savedCredential = {apiKey:false,naiKey:false};
  for(const id of Object.keys(savedCredential)){
    const row=document.createElement('div');row.className='credential-state';
    const status=document.createElement('span');status.id=id+'State';status.setAttribute('role','status');
    const change=document.createElement('button');change.className='btn';change.id=id+'Change';change.textContent='更换密钥';
    change.onclick=()=>{savedCredential[id]=false;el(id).readOnly=false;el(id).value='';status.textContent='填写新密钥后保存；留空保留原配置';el(id).focus();};
    row.append(status,change);el(id).after(row);
  }
  function syncCredentials(){
    for(const [id,hasKey] of [['apiKey',state?.config?.hasKey],['naiKey',state?.drawing?.hasKey]]){
      savedCredential[id]=!!hasKey;el(id).readOnly=!!hasKey;el(id).value=hasKey?'••••••••••••••••':'';
      el(id+'State').textContent=hasKey?'✓ 已配置，可直接使用，无需再次输入':'尚未配置';el(id+'Change').hidden=!hasKey;
    }
  }
  const credentialValue=id=>savedCredential[id]?'':el(id).value;
  const localUI=LocalModelUI.create({run,getState:()=>state,onState:s=>{state=s;renderStory();},notify:toast});
  function showSettings() {
    const c = state?.config;
    if (c) { el('baseUrl').value = c.baseUrl; el('globalPrompt').value = c.globalPrompt; el('apiKey').placeholder = c.hasKey ? '已保存密钥；留空则保留' : '输入 API Key'; el('manualModel').value = c.model; if(c.model){if(![...el('modelSelect').options].some(o=>o.value===c.model))el('modelSelect').add(new Option(c.model,c.model));el('modelSelect').value=c.model;} }
    el('rootPath').textContent = state?.root || '尚未授权';
    el('clearFolder').disabled = !state?.root;
    el('naiUrl').value=state?.drawing?.baseUrl||'https://image.novelai.net';el('naiKey').placeholder=state?.drawing?.hasKey?'已保存 Token；留空保留':'输入 NovelAI API Token';
    el('naiStatus').textContent=drawingUI?.accountLabel(state?.account)||'尚未检测';
    el('settingsStatus').textContent=(state?.configurationIssues||[]).join('\n');
    syncCredentials();
    localUI.fill();
    el('settingsDialog').showModal();
  }
  el('settingsNav').onclick = showSettings;
  el('settingsClose').onclick = () => el('settingsDialog').close();
  el('assistantNav').onclick = () => { const c=state?.config,model=c?.provider==='local'?c.local?.model:c?.model;el('assistantStatus').textContent = model ? `当前模型：${model} · ${c.provider==='local'?'本地推理':'在线服务'} · 工具调用结果会显示在对话中` : '请先在「模型与设置」中配置服务与模型'; el('assistantDialog').showModal(); };
  el('assistantClose').onclick = () => el('assistantDialog').close();
  async function saveSettings() {
    const clearing=[el('clearKey').checked?'大模型密钥':null,el('clearNaiKey').checked?'NovelAI 绘图密钥':null].filter(Boolean);
    if(clearing.length&&!window.confirm('确认清除 '+clearing.join(' 和 ')+'？\n清除后将无法使用对应服务，需要重新填写密钥。其他连接不会被清除。')){el('clearKey').checked=false;el('clearNaiKey').checked=false;throw Error('已取消清除，原连接设置保留');}
    state = await run('settings.save', { provider:localUI.provider(),local:localUI.value(),baseUrl: el('baseUrl').value, apiKey: credentialValue('apiKey'), clearKey: el('clearKey').checked, model: el('manualModel').value.trim() || el('modelSelect').value, globalPrompt: el('globalPrompt').value, drawing:{baseUrl:el('naiUrl').value.trim()||'https://image.novelai.net',apiKey:credentialValue('naiKey'),clearKey:el('clearNaiKey').checked} });
    el('naiKey').value='';el('clearNaiKey').checked=false;drawingUI?.sync();
    el('apiKey').value = ''; el('clearKey').checked = false; el('settingsStatus').textContent = '设置已保存到本机。';
    syncCredentials();
  }
  el('saveSettings').onclick = async () => { try { await saveSettings(); toast('已保存模型与全局提示词'); } catch(e) { el('settingsStatus').textContent = e.message; } };
  el('fetchModels').onclick = async () => {
    el('fetchModels').disabled = true; el('settingsStatus').textContent = '正在连接模型服务…';
    try { await saveSettings(); const models = await run('models'); el('modelSelect').replaceChildren(...models.map(id => new Option(id, id))); if (models.includes(state.config.model)) el('modelSelect').value = state.config.model; el('settingsStatus').textContent = `已获取 ${models.length} 个模型，请选择并保存。`; }
    catch(e) { el('settingsStatus').textContent = e.message; } finally { el('fetchModels').disabled = false; }
  };
  el('modelSelect').onchange = () => { el('manualModel').value = ''; };
  el('testModel').onclick=async()=>{el('testModel').disabled=true;try{await saveSettings();el('settingsStatus').textContent='正在检测与场景识别相同的流式请求…';const result=await run('model.test');el('settingsStatus').textContent=`连接成功 · ${result.model} 已返回有效响应（场景识别同一路径）`;}catch(e){el('settingsStatus').textContent=e.message;}finally{el('testModel').disabled=false;}};
  el('testNai').onclick=async()=>{el('testNai').disabled=true;el('naiStatus').textContent='正在检测…';try{await saveSettings();state=await run('drawing.account');el('naiStatus').textContent=drawingUI.accountLabel(state.account);drawingUI.sync();}catch(e){el('naiStatus').textContent=e.message;}finally{el('testNai').disabled=false;}};
  el('chooseFolder').onclick = async () => { try { state = await run('folder'); el('rootPath').textContent = state.root || '尚未授权';el('clearFolder').disabled=!state.root; } catch(e) { report(e); } };
  el('clearFolder').onclick = async () => { el('clearFolder').disabled=true;try { state=await run('folder.clear');el('rootPath').textContent=state.root||'尚未授权';toast('已清除助手文件夹授权，原文件未删除'); } catch(e){report(e);}finally{el('clearFolder').disabled=!state?.root;} };
  function addBubble(text, type) { const node = document.createElement('div'); node.className = 'chat-bubble ' + type; node.textContent = text; el('chatLog').append(node); node.scrollIntoView({block:'nearest'}); }
  document.querySelectorAll('.quick').forEach(b => b.onclick = () => { el('chatInput').value = b.textContent; });
  el('sendChat').onclick = async () => {
    const text = el('chatInput').value.trim(); if (!text) return;
    el('sendChat').disabled = true; el('clearChat').disabled = true; addBubble(text, 'user'); el('chatInput').value = ''; el('assistantStatus').textContent = '正在思考与执行工具…';
    try { const result = await run('chat', {text}); for (const t of result.trace) addBubble(`${t.success ? '✓' : '×'} ${t.tool}`, 'trace'); addBubble(result.text, 'bot'); state = result.state; renderStory(); }
    catch(e) { addBubble(e.message, 'error'); }
    finally { el('sendChat').disabled = false; el('clearChat').disabled = false; el('assistantStatus').textContent = '操作结束 · 请查看对话结果'; }
  };
  el('clearChat').onclick = async () => { try { await run('chat.clear'); el('chatLog').replaceChildren(); } catch(e) { report(e); } };
  let readerUI,drawingUI,workbenchUI,bookFilesUI,bookJobsUI,bookCoverUI,appShell,readerSignature='';
  function renderStory() {const key=JSON.stringify([state.story.id,state.story.contentRevision,state.story.bookmarks,state.rules,state.bookRules,state.globalRules,state.useGlobalRules,state.story.images.map(i=>[i.id,i.afterId,i.offset,i.pending,i.deletedAt])]);if(key!==readerSignature){readerSignature=key;readerUI?.update(state);}drawingUI?.sync();workbenchUI?.update();bookJobsUI?.update();bookCoverUI?.update();appShell?.update();}
  if (!api) return;
  ConsoleUI.create({run,api,notify:toast});
  ImageEditorUI.create({run,getState:()=>state,onState:s=>{state=s},render:renderStory,notify:toast});
  document.querySelector('.demo').textContent = '桌面开发版 · 本地工作空间';
  document.querySelector('.prototype').textContent = 'v0.2';
  document.querySelector('.profile small').textContent = '桌面开发版';
  document.querySelector('.session-box').innerHTML='<span>♧</span><div><strong>本地工作空间</strong>当前故事与规则自动保存在本机。支持插入本地图片并导出为一个 HTML 文件。</div>';
  readerUI=ReaderUI.create({run,onState:s=>{state=s},notify:toast});
  const importStory=()=>bookFilesUI.choose();
  ['importTop','importSide','libraryImport'].forEach(id=>el(id).onclick=importStory);
  drawingUI=DrawingUI.create({run,api,getState:()=>state,onState:s=>{state=s},render:renderStory,notify:toast});
  workbenchUI=WorkbenchUI.create({run,api,getState:()=>state,onState:s=>{state=s},render:renderStory,notify:toast});
  bookFilesUI=BookFilesUI.create({run,getState:()=>state,onState:s=>{state=s},render:renderStory,notify:toast});
  bookJobsUI=window.BookJobsUI?.create({run,api,getState:()=>state,onState:s=>{state=s},render:renderStory,notify:toast});
  bookCoverUI=window.BookCoverUI?.create({run,getState:()=>state,onState:s=>{state=s},render:renderStory,notify:toast});
  appShell=window.AppShellUI?.create({run,api,getState:()=>state,onState:s=>{state=s},render:renderStory,bookJobsUI,workbenchUI,notify:toast});
  if(appShell)appShell.workspace=workbenchUI.enableWorkspace?.({host:appShell.workspaceHost,readerNode:appShell.readerNode,taskNode:appShell.taskNode,onReveal:()=>appShell.show('read')});
  document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="reader-views.css"><link rel="stylesheet" href="book-cover-ui.css"><link rel="stylesheet" href="workbench-layout.css"><link rel="stylesheet" href="app-shell.css">');
  api.onState?.(s=>{state=s;renderStory();});
  api.onImageLocation?.(value=>{state=value.state;renderStory();readerUI.locateImage(value.imageId);});
  api.onPick?.(value=>document.dispatchEvent(new CustomEvent(value.imageId?'hanama:pick-image-position':'hanama:pick-insertion',{detail:value})));
  api.onSelection?.(value=>document.dispatchEvent(new CustomEvent('hanama:illustration-selection',{detail:value})));
  document.addEventListener('hanama:illustration-selection',e=>{if(!e.detail.remote)run('selection.send',e.detail).catch(report);});
  document.querySelectorAll('dialog').forEach(dialog=>{let outsideDown=false;const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};dialog.addEventListener('pointerdown',e=>{outsideDown=e.target===dialog&&outside(e)});dialog.addEventListener('pointerup',e=>{if(outsideDown&&e.target===dialog&&outside(e))dialog.close();outsideDown=false;});});
  el('exportPreview').textContent='导出 HTML 文件';
  document.querySelector('#export .note').textContent='当前已实现单文件 HTML 导出；EPUB / PDF 待开发。';
  document.querySelectorAll('input[name=format]').forEach(r=>{r.disabled=r.value!=='HTML'});
  el('exportName').disabled=true;
  document.querySelectorAll('#export input[type=checkbox]').forEach(c=>c.disabled=true);
  el('exportPreview').onclick=async()=>{try{const result=await run('tool',{name:'export_story'});if(result.result.saved)toast('故事已导出到 '+result.result.saved)}catch(e){report(e)}};
  window.StartupUI?.stage(30,'正在读取上次保存的书籍');
  requestAnimationFrame(()=>setTimeout(()=>run('state').then(async s=>{state=s;window.StartupUI?.stage(65,'正在排版正文与恢复阅读位置');renderStory();if(new URLSearchParams(location.search).has('panel'))window.StartupUI?.ready();}).catch(e=>{window.StartupUI?.fail(e);report(e);}),0));
})();
