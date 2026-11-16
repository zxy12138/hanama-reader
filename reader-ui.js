window.ReaderUI = {
  create({run, onState, notify}) {
    const el=id=>document.getElementById(id), $=s=>document.querySelector(s);
    const model=window.ReaderModel, layout=window.StoryLayout, reader=el('reader'), storyNode=$('.story');
    const panelName=new URLSearchParams(location.search).get('panel'),panelWindow=!!panelName&&panelName!=='reader';
    let state, drafts=[], activeRule=0, original=false, undo=null, selected=null, restoring=false;
    let readingMode='clean';try{if(localStorage.getItem('hanama.reader.view')==='review')readingMode='review';}catch{}
    const isClean=()=>!original&&readingMode==='clean';
    el('sourceBtn').before(Object.assign(document.createElement('button'),{id:'reviewBtn',textContent:'整理视图',title:'显示屏蔽标记，可展开原文和恢复'}));
    el('readingBtn').textContent='纯净阅读';el('readingBtn').title='隐藏屏蔽内容与占位条，只看保留的正文';
    el('sourceBtn').textContent='完整原文';
    function setReadingMode(mode,resume){
      const pos=resume||capturePosition();original=mode==='source';if(!original){readingMode=mode==='review'?'review':'clean';try{localStorage.setItem('hanama.reader.view',readingMode);}catch{notify('阅读视图已切换，但本机存储不可用');}}
      hits=[];hitIndex=-1;searchedQuery=null;mouseAnchor=null;searchAnchor=null;lastPointer=null;anchorRevision++;
      el('selectionMenu').hidden=true;render(pos);document.dispatchEvent(new CustomEvent('hanama:reader-view',{detail:{mode:original?'source':readingMode}}));
    }
    let pendingPosition=null,pendingImageLocation=null,imageLocationTimer,renderingPosition=null;
    function finishImageLocation(){if(!pendingImageLocation||restoring||panelWindow)return;const id=pendingImageLocation;pendingImageLocation=null;const figure=[...storyNode.querySelectorAll('.story-picture')].find(n=>n.dataset.imageId===id);if(!figure){notify('图片已移除或位置已变化，请刷新图库');return;}storyNode.querySelectorAll('.located-picture').forEach(n=>n.classList.remove('located-picture'));figure.scrollIntoView({block:'center',behavior:'instant'});figure.classList.add('located-picture');figure.tabIndex=-1;figure.focus({preventScroll:true});clearTimeout(imageLocationTimer);imageLocationTimer=setTimeout(()=>figure.classList.remove('located-picture'),5000);savePosition();}
    document.addEventListener('hanama:reader-ready',finishImageLocation);
    document.addEventListener('hanama:workspace-visible',()=>{
      const id=state?.story.id,pos=readPosition();if(!id||!pos||pendingImageLocation||restoring&&renderingPosition)return;
      const restore=()=>{if(state?.story.id!==id||!reader.getClientRects().length||pendingImageLocation)return;const epoch=++renderEpoch;restoring=true;pendingPosition=pos;clearTimeout(saveTimer);let ticks=0,stable=0;const settle=()=>{if(epoch!==renderEpoch)return;if(!reader.getClientRects().length){pendingPosition=null;restoring=false;return;}const before=reader.scrollTop;restorePosition(pos);stable=Math.abs(before-reader.scrollTop)<1?stable+1:0;if(++ticks<12&&stable<3){requestAnimationFrame(settle);return;}pendingPosition=null;restoring=false;savePosition();bookmarkMarks.update();};requestAnimationFrame(settle);};
      if(restoring)document.addEventListener('hanama:reader-ready',restore,{once:true});else requestAnimationFrame(restore);
    });
    let hits=[], hitIndex=-1, searchedQuery=null, searchTimer, saveTimer, renderEpoch=0,lastRenderSignature='';
    let mouseAnchor=null,searchAnchor=null,anchorRevision=0,usedRevision=-1,lastPointer=null;
    let appearance;try{appearance=model.normalizeAppearance(JSON.parse(localStorage.getItem('hanama.appearance')||'{}'))}catch{appearance=model.normalizeAppearance()}
    const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const clone=value=>JSON.parse(JSON.stringify(value));
    const key=()=>state?.story.id ? 'hanama.reading.'+state.story.id : null;
    el('rules').innerHTML=`<h3>排除规则</h3><p class="desc">选中正文，直接设为起点或终点。规则应用后仍保留在这里，随时修改。</p><div id="rulesList"></div><button class="add-rule" id="newRule">＋ 添加规则</button><div class="rule-actions"><div id="ruleSummary" role="status"></div><button class="btn primary wide" id="saveRules">应用全部规则</button><button class="btn wide" id="undoRules" disabled>撤销上次应用</button><p class="note">精确文本 · 支持跨行、跨消息<br>被排除的内容可在正文展开查看，导出时移除。</p></div>`;
    $('.read-controls').insertAdjacentHTML('afterbegin','<button id="searchOpen" title="搜索正文 Ctrl+F">⌕ 搜索</button>');
    el('readingView').insertAdjacentHTML('afterbegin',`<div id="searchBar" class="search-bar" hidden><input id="searchQuery" type="search" placeholder="搜索正文…" aria-label="搜索正文"><span id="searchCount" role="status">0 / 0</span><button class="btn" id="searchPrev" aria-label="上一个结果">↑</button><button class="btn" id="searchNext" aria-label="下一个结果">↓</button><button class="btn" id="searchClose" aria-label="关闭搜索">×</button><label><input id="searchExcluded" type="checkbox">包含已排除内容</label></div>`);
    document.body.insertAdjacentHTML('beforeend',`<div id="selectionMenu" class="selection-menu" role="toolbar" aria-label="选中文本操作" hidden><span id="selectionTarget"></span><button data-selection="start">设为起点</button><button data-selection="end">设为终点</button><button data-selection="image">在本条后插图</button><button data-selection="prompt">用于画面描述</button></div>`);
    document.querySelector('[data-selection="prompt"]').textContent='将这些用于生图';
    document.querySelector('[data-selection="image"]').textContent='在选文后插入本地图片';
    el('selectionMenu').insertAdjacentHTML('beforeend','<button data-selection="hide">屏蔽选中内容</button><button data-selection="hideRepeated">屏蔽全文相同内容</button>');
    el('selectionMenu').insertAdjacentHTML('beforeend','<button data-selection="bookmark">添加书签</button>');
    const bookmarkBox=document.createElement('details');bookmarkBox.id='bookmarksBox';bookmarkBox.open=false;
    bookmarkBox.innerHTML='<summary>本书书签 <span id="bookmarkCount">0</span></summary><p class="note">选中正文即可添加；点击书签跳转。</p><div id="bookmarkList"></div>';
    $('.tools .tool-title').after(bookmarkBox);
    function jumpBookmark(item){if(!state.story.messages.some(m=>m.id===item.start.messageId)){notify('书签对应的正文已不存在');return;}view(false);const resume={messageId:item.start.messageId,rawOffset:item.start.offset,viewportY:80};const i=state.story.messages.findIndex(m=>m.id===item.start.messageId),analysis=model.analyzeMessages(state.story.messages,state.rules),hidden=layout.segments(state.story.messages[i],analysis.messages[i]).some(s=>s.hidden&&s.from<=item.start.offset&&s.to>item.start.offset);if(isClean()&&hidden){setReadingMode('review',resume);notify('书签位于已屏蔽内容，已切换到整理视图');}else render(resume);}
    const bookmarkMarks=BookmarkMarks.create({reader,storyNode,getStory:()=>state?.story,jump:jumpBookmark});
    function renderBookmarks(){
      bookmarkMarks.update();
      const list=el('bookmarkList');list.replaceChildren();const items=state?.story.bookmarks||[];el('bookmarkCount').textContent=items.length;
      if(!items.length){const empty=document.createElement('p');empty.className='note';empty.textContent='这本书还没有书签';list.append(empty);return;}
      for(const [i,item] of items.entries()){
        const row=document.createElement('div');row.className='bookmark-row';row.dataset.bookmarkId=item.id;
        const jump=document.createElement('button');jump.className='bookmark-jump';jump.textContent=item.excerpt;jump.title='跳转到书签 '+(i+1);jump.style.borderLeft='3px solid '+bookmarkMarks.color(item);jump.onclick=()=>jumpBookmark(item);

        const remove=document.createElement('button');remove.className='bookmark-remove btn';remove.textContent='×';remove.setAttribute('aria-label','删除书签 '+(i+1));remove.title='删除这个书签';remove.onclick=async()=>{remove.disabled=true;try{state=await run('bookmark.remove',{storyId:state.story.id,id:item.id});onState(state);renderBookmarks();notify('书签已删除');}catch(e){remove.disabled=false;notify(e.message);}};
        row.append(jump,remove);list.append(row);
      }
    }
    $('.read-controls').insertAdjacentHTML('beforeend','<button id="undoManualHide" disabled>撤销上次手动屏蔽</button>');
    el('undoManualHide').onclick=async()=>{try{state=await run('selection.undoHide',{storyId:state.story.id});onState(state);render();notify('已撤销上次手动屏蔽');}catch(e){notify(e.message);}};
    document.body.insertAdjacentHTML('beforeend','<div id="imageDropCaret" hidden></div><div id="imageMoveHint" hidden role="status">点击正文中的文字位置放置图片 · Esc 取消</div>');
    document.body.insertAdjacentHTML('beforeend',`<dialog id="appearanceDialog" class="appearance-dialog"><div class="dialog-heading"><h2>阅读外观</h2><button class="btn" id="appearanceClose">完成</button></div><p>即时生效，自动记住。只调整阅读区域。</p><label class="field-label" for="readSize">字号 <output id="sizeValue"></output></label><div class="size-controls"><button class="btn" id="sizeLess" aria-label="减小字号">A−</button><input type="range" id="readSize" min="12" max="36" step="1"><button class="btn" id="sizeMore" aria-label="增大字号">A＋</button></div><label class="field-label" for="readFont">字体</label><select id="readFont" class="text-field"><option value="serif">宋体 · 书卷感</option><option value="sans">微软雅黑 · 清晰</option><option value="kai">楷体 · 手写感</option></select><div class="appearance-colors"><label for="readColor">字体颜色<input id="readColor" type="color"></label><label for="readBackground">纸张颜色<input id="readBackground" type="color"></label></div><div class="chips"><button class="chip" data-theme="paper">奶油白</button><button class="chip" data-theme="sakura">樱花粉</button><button class="chip" data-theme="night">夜间阅读</button></div><label class="field-label" for="readLineHeight">行距 <output id="lineValue"></output></label><input type="range" id="readLineHeight" min="1.4" max="2.6" step="0.1"><div class="appearance-preview">春风翻过书页，故事仍在继续。<br>在舒适的颜色与行距中，慢慢读下去。</div><button class="btn wide" id="appearanceReset">恢复默认外观</button></dialog>`);
    el('searchBar').insertAdjacentHTML('beforeend','<span id="searchOrigin" class="search-origin">从鼠标所在的正文位置向下搜索</span>');
    el('appearanceReset').before(Object.assign(document.createElement('div'),{className:'page-width-option',innerHTML:'<label class="check"><input type="checkbox" id="editPageWidth">开启拖动调整页面宽度</label><p>开启后拖动正文页面的左右边缘，保存后锁定。窗口较小时自动适配。</p>'}));
    const paper=$('.paper'),widthShell=document.createElement('div');widthShell.className='reading-width-shell';paper.before(widthShell);widthShell.append(paper);
    const widthBar=document.createElement('div');widthBar.className='page-width-bar';widthBar.hidden=true;widthBar.innerHTML='<span>拖动左右粉色边缘，文字会自动换行</span><button class="btn primary" id="savePageWidth">保存并锁定</button><button class="btn" id="cancelPageWidth">取消</button>';widthShell.before(widthBar);
    let editingWidth=false,draftWidth=null,widthDrag=null;
    function setWidth(width){if(width==null)document.documentElement.style.removeProperty('--reading-page-width');else document.documentElement.style.setProperty('--reading-page-width',width+'px');}
    function finishWidth(save){if(!editingWidth)return;const pos=capturePosition();if(save){const next={...appearance,pageWidth:Math.round(draftWidth)};try{localStorage.setItem('hanama.appearance',JSON.stringify(next));appearance=next;}catch{notify('宽度尚未保存，请重试');return;}}editingWidth=false;widthDrag=null;el('editPageWidth').checked=false;widthBar.hidden=true;widthShell.classList.remove('width-editing');widthShell.querySelectorAll('.reading-width-edge').forEach(n=>n.hidden=true);setWidth(appearance.pageWidth);restorePosition(pos);savePosition();if(save)notify('页面宽度已保存并锁定');}
    function previewWidth(width){if(!editingWidth)return;const pos=capturePosition(),style=getComputedStyle(reader),available=reader.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);draftWidth=Math.round(Math.max(Math.min(240,available),Math.min(available,width)));setWidth(draftWidth);restorePosition(pos);}
    for(const side of ['left','right']){const handle=document.createElement('button');handle.type='button';handle.className='reading-width-edge '+side;handle.hidden=true;handle.setAttribute('aria-label',side==='left'?'拖动左边缘调整页面宽度':'拖动右边缘调整页面宽度');handle.innerHTML='<span aria-hidden="true">⋮</span>';widthShell.append(handle);
      handle.onpointerdown=e=>{if(!editingWidth||e.button!==0)return;e.preventDefault();widthDrag={pointer:e.pointerId,x:e.clientX,width:widthShell.getBoundingClientRect().width,side};handle.setPointerCapture(e.pointerId);};
      handle.onpointermove=e=>{if(!widthDrag||widthDrag.pointer!==e.pointerId)return;previewWidth(widthDrag.width+(e.clientX-widthDrag.x)*(side==='right'?2:-2));};
      handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=()=>{widthDrag=null;};
      handle.onkeydown=e=>{if(editingWidth&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();previewWidth(widthShell.getBoundingClientRect().width+(e.key==='ArrowRight'?1:-1)*(side==='right'?1:-1)*10);}};
    }
    el('editPageWidth').onchange=()=>{if(!el('editPageWidth').checked){finishWidth(false);return;}const pos=capturePosition();closeSearch();view(false);draftWidth=widthShell.getBoundingClientRect().width;editingWidth=true;widthBar.hidden=false;widthShell.classList.add('width-editing');widthShell.querySelectorAll('.reading-width-edge').forEach(n=>n.hidden=false);el('appearanceDialog').close();restorePosition(pos);};
    el('savePageWidth').onclick=()=>finishWidth(true);el('cancelPageWidth').onclick=()=>finishWidth(false);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&editingWidth)finishWidth(false);});
    function applyAppearance(persist=true) {
      const pos=capturePosition();appearance=model.normalizeAppearance(appearance);
      const fonts={serif:'"Noto Serif SC",SimSun,serif',sans:'"Microsoft YaHei","PingFang SC",sans-serif',kai:'KaiTi,STKaiti,serif'};
      document.documentElement.style.setProperty('--reading-size',appearance.size+'px');document.documentElement.style.setProperty('--reading-color',appearance.color);document.documentElement.style.setProperty('--reading-paper',appearance.background);document.documentElement.style.setProperty('--reading-font',fonts[appearance.font]);document.documentElement.style.setProperty('--reading-line',appearance.lineHeight);
      setWidth(editingWidth?draftWidth:appearance.pageWidth);
      el('readSize').value=appearance.size;el('sizeValue').textContent=appearance.size+' px';el('readFont').value=appearance.font;el('readColor').value=appearance.color;el('readBackground').value=appearance.background;el('readLineHeight').value=appearance.lineHeight;el('lineValue').textContent=appearance.lineHeight.toFixed(1);
      restorePosition(pos);savePosition();
      if(persist)try{localStorage.setItem('hanama.appearance',JSON.stringify(appearance))}catch{notify('外观已应用，但本机存储不可用，未能保存')}
    }
    for(const [id,field] of [['readSize','size'],['readFont','font'],['readColor','color'],['readBackground','background'],['readLineHeight','lineHeight']])el(id).oninput=()=>{appearance[field]=el(id).value;applyAppearance()};
    el('sizeLess').onclick=()=>{appearance.size-=1;applyAppearance()};el('sizeMore').onclick=()=>{appearance.size+=1;applyAppearance()};
    el('appearanceReset').onclick=()=>{finishWidth(false);appearance={...model.appearanceDefaults};applyAppearance()};
    el('appearanceClose').onclick=()=>el('appearanceDialog').close();
    document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{const themes={paper:['#584550','#fffdfb'],sakura:['#684456','#fff2f6'],night:['#e5d9e3','#29232d']};[appearance.color,appearance.background]=themes[b.dataset.theme];applyAppearance()});
    applyAppearance(false);
    el('rulesList').insertAdjacentHTML('beforebegin','<label class="check"><input type="checkbox" id="useGlobalRules">本书启用通用规则</label><label class="field-label" for="rulesScope">编辑哪一组规则</label><select class="text-field" id="rulesScope"><option value="book">本书独立规则</option><option value="global">通用规则</option></select><p class="desc" id="rulesScopeNote">只影响当前这本书。</p>');
    const editingRules=s=>el('rulesScope').value==='global'?(s?.globalRules||[]):(s?.bookRules??s?.rules??[]);
    el('rulesScope').onchange=()=>{drafts=clone(editingRules(state));undo=null;el('undoRules').disabled=true;activeRule=0;el('rulesScopeNote').textContent=el('rulesScope').value==='global'?'保存后影响所有启用了通用规则的书。':'只影响当前这本书。';renderRules();};
    el('useGlobalRules').onchange=async()=>{el('useGlobalRules').disabled=true;try{const next=await run('rules.toggle',{storyId:state.story.id,enabled:el('useGlobalRules').checked});state=next;onState(state);render();markDirty();}catch(e){el('useGlobalRules').checked=!!state.useGlobalRules;notify(e.message);}finally{el('useGlobalRules').disabled=false;}};
    function markDirty() {
      const dirty=JSON.stringify(drafts)!==JSON.stringify(editingRules(state));
      el('ruleSummary').textContent=dirty?'有未应用的修改':summary();
      el('saveRules').textContent=dirty?'应用全部规则 · 有修改':'应用全部规则';
      document.querySelectorAll('.editable-rule').forEach((card,i)=>{
        card.classList.toggle('editing',i===activeRule);
        const stats=model.analyzeMessages(state?.story.messages||[],[drafts[i]]).stats[0];
        const r=drafts[i],applied=JSON.stringify(r)===JSON.stringify(editingRules(state)[i]);
        card.querySelector('.rule-status').textContent=!r.start||!r.end?'请设置起点和终点':!r.enabled?'已停用'+(applied?'':' · 待应用'):`${applied?'已应用':'待应用'} · 匹配 ${stats.matches} 处${stats.unclosed?' · 有起点未找到终点':''}`;
      });
    }
    function summary(){const a=model.analyzeMessages(state?.story.messages||[],state?.rules||[]);return state?.story.messages.length?`已应用 · 匹配 ${a.matches} 处，排除 ${a.hiddenChars} 字`:'请先导入故事，规则会保留在这里';}
    function renderRules() {
      el('rulesList').replaceChildren();
      drafts.forEach((r,i)=>{
        const card=document.createElement('div');card.className='rule-card editable-rule';
        card.innerHTML=`<div class="rule-head"><b>规则 ${i+1}</b><label class="check"><input class="enabled" type="checkbox" ${r.enabled?'checked':''}>启用</label><button class="btn remove-rule" aria-label="删除规则 ${i+1}">×</button></div><label class="field-label">起始文本<textarea class="text-field rule-start" rows="2" placeholder="选中正文后点「设为起点」">${escape(r.start)}</textarea></label><label class="field-label">结束文本<textarea class="text-field rule-end" rows="2" placeholder="选中正文后点「设为终点」">${escape(r.end)}</textarea></label><label class="check"><input class="bounds" type="checkbox" ${r.includeBounds?'checked':''}>同时排除起点和终点文字</label><div class="rule-status" role="status"></div><button class="btn locate-rule">定位匹配内容</button>`;
        card.addEventListener('focusin',()=>{activeRule=i;markDirty();});
        card.addEventListener('click',()=>{activeRule=i;markDirty();});
        card.querySelector('.remove-rule').onclick=event=>{event.stopPropagation();drafts.splice(i,1);activeRule=Math.min(activeRule,Math.max(0,drafts.length-1));renderRules();};
        for(const [selector,field,checkbox] of [['.rule-start','start'],['.rule-end','end'],['.enabled','enabled',true],['.bounds','includeBounds',true]])card.querySelector(selector).addEventListener('input',event=>{drafts[i][field]=checkbox?event.target.checked:event.target.value;markDirty();});
        card.querySelector('.locate-rule').onclick=()=>{original=true;render();openSearch();el('searchExcluded').checked=true;el('searchQuery').value=model.normalize(r.start);search(true);};
        el('rulesList').append(card);
      });
      if(!drafts.length)el('rulesList').innerHTML='<p class="desc">暂无规则。点击添加，或选中正文设置起点。</p>';
      markDirty();
    }
    el('newRule').onclick=()=>{drafts.push({start:'',end:'',enabled:true,includeBounds:true});activeRule=drafts.length-1;renderRules();el('rulesList').lastElementChild.scrollIntoView({block:'nearest'});};
    async function apply(next,isUndo=false) {
      if(next.some(r=>!r.start||!r.end)){notify('请先补齐每条规则的起点和终点；不用的空规则可以删除');return;}
      el('saveRules').disabled=true;el('undoRules').disabled=true;
      const previous=clone(editingRules(state));
      try {
        const result=el('rulesScope').value==='global'?{state:await run('rules.global',{rules:next})}:await run('tool',{name:'set_rules',arguments:{rules:next,storyId:state.story.id}});
        state=result.state;onState(state);drafts=clone(editingRules(state));undo=isUndo?null:previous;original=false;
        renderRules();render();notify(summary());
      }catch(e){notify(e.message)}finally{el('saveRules').disabled=false;el('undoRules').disabled=!undo;}
    }
    el('saveRules').onclick=()=>apply(clone(drafts));el('undoRules').onclick=()=>undo&&apply(clone(undo),true);
    function capturePosition() {
      const blocks=storyNode.children;if(panelWindow||!blocks.length||!blocks[0].classList.contains('message-block')||el('readingView').hidden||reader.getBoundingClientRect().height<=0||storyNode.getBoundingClientRect().width<=0)return null;
      const top=reader.getBoundingClientRect().top+8;
      // Messages are vertically ordered; do not measure every earlier message on scroll.
      let lo=0,hi=blocks.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(blocks[mid].getBoundingClientRect().bottom>top)hi=mid;else lo=mid+1;}const block=blocks[lo],rect=block.getBoundingClientRect();
      const pos={messageId:block.dataset.id,offset:(top-rect.top)/Math.max(1,rect.height),scrollTop:reader.scrollTop,original,readingMode,updated:Date.now()};
      const bounds=block.querySelector('.message-text').getBoundingClientRect();
      for(const y of [top+2,top+24,top+48]){const point=textPoint(Math.max(bounds.left+4,reader.getBoundingClientRect().left+8),y);if(point&&point.messageId===pos.messageId){pos.rawOffset=point.offset;pos.viewportY=point.rect.top-reader.getBoundingClientRect().top;break;}}
      return pos;
    }
    function savePosition() {if(panelWindow||restoring||!key())return;clearTimeout(saveTimer);const pos=capturePosition();if(pos){try{localStorage.setItem(key(),JSON.stringify(pos));}catch{} const block=[...storyNode.children].find(n=>n.dataset.id===pos.messageId);$('.reading-footer span').textContent=`已记住阅读位置 · 第 ${Number(block?.dataset.messageIndex??0)+1} 条`;}}
    window.flushReadingPosition=savePosition;
    function readPosition() {try{return JSON.parse(localStorage.getItem(key())||'null')}catch{return null}}
    function restorePosition(pos) {
      if(panelWindow||!pos||el('readingView').hidden||!reader.getClientRects().length)return;
      let block=[...storyNode.children].find(b=>b.dataset.id===pos.messageId),rawOffset=pos.rawOffset;
      // In clean reading a whole message can disappear. Restore at the closest
      // remaining message instead of reusing an unrelated absolute scrollTop.
      if(!block&&isClean()&&pos.messageId){const index=state.story.messages.findIndex(m=>m.id===pos.messageId),visible=[...storyNode.querySelectorAll('.message-block')];block=visible.find(n=>Number(n.dataset.messageIndex)>=index)||visible.at(-1);if(block){rawOffset=Number(block.querySelector('.text-segment')?.dataset.rawStart)||0;}}
      if(block&&Number.isInteger(pos.rawOffset)){
        const rect=positionRect(block,rawOffset);
        if(rect){reader.scrollTo({top:Math.max(0,reader.scrollTop+rect.top-reader.getBoundingClientRect().top-(pos.viewportY??8)),behavior:'instant'});return;}
      }
      // Restoring must finish synchronously: CSS smooth scrolling used to save
      // an intermediate position back over the saved bookmark.
      const top=block ? reader.scrollTop+block.getBoundingClientRect().top-reader.getBoundingClientRect().top-8+Number(pos.offset||0)*block.getBoundingClientRect().height : Number(pos.scrollTop||0);
      reader.scrollTo({top:Number.isFinite(top)?Math.max(0,top):0,behavior:'instant'});
    }
    function positionRect(block,offset){
      const segments=[...block.querySelectorAll('.text-segment')];
      let segment=segments.find(s=>Number(s.dataset.rawStart)<=offset&&Number(s.dataset.rawEnd)>offset);
      if(!segment&&isClean()){segment=segments.find(s=>Number(s.dataset.rawStart)>=offset)||segments.at(-1);if(segment)offset=Math.max(Number(segment.dataset.rawStart),Math.min(Number(segment.dataset.rawEnd),offset));}
      if(!segment)segment=segments.find(s=>Number(s.dataset.rawEnd)===offset);
      if(!segment)return null;
      const folded=segment.closest('details:not([open])');if(folded)return folded.querySelector('summary').getBoundingClientRect();
      // Materialize only the target chunk, including text split by search marks.
      segment.getBoundingClientRect();let left=offset-Number(segment.dataset.rawStart);
      const walker=document.createTreeWalker(segment,NodeFilter.SHOW_TEXT);let node;
      while(node=walker.nextNode()){if(left<=node.length){const range=document.createRange();range.setStart(node,left);range.collapse(true);return range.getBoundingClientRect();}left-=node.length;}
      return segment.getBoundingClientRect();
    }
    reader.addEventListener('scroll',()=>{el('selectionMenu').hidden=true;clearTimeout(saveTimer);saveTimer=setTimeout(savePosition,180)},{passive:true});
    window.addEventListener('beforeunload',savePosition);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)savePosition()});
    function render(resume) {
      if(!state)return;
      if(panelWindow)return;
      const signature=JSON.stringify([state.story.id,state.story.contentRevision,state.story.messages.map(m=>[m.id,m.text.length]),state.rules,state.story.images.map(p=>[p.id,p.pending,p.offset,p.afterId,p.deletedAt]),original,readingMode]);
      if(!resume&&signature===lastRenderSignature)return;lastRenderSignature=signature;
      const pos=resume||pendingPosition||capturePosition(),epoch=++renderEpoch;renderingPosition=pos;restoring=true;clearTimeout(saveTimer);if(resume)view(false);document.body.classList.remove('source-mode');
      const mode=original?'source':readingMode;reader.dataset.readingMode=mode;
      for(const [id,value] of [['readingBtn','clean'],['reviewBtn','review'],['sourceBtn','source']]){el(id).classList.toggle('on',mode===value);el(id).setAttribute('aria-pressed',String(mode===value));}
      el('sourceBtn').textContent='完整原文';el('readingBtn').textContent='纯净阅读';
      el('searchExcluded').disabled=isClean();if(isClean())el('searchExcluded').checked=false;
      el('searchExcluded').parentElement.title=isClean()?'切换到整理视图后可搜索已屏蔽内容':'';
      const {story}=state,analysis=model.analyzeMessages(story.messages,state.rules);
        el('undoManualHide').disabled=!story.manualHideHistory?.length;
      el('chapterTitle').textContent=story.messages.length?story.title:'从一段对话开始';
      el('progress').textContent=`${story.messages.length} 条消息`;
      el('exportName').value=story.title;
      $('.story-heading p').textContent=original?'完整原文 · 所有屏蔽仍然保留，导出不包含屏蔽内容':isClean()?'纯净阅读 · 已屏蔽的内容与标记不显示':'整理视图 · 点击屏蔽标记可展开原文或恢复正文';
      $('.story-heading .eyebrow').textContent='YOUR STORY';
      $('.crumb b').textContent=story.title;
      $('.chapters').replaceChildren();el('nextChapter').hidden=true;
      storyNode.innerHTML=story.messages.map((m,i)=>{
        const pieces=layout.flow(m,analysis.messages[i],story.images||[],original);
        if(isClean()&&!pieces.some(s=>s.type==='image'||(!s.hidden&&s.text.trim())))return '';
        const body=pieces.map(s=>{
          // Do not create hidden text nodes for clean reading. Large excluded
          // chapters must not inflate layout, accessibility or search work.
          if(s.hidden&&isClean())return '';
          if(s.type==='image'){const p=s.image;if(!(/^(?:hanama-image:\/\/asset\/[^\s]+|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(p.dataUrl)))return '';return `<figure class="story-picture" data-image-id="${escape(p.id||'')}"><img draggable="true" loading="lazy" decoding="async" width="${Number(p.width)||1216}" height="${Number(p.height)||832}" class="story-image" src="${p.dataUrl}" alt="${escape(p.caption||'插图')}"><figcaption><span draggable="true" class="image-grip">⠿ 拖动图片到任意文字后</span><button class="btn image-reposition">点选新位置</button></figcaption></figure>`;}
          const span=()=>`<span class="text-segment${s.hidden?' excluded-segment':''}" data-raw-start="${s.from}" data-raw-end="${s.to}">${escape(s.text)}</span>`;
          if(!s.hidden){if(s.text.length<=4000)return span();const chunks=[];for(let at=0;at<s.text.length;){let end=layout.offset(s.text,Math.min(at+4000,s.text.length));const newline=s.text.lastIndexOf('\n',end-1);if(newline>at+2000)end=newline+1;chunks.push(`<div class="reading-chunk"><span class="text-segment" data-raw-start="${s.from+at}" data-raw-end="${s.from+end}">${escape(s.text.slice(at,end))}</span></div>`);at=end;}return '<div class="reading-run">'+chunks.join('')+'</div>';}
          let content;
          if(s.text.length>6000){const chunks=[];for(let at=0;at<s.text.length;){let end=layout.offset(s.text,Math.min(at+4000,s.text.length));const newline=s.text.lastIndexOf('\n',end-1);if(newline>at+2000)end=newline+1;chunks.push(`<div class="excluded-chunk"><span class="text-segment excluded-segment" data-raw-start="${s.from+at}" data-raw-end="${s.from+end}">${escape(s.text.slice(at,end))}</span></div>`);at=end;}content=`<div class="excluded-scroll-note">内容较长，可在此区域滚动查看全部原文</div><div class="excluded-body" tabindex="0" aria-label="屏蔽的完整原文">${chunks.join('')}</div>`;}
          else content=span();
          return `<details class="excluded-text" data-characters="${s.text.length}"><summary>已排除 ${s.hiddenChars??s.text.length} 字 · ${s.rules.length?'规则 '+s.rules.map(n=>n+1).join('、'):'手动屏蔽 / AI 优化 / 去重'} · 展开查看 <button class="btn restore-excluded" data-from="${s.from}" data-to="${s.to}">恢复这段正文</button></summary>${content}</details>`;
        }).join('');
        return `<section class="message-block" data-id="${escape(m.id)}" data-message-index="${i}"><div class="speaker ${m.isUser?'you':''}">${escape(m.name)}</div><div class="dialogue message-text">${body}</div><div class="insert-line"><button class="local-insert">＋ 在本条之后插图</button></div></section>`;
      }).join('')||(story.messages.length?'<p class="empty-reader">本书正文已全部屏蔽。<br>切换「整理视图」可查看屏蔽内容、恢复或撤销。</p>':'<p class="empty-reader">点击右上角「导入对话」，开始阅读。<br>选中文字即可设置规则、插入图片或填写画面描述。</p>');
      [...storyNode.children].forEach(block=>{block.querySelectorAll('.text-segment').forEach((segment,j)=>segment.dataset.segmentIndex=j);});
      storyNode.querySelectorAll('.restore-excluded').forEach(b=>b.onclick=async e=>{e.preventDefault();e.stopPropagation();b.disabled=true;try{state=await run('selection.restore',{storyId:state.story.id,messageId:b.closest('.message-block').dataset.id,from:Number(b.dataset.from),to:Number(b.dataset.to)});onState(state);render();notify('这段已恢复为正文并保存，其他屏蔽不变');}catch(error){b.disabled=false;notify(error.message);}});
      storyNode.querySelectorAll('.local-insert').forEach(b=>b.onclick=()=>insertImage(b.closest('.message-block').dataset.id));
      storyNode.querySelectorAll('.image-reposition').forEach(b=>b.onclick=()=>beginMove(b.closest('.story-picture').dataset.imageId));
      storyNode.querySelectorAll('.story-picture').forEach(figure=>{const edit=()=>document.dispatchEvent(new CustomEvent('hanama:edit-image',{detail:{imageId:figure.dataset.imageId}}));const img=figure.querySelector('img');img.onclick=edit;img.tabIndex=0;img.setAttribute('role','button');img.title='点击编辑提示词 / 重绘';img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();edit();}};const quick=document.createElement('button');quick.className='btn';quick.textContent='重绘';quick.dataset.quickRedraw=figure.dataset.imageId;quick.title='沿用本图设定、随机种子重绘，成功后原位替换；调用 NovelAI，可能扣费';quick.onclick=()=>document.dispatchEvent(new CustomEvent('hanama:quick-redraw',{detail:{imageId:figure.dataset.imageId}}));figure.querySelector('figcaption').append(quick);const editor=document.createElement('button');editor.className='btn';editor.textContent='调整提示词';editor.onclick=edit;figure.querySelector('figcaption').append(editor);const button=document.createElement('button');button.className='btn image-remove';button.textContent='移除正文';button.title='只移除这里的插入，图片保留在图库';button.onclick=async()=>{try{state=await run('image.remove',{storyId:state.story.id,imageId:figure.dataset.imageId});onState(state);render();notify('已从正文移除，原图仍在图库');}catch(e){notify(e.message);}};figure.querySelector('figcaption').append(button);});
      let settleFrames=0,stableFrames=0;const finish=()=>{if(epoch!==renderEpoch)return;const before=reader.scrollTop;restorePosition(pos);stableFrames=Math.abs(before-reader.scrollTop)<1?stableFrames+1:0;if(++settleFrames<12&&stableFrames<3){requestAnimationFrame(finish);return;}pendingPosition=null;renderingPosition=null;restoring=false;savePosition();bookmarkMarks.paint();if(!el('searchBar').hidden)search(false);window.StartupUI?.ready();document.dispatchEvent(new Event('hanama:reader-ready'));};
      window.StartupUI?.stage(90,'正在恢复阅读位置');requestAnimationFrame(finish);
    }
    async function insertImage(id,offset) {try{const result=await run('tool',{name:'insert_image',arguments:{afterId:id,offset,storyId:state.story.id}});state=result.state;onState(state);render()}catch(e){notify(e.message)}}
    el('readingBtn').onclick=()=>setReadingMode('clean');el('reviewBtn').onclick=()=>setReadingMode('review');el('sourceBtn').onclick=()=>setReadingMode('source');
    el('readNav').onclick=el('resumeBtn').onclick=()=>{view(false);restorePosition(readPosition())};
    el('libraryNav').onclick=()=>{finishWidth(false);savePosition();view(true);};
    el('fontBtn').textContent='Aa 外观';el('fontBtn').title='字号、颜色与阅读外观';el('fontBtn').setAttribute('aria-label','阅读外观设置');el('fontBtn').onclick=()=>{savePosition();el('appearanceDialog').showModal();};
    document.addEventListener('pointerup',()=>setTimeout(()=>{
      if(movingImage||draggingImage)return;const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
      const range=selection.getRangeAt(0),start=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement,end=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;
      if(!start.closest('.message-text')||!end.closest('.message-text'))return;
      const startAnchor=rangeAnchor(range.startContainer,range.startOffset),endAnchor=rangeAnchor(range.endContainer,range.endOffset);if(!startAnchor||!endAnchor)return;
      const messages=state.story.messages,startIndex=messages.findIndex(m=>m.id===startAnchor.messageId),endIndex=messages.findIndex(m=>m.id===endAnchor.messageId);
      const text=messages.slice(startIndex,endIndex+1).map((m,i)=>model.normalize(m.text).slice(i===0?startAnchor.offset:0,i===endIndex-startIndex?endAnchor.offset:undefined)).join('\n');if(!text.trim())return;
      selected={text,storyId:state.story.id,afterId:endAnchor.messageId,offset:endAnchor.offset,start:startAnchor,end:endAnchor};
      const rect=range.getBoundingClientRect(),menu=el('selectionMenu');menu.hidden=false;el('selectionTarget').textContent=`规则 ${activeRule+1}`;
      menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(rect.bottom+8,innerHeight-menu.offsetHeight-8))+'px';
    },0));
    el('selectionMenu').onpointerdown=e=>e.preventDefault();
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('#selectionMenu'))el('selectionMenu').hidden=true});
    el('selectionMenu').onclick=async event=>{
      const action=event.target.dataset.selection;if(!action||!selected)return;
      if(action==='hideRepeated'){const selection={...selected},position=capturePosition();el('selectionMenu').hidden=true;try{const review=await run('selection.repeats',{storyId:selection.storyId,start:selection.start,end:selection.end}),ids=await window.reviewRepeatedSelection(review);if(!ids)return;pendingPosition=position;const result=await run('selection.hideRepeated',{storyId:selection.storyId,token:review.token,ids});state=result.state;onState(state);window.getSelection()?.removeAllRanges();selected=null;original=false;render();notify('已屏蔽 '+result.matches+' 处相同内容，可整体撤销');}catch(e){pendingPosition=null;notify(e.message);}return;}
      if(action==='bookmark'){const selection={...selected};el('selectionMenu').hidden=true;try{state=await run('bookmark.add',{storyId:selection.storyId,start:selection.start,end:selection.end});onState(state);renderBookmarks();bookmarkBox.open=true;notify('书签已保存，点击滚动条旁的彩色标记即可跳转');}catch(e){notify(e.message);}return;}
      if(action==='hide'){const selection={...selected};const block=[...storyNode.children].find(b=>b.dataset.id===selection.start.messageId),rect=block&&positionRect(block,selection.start.offset),bounds=reader.getBoundingClientRect();pendingPosition={messageId:selection.start.messageId,rawOffset:selection.start.offset,viewportY:Math.max(8,Math.min(bounds.height-48,(rect?.top??bounds.top+8)-bounds.top))};el('selectionMenu').hidden=true;try{const result=await run('selection.hide',{storyId:selection.storyId,start:selection.start,end:selection.end});state=result.state;onState(state);window.getSelection()?.removeAllRanges();selected=null;original=false;render();notify(`已屏蔽选中的 ${result.count} 字，可展开原文或撤销`);}catch(e){pendingPosition=null;notify(e.message);}return;}
      if(action==='start'||action==='end') {
        if(!drafts[activeRule]){drafts.push({start:'',end:'',enabled:true,includeBounds:true});activeRule=drafts.length-1;}
        drafts[activeRule][action]=selected.text;panel('rules');renderRules();
        el('rulesList').children[activeRule].scrollIntoView({block:'nearest'});notify(`已填入规则 ${activeRule+1} 的${action==='start'?'起点':'终点'}，设置完成后点「应用全部规则」`);
      } else if(action==='image')await insertImage(selected.afterId,selected.offset);
      else if(action==='prompt'){panel('paint');document.dispatchEvent(new CustomEvent('hanama:illustration-selection',{detail:{...selected,storyId:state.story.id}}));notify('选文已放入素材框，点击「自动拆分画面并生成提示词」');}
      el('selectionMenu').hidden=true;
    };
    function rangeAnchor(node,at){
      const element=node.nodeType===1?node:node.parentElement,segment=element?.closest('.text-segment');if(!segment||!storyNode.contains(segment))return null;
      const prefix=document.createRange();prefix.selectNodeContents(segment);try{prefix.setEnd(node,at);}catch{return null;}
      return {messageId:segment.closest('.message-block').dataset.id,offset:Number(segment.dataset.rawStart)+prefix.toString().length};
    }
    let movingImage=null,draggingImage=null,dropPoint=null,scrollFrame=0,dragPointer=null;
    function textPoint(x,y){
      const range=document.caretRangeFromPoint(x,y);if(!range)return null;const a=rangeAnchor(range.startContainer,range.startOffset);if(!a)return null;
      const segment=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement).closest('.text-segment');if(!segment.getClientRects().length||segment.closest('details:not([open])'))return null;
      const rect=range.getBoundingClientRect();return {...a,rect};
    }
    function showDrop(x,y){dropPoint=textPoint(x,y);const caret=el('imageDropCaret');caret.hidden=!dropPoint;if(dropPoint){const r=dropPoint.rect;caret.style.left=r.left+'px';caret.style.top=r.top+'px';caret.style.height=Math.max(20,r.height)+'px';}}
    function endMove(){movingImage=null;draggingImage=null;dropPoint=null;dragPointer=null;cancelAnimationFrame(scrollFrame);scrollFrame=0;el('imageDropCaret').hidden=true;el('imageMoveHint').hidden=true;storyNode.classList.remove('picking-image-position');}
    function beginMove(id){endMove();movingImage=id;el('selectionMenu').hidden=true;el('imageMoveHint').textContent='点击正文中的文字位置放置图片 · Esc 取消';el('imageMoveHint').hidden=false;storyNode.classList.add('picking-image-position');}
    async function moveImage(id,position){try{const next=await run('image.move',{storyId:state.story.id,imageId:id,position:{messageId:position.messageId,offset:position.offset}});state=next;onState(state);render();document.dispatchEvent(new CustomEvent('hanama:image-moved'));notify('图片已移动到文字位置并保存');}catch(e){notify(e.message);}}
    document.addEventListener('hanama:pick-image-position',e=>{if(e.detail.storyId!==state?.story.id)return;view(false);beginMove(e.detail.imageId);});
    document.addEventListener('hanama:pick-insertion',()=>{view(false);beginMove('__insertion__');});
    storyNode.addEventListener('pointermove',e=>{if(movingImage)showDrop(e.clientX,e.clientY);});
    storyNode.addEventListener('click',e=>{if(!movingImage||e.target.closest('button,figure'))return;const point=textPoint(e.clientX,e.clientY);if(!point)return;e.preventDefault();const id=movingImage;endMove();if(id==='__insertion__')document.dispatchEvent(new CustomEvent('hanama:insertion-selected',{detail:{messageId:point.messageId,offset:point.offset}}));else moveImage(id,point);});
    document.addEventListener('dragstart',e=>{
      const figure=e.target.closest('.story-picture,[data-preview-image]');if(!figure)return;const id=figure.dataset.imageId||figure.dataset.previewImage;if(!id)return;draggingImage=id;dragPointer=null;e.dataTransfer.setData('application/x-hanama-image',JSON.stringify({imageId:id,storyId:state.story.id}));e.dataTransfer.effectAllowed='move';el('selectionMenu').hidden=true;el('imageMoveHint').hidden=false;el('imageMoveHint').textContent='拖到文字间松开即可移动 · 靠近阅读区域边缘可自动滚动';
    });
    function autoScroll(){if(!draggingImage||!dragPointer)return;const r=reader.getBoundingClientRect(),y=dragPointer.y;const speed=y<r.top+65?-14:y>r.bottom-65?14:0;if(speed){reader.scrollTop+=speed;showDrop(dragPointer.x,y);}scrollFrame=requestAnimationFrame(autoScroll);}
    reader.addEventListener('dragover',e=>{if(!draggingImage&&!e.dataTransfer.types.includes('application/x-hanama-image'))return;e.preventDefault();draggingImage||='__external__';e.dataTransfer.dropEffect='move';dragPointer={x:e.clientX,y:e.clientY};showDrop(e.clientX,e.clientY);if(!scrollFrame)scrollFrame=requestAnimationFrame(autoScroll);});
    reader.addEventListener('dragleave',e=>{if(reader.contains(e.relatedTarget))return;dragPointer=null;cancelAnimationFrame(scrollFrame);scrollFrame=0;el('imageDropCaret').hidden=true;});
    reader.addEventListener('drop',e=>{if(!draggingImage&&!e.dataTransfer.types.includes('application/x-hanama-image'))return;e.preventDefault();let payload;try{payload=JSON.parse(e.dataTransfer.getData('application/x-hanama-image'));}catch{}const point=textPoint(e.clientX,e.clientY),id=payload?.imageId||draggingImage;endMove();scrollFrame=0;if(payload?.storyId&&payload.storyId!==state.story.id){notify('故事已切换，请重新从图库拖动');return;}if(point&&id&&id!=='__external__')moveImage(id,point);else notify('请把图片放在正文文字之间');});
    document.addEventListener('dragend',()=>{endMove();scrollFrame=0;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){endMove();scrollFrame=0;}});
    function clearMarks(){bookmarkMarks.paint();storyNode.querySelectorAll('mark.search-hit').forEach(mark=>mark.replaceWith(document.createTextNode(mark.textContent)));storyNode.querySelectorAll('.text-segment').forEach(n=>n.normalize());}
    function pointAnchor(x,y) {
      const range=document.caretRangeFromPoint(x,y);if(!range)return null;
      const node=range.startContainer,parent=node.nodeType===1?node:node.parentElement;
      const segment=parent.closest('.text-segment'),block=segment?.closest('.message-block');if(!block||!storyNode.contains(block))return null;
      const prefix=document.createRange();prefix.selectNodeContents(segment);try{prefix.setEnd(node,range.startOffset)}catch{return null}
      return {messageIndex:Number(block.dataset.messageIndex),segmentIndex:Number(segment.dataset.segmentIndex),offset:prefix.toString().length,messageId:block.dataset.id};
    }
    function viewportAnchor() {
      const rect=reader.getBoundingClientRect(),bar=el('searchBar');const y=rect.top+(bar.hidden?12:bar.offsetHeight+16);
      const visible=[...storyNode.querySelectorAll('.text-segment')].find(n=>n.getClientRects().length&&n.getBoundingClientRect().bottom>=y);
      if(!visible)return {messageIndex:0,segmentIndex:0,offset:0};
      const r=visible.getBoundingClientRect(),point=pointAnchor(r.left+1,Math.max(r.top+1,y));
      const block=visible.closest('.message-block');return point||{messageIndex:Number(block.dataset.messageIndex),segmentIndex:[...block.querySelectorAll('.text-segment')].indexOf(visible),offset:0};
    }
    function rememberPointer(e){
      if(!e.target.closest('.message-text'))return;
      // Never perform caret hit testing, layout reads or text copies per mouse move.
      lastPointer={x:e.clientX,y:e.clientY};
      if(el('searchBar').hidden)anchorRevision++;
      else if(e.type==='pointerdown'){mouseAnchor=pointAnchor(e.clientX,e.clientY);searchAnchor=mouseAnchor||currentAnchor();anchorRevision++;el('searchOrigin').textContent='已更新起点，下次从点击的正文位置查找';}
    }
    storyNode.addEventListener('pointermove',rememberPointer);storyNode.addEventListener('pointerdown',rememberPointer);
    // Search-result scrolling must never change the user's chosen search origin.
    function currentAnchor(){
      if(lastPointer&&document.elementFromPoint(lastPointer.x,lastPointer.y)?.closest('.message-text')){const anchor=pointAnchor(lastPointer.x,lastPointer.y);if(anchor){mouseAnchor=anchor;return anchor;}}
      if(mouseAnchor){const b=[...storyNode.children].find(n=>n.dataset.id===mouseAnchor.messageId),r=b?.getBoundingClientRect(),v=reader.getBoundingClientRect();if(r&&r.bottom>v.top&&r.top<v.bottom)return mouseAnchor;}
      return viewportAnchor();
    }
    function openSearch(){view(false);searchAnchor=currentAnchor();usedRevision=anchorRevision;el('searchBar').hidden=false;el('searchQuery').focus({preventScroll:true});el('searchQuery').select();el('searchOrigin').textContent='从鼠标所在的正文位置向下搜索；点击正文可更换起点';if(el('searchQuery').value)search();}
    function closeSearch(){clearTimeout(searchTimer);el('searchBar').hidden=true;clearMarks();hits=[];hitIndex=-1;el('selectionMenu').hidden=true;}
    function search(jump=true) {
      const previous=hits[hitIndex]?{...hits[hitIndex].location}:null;
      clearMarks();hits=[];hitIndex=-1;
      const q=el('searchQuery').value;searchedQuery=q;
      if(q){const groups=[],seen=new Set();storyNode.querySelectorAll('.text-segment').forEach(node=>{
        if(node.classList.contains('excluded-segment')&&(isClean()||!el('searchExcluded').checked))return;
        const group=(isClean()?node.closest('.message-text'):node.closest('.excluded-body,.reading-run'))||node;if(seen.has(group))return;seen.add(group);groups.push(group);
      });for(const group of groups){
        // Search the original continuous text, including words crossing a layout chunk.
        const nodes=group.classList.contains('text-segment')?[group]:[...group.querySelectorAll('.text-segment')];
        const texts=nodes.map(n=>n.textContent),matches=model.findMatches(texts.join(''),q);if(!matches.length)continue;
        const parts=matches.map(()=>[]);let base=0,matchIndex=0;
        nodes.forEach((node,i)=>{const text=texts[i],end=base+text.length;let last=0,j=matchIndex;const fragment=document.createDocumentFragment();
          while(j<matches.length&&matches[j].start<end){const hit=matches[j],start=Math.max(0,hit.start-base),stop=Math.min(text.length,hit.end-base);
            fragment.append(document.createTextNode(text.slice(last,start)));const mark=document.createElement('mark');mark.className='search-hit';mark.textContent=text.slice(start,stop);mark.location={messageIndex:Number(node.closest('.message-block').dataset.messageIndex),segmentIndex:Number(node.dataset.segmentIndex),start,end:stop};fragment.append(mark);parts[j].push(mark);last=stop;if(hit.end>end)break;j++;
          }
          if(last){fragment.append(document.createTextNode(text.slice(last)));node.replaceChildren(fragment);}matchIndex=j;base=end;
        });
        for(const marks of parts){marks[0].parts=marks;hits.push(marks[0]);}
      }}
      el('searchCount').textContent=hits.length?`0 / ${hits.length}`:q?'未找到':'0 / 0';
      if(jump&&hits.length){if(anchorRevision!==usedRevision&&el('searchBar').hidden)searchAnchor=currentAnchor();const found=model.searchFromAnchor(hits.map(h=>h.location),searchAnchor||currentAnchor());showHit(found.index,found.wrapped);usedRevision=anchorRevision;}
      else if(previous){const i=hits.findIndex(h=>JSON.stringify(h.location)===JSON.stringify(previous));if(i>=0){hitIndex=i;hits[i].parts.forEach(mark=>mark.classList.add('current'));el('searchCount').textContent=`${i+1} / ${hits.length}`;}}
    }
    function showHit(index,wrapped=false){hits[hitIndex]?.parts.forEach(mark=>mark.classList.remove('current'));hitIndex=index;const mark=hits[index];if(!mark)return;mark.closest('details')?.setAttribute('open','');mark.parts.forEach(part=>part.classList.add('current'));mark.scrollIntoView({block:'center'});el('searchCount').textContent=`${index+1} / ${hits.length}`;el('searchOrigin').textContent=wrapped?'已越过边界，循环查找':'从正文位置查找 · 点击正文可更换起点';savePosition();}
    function nextHit(direction){
      clearTimeout(searchTimer);if(searchedQuery!==el('searchQuery').value){search();return;}
      if(!hits.length)return;
      if(anchorRevision!==usedRevision||hitIndex<0){searchAnchor=searchAnchor||currentAnchor();const found=model.searchFromAnchor(hits.map(h=>h.location),searchAnchor,direction);showHit(found.index,found.wrapped);usedRevision=anchorRevision;return;}
      const next=hitIndex+direction;showHit((next+hits.length)%hits.length,next<0||next>=hits.length);
    }
    el('searchOpen').onclick=openSearch;el('searchClose').onclick=closeSearch;
    el('searchQuery').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search(),120)};
    el('searchExcluded').onchange=()=>search();el('searchNext').onclick=()=>nextHit(1);el('searchPrev').onclick=()=>nextHit(-1);
    el('searchQuery').onkeydown=e=>{if(e.key==='Enter'){if(e.isComposing)return;e.preventDefault();clearTimeout(searchTimer);if(!hits.length||searchedQuery!==el('searchQuery').value)search();else nextHit(e.shiftKey?-1:1)}};
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&!document.querySelector('dialog[open]')){e.preventDefault();openSearch()}if(e.key==='Escape'){closeSearch();el('selectionMenu').hidden=true;}});
    return {
      locateImage(id){if(panelWindow)return;view(false);pendingImageLocation=id;finishImageLocation();},
      update(next){
        const changed=state?.story.id!==next.story.id, rulesChanged=JSON.stringify(editingRules(state))!==JSON.stringify(editingRules(next));
        if(changed){pendingPosition=null;finishWidth(false);}
        savePosition();state=next;el('useGlobalRules').checked=!!state.useGlobalRules;if(changed){el('rulesScope').value='book';el('rulesScopeNote').textContent='只影响当前这本书。';}if(changed||rulesChanged||!drafts.length){drafts=clone(editingRules(state));activeRule=0;renderRules();}
        let resume;if(changed){endMove();undo=null;mouseAnchor=null;lastPointer=null;searchAnchor=null;el('undoRules').disabled=true;resume=readPosition()||{scrollTop:0};original=!!resume.original;}
        renderBookmarks();render(resume);
      }, savePosition
    };
  }
};
