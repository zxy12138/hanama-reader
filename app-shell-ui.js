window.AppShellUI={create({run,api,getState,onState,render,bookJobsUI,workbenchUI,notify}){
 if(new URLSearchParams(location.search).has('panel'))return null;
 const $=id=>document.getElementById(id),app=document.querySelector('.app'),reader=$('reader');
 document.body.classList.add('app-redesigned');
 const main=document.createElement('div');main.id='appPages';app.append(main);
 const readHost=document.createElement('section');readHost.id='readingWorkspaceHost';readHost.setAttribute('aria-label','阅读工作区');
 const library=document.createElement('section');library.id='libraryPage';library.className='app-page';library.hidden=true;library.append($('libraryView'));
 const automation=document.createElement('section');automation.id='automationPage';automation.className='app-page';automation.hidden=true;
 main.append(readHost,library,automation);readHost.append(reader);
 const dialog=$('bookJobsDialog');automation.append(dialog);dialog.classList.add('inline-automation');
 const workflow=document.createElement('div');workflow.className='automation-workflow-tabs';workflow.innerHTML='<button class="btn primary" data-workflow="draw">一键配图</button><button class="btn" data-workflow="clean">整理正文</button><button class="btn" id="singleDrawingEntry">选文 / 单张配图</button>';dialog.before(workflow);
 const allTasks=document.createElement('section');allTasks.id='allBookTasks';allTasks.innerHTML='<h2>所有书籍的任务</h2><p class="all-tasks-note">选择任务查看进度，继续时沿用原设置。切书不会停止正在运行的任务。</p><div id="allBookTaskList"></div>';workflow.before(allTasks);
 const cardClean=$('runCleanJob').closest('.book-job-card'),cardDraw=$('runDrawJob').closest('.book-job-card');cardClean.dataset.jobKind='clean';cardDraw.dataset.jobKind='draw';
 const setupIds=new Set(['bookJobCharsRow','drawDraftHint']);
 const alwaysIds=new Set(['drawJobProgress','drawJobStatus','runDrawJob','resetDrawJob','resumeOriginalDraw','discardDrawChanges','uncertainImage','skipTextJob']);
 for(const node of [...cardDraw.children])if(!alwaysIds.has(node.id)&&(!['H3','PROGRESS'].includes(node.tagName))){node.classList.add('job-setup-control');}
 for(const id of setupIds)$(id)?.classList.add('job-setup-control');
 const currentTask=document.createElement('button');currentTask.className='btn primary wide';currentTask.id='viewCurrentTask';currentTask.textContent='查看当前任务';$('runDrawJob').before(currentTask);currentTask.onclick=()=>show('tasks');
 const cleanTask=document.createElement('button');cleanTask.id='viewCleanTask';cleanTask.className='btn primary wide';cleanTask.textContent='查看整理任务';$('runCleanJob').before(cleanTask);cleanTask.onclick=()=>show('tasks');
 const taskCost=document.createElement('p');taskCost.className='task-billing-summary';$('drawJobStatus').after(taskCost);
 const cleanSetup=document.createElement('button');cleanSetup.className='btn wide task-clean-setup';cleanSetup.textContent='设置正文整理';cardClean.append(cleanSetup);cleanSetup.onclick=()=>{flow='clean';show('studio');};
 const consoleDetails=document.createElement('details');consoleDetails.id='taskConsoleDetails';consoleDetails.innerHTML='<summary>模型返回与错误详情 <span id="taskLogCount"></span></summary>';consoleDetails.append($('modelConsole'));automation.append(consoleDetails);
 $('modelConsole').hidden=false;
 const tasksNav=document.createElement('button');tasksNav.id='tasksNav';tasksNav.className='nav';tasksNav.innerHTML='<span>◷</span>后台任务';
 const studioNav=$('bookJobsNav');studioNav.innerHTML='<span>✧</span>配图工作台';studioNav.after(tasksNav);
 const sidebar=document.querySelector('.sidebar');$('readNav').after(studioNav,tasksNav);
 const bottom=document.querySelector('.side-bottom');bottom.replaceChildren($('assistantNav'),$('settingsNav'));
 $('settingsNav').innerHTML='<span>⚙</span>设置与连接';
 for(const id of ['consoleNav','galleryNav','tagLibraryNav'])$(id).hidden=true;
 const more=document.createElement('details');more.className='shell-tools-menu';more.innerHTML='<summary>更多工具</summary><div><button class="btn" data-open="gallery">图库</button><button class="btn" data-open="characters">角色档案</button><button class="btn" data-open="tags">本地词库</button><button class="btn" data-open="rules">屏蔽规则</button><button class="btn" data-open="export">导出图文</button></div>';
 document.querySelector('.top-actions').prepend(more);more.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{show('read');const id=b.dataset.open;if(['rules','export'].includes(id))panel(id);else workbenchUI.open(id);more.open=false;});
 const crumb=document.querySelector('.crumb');crumb.innerHTML='<div><small id="shellBreadcrumb">花间序 / 阅读工作区</small><h1 id="shellPageTitle">正在阅读</h1></div>';
 document.querySelector('.demo').hidden=true;
 // ReaderUI updates .crumb b with the current book, so retain its hook outside the new heading.
 const bookTitle=document.createElement('b');bookTitle.className='shell-current-book';crumb.append(bookTitle);
 $('importTop').textContent='导入书籍';$('exportTop').hidden=true;
 const footer=document.createElement('footer');footer.className='shell-footer';footer.innerHTML='<div id="shellSave"></div><button class="btn" id="shellTaskStatus">暂无后台任务 · 查看任务</button>';app.append(footer);$('shellSave').append($('saveIndicator'));$('shellTaskStatus').onclick=()=>show('tasks');
 const taskPanel=document.createElement('div');taskPanel.id='workspaceTaskSummary';taskPanel.innerHTML='<span class="shell-pill" id="workspaceTaskState">暂无运行任务</span><h3 id="workspaceTaskTitle">后台任务</h3><progress id="workspaceTaskProgress" max="1" value="0"></progress><p id="workspaceTaskText">任务进度、继续与失败处理集中在任务页。</p><button class="btn primary" id="workspaceTaskOpen">打开任务</button>';
 taskPanel.querySelector('button').onclick=()=>show('tasks');
 let route='read',flow='draw',activeJob=null,taskListKey='',switchingTask=false;const liveJobs=new Map();
 const originalView=view;
 view=library=>show(library?'library':'read');
 function refreshAllTasks(state){
  const books=new Map((state.books||[]).map(b=>[b.id,b]));books.set(state.story.id,{id:state.story.id,title:state.story.title,bookJobs:state.story.bookJobs});
  const own=bookJobsUI.snapshot?.()||{};
  const rows=[];for(const b of books.values())for(const kind of ['draw','clean']){const j=b.id===state.story.id?own[kind]:(liveJobs.get(b.id+':'+kind)||b.bookJobs?.[kind]);if(j)rows.push({bookId:b.id,title:b.title,kind,id:j.id,status:j.status,cursor:j.cursor||0,total:j.total??j.units?.length??0,error:j.error||''});}
  rows.sort((a,b)=>(a.status==='completed')-(b.status==='completed')||(b.status==='running')-(a.status==='running'));
  const key=JSON.stringify([state.story.id,rows]);if(key===taskListKey)return;taskListKey=key;
  const list=$('allBookTaskList');list.replaceChildren();
  if(!rows.length){const empty=document.createElement('p');empty.textContent='还没有任务。前往配图工作台设置范围与画风，或选择整理正文。';list.append(empty);return;}
  for(const row of rows){const item=document.createElement('article');item.className='all-book-task';item.dataset.taskStoryId=row.bookId;item.dataset.taskKind=row.kind;const info=document.createElement('div'),title=document.createElement('b'),text=document.createElement('p');title.textContent=row.title+' · '+(row.kind==='draw'?'一键配图':'正文整理');text.textContent=({running:'正在处理',paused:'已暂停',failed:'等待处理',completed:'已完成'}[row.status]||'已保存')+' · '+row.cursor+' / '+row.total+(row.error?' · '+row.error:'');info.append(title,text);const open=document.createElement('button');open.className='btn';open.textContent=row.bookId===state.story.id?'查看本书任务':'查看任务';open.onclick=async()=>{if(switchingTask)return;switchingTask=true;open.disabled=true;try{if(getState().story.id!==row.bookId){window.flushReadingPosition?.();await window.flushDrawingDraft?.();onState(await run('story.switch',{id:row.bookId}));render();}show('tasks');requestAnimationFrame(()=>$(row.kind==='draw'?'drawJobStatus':'cleanJobStatus').scrollIntoView({block:'center'}));}catch(e){notify(e.message);}finally{switchingTask=false;open.disabled=false;}};item.append(info,open);list.append(item);}
 }
 function refreshStatus(){
  const state=getState();if(!state)return;
  refreshAllTasks(state);
  const snapshot=bookJobsUI.snapshot?.()||{},job=snapshot.draw||state.story.bookJobs?.draw;
  const hasOld=!!job,hasDraft=!!snapshot.draftDraw;
  const billed=job?.billing;taskCost.hidden=!billed;taskCost.textContent=billed?`账户余额减少：${billed.total||0} Anlas · ${billed.known||0} 张已核对，${billed.unknown||0} 张未知。其他客户端消费或充值可能影响差额，以服务账单为准。`:'';
  automation.classList.toggle('has-draw-job',hasOld);automation.classList.toggle('has-draw-draft',hasDraft);
  automation.classList.toggle('has-clean-job',!!snapshot.clean);cleanTask.hidden=!snapshot.clean||route!=='studio';
  currentTask.hidden=!hasOld||hasDraft||route!=='studio';
  const active=state.activeBookJob||activeJob,local=active&&active.storyId!==state.story.id?null:(snapshot[active?.kind]||state.story.bookJobs?.[active?.kind]);
  const progress=local?`${local.cursor||0} / ${local.total??local.units?.length??0}`:'';
  const any=state.busy||!!active;
  $('shellTaskStatus').textContent=any?(active?'正在'+(active.kind==='draw'?'配图':'整理')+(progress?' · '+progress:'')+' · 查看任务':'后台处理中 · 查看详情'):hasOld&&job.status!=='completed'?'配图任务已保存 · 继续 / 处理':'任务与模型返回 →';
  taskPanel.querySelector('#workspaceTaskState').textContent=any?'处理中':hasOld?({completed:'已完成',failed:'等待处理',paused:'已暂停'}[job.status]||'可继续'):'暂无任务';
  taskPanel.querySelector('#workspaceTaskTitle').textContent=active?.storyId&&active.storyId!==state.story.id?'其他书籍的后台任务':state.story.title;
  taskPanel.querySelector('#workspaceTaskText').textContent=progress?progress+' · 完成结果逐步保存':'关闭面板不会停止任务。暂停、继续和错误原因在任务页查看。';
  const bar=taskPanel.querySelector('progress');bar.max=local?.total??local?.units?.length??1;bar.value=local?.cursor||0;
 }
 function show(next){
  if(!['read','library','studio','tasks'].includes(next))return;
  if(route==='read')window.flushReadingPosition?.();
  if(next!=='read'){document.body.classList.remove('focus-mode');$('focusBtn').textContent='⛶';}
  route=next;document.body.dataset.appView=next;window.appShell?.workspace?.setVisible(next==='read');
  readHost.hidden=next!=='read';library.hidden=next!=='library';automation.hidden=!['studio','tasks'].includes(next);
  $('readingView').hidden=next!=='read';$('libraryView').hidden=next!=='library';
  for(const [id,key] of [['readNav','read'],['libraryNav','library'],['bookJobsNav','studio'],['tasksNav','tasks']])$(id).classList.toggle('active',next===key);
  const titles={read:'正在阅读',library:'我的书架',studio:'配图工作台',tasks:'后台任务'};
  $('shellPageTitle').textContent=titles[next];$('shellBreadcrumb').textContent='花间序 / '+(next==='read'?'阅读工作区':titles[next]);
  automation.dataset.view=next;automation.dataset.workflow=flow;
  workflow.querySelectorAll('[data-workflow]').forEach(n=>n.classList.toggle('primary',n.dataset.workflow===flow));
  if(!automation.hidden&&!dialog.open)dialog.show();
  if(next==='tasks'){$('modelConsole').hidden=false;}
  if(next==='read'){requestAnimationFrame(()=>document.dispatchEvent(new Event('hanama:workspace-visible')));}
  refreshStatus();
 }
 function openConsole(){show('tasks');consoleDetails.open=true;$('modelConsole').hidden=false;requestAnimationFrame(()=>consoleDetails.scrollIntoView({block:'nearest'}));}
 tasksNav.onclick=()=>{show('tasks');bookJobsUI.refresh?.();};
 $('closeBookJobs').onclick=()=>{$('readNav').click();};$('closeBookJobs').textContent='返回阅读';
 $('singleDrawingEntry').onclick=()=>{show('read');workbenchUI.open('planning');};
 workflow.querySelectorAll('[data-workflow]').forEach(b=>b.onclick=()=>{flow=b.dataset.workflow;automation.dataset.workflow=flow;workflow.querySelectorAll('[data-workflow]').forEach(n=>n.classList.toggle('primary',n===b));});
 $('resetDrawJob').addEventListener('click',()=>show('studio'));
 const returnToTask=$('returnBackgroundBook').onclick;$('returnBackgroundBook').onclick=async()=>{await returnToTask();show('tasks');};
 $('consoleClose').onclick=()=>consoleDetails.open=false;
 document.addEventListener('hanama:book-jobs-updated',refreshStatus);
 api.onBookJob?.(({storyId,job})=>{liveJobs.set(storyId+':'+job.kind,job);activeJob=job.status==='running'?{id:job.id,kind:job.kind,storyId}:null;refreshStatus();});
 api.onBusy?.(busy=>{if(!busy)activeJob=null;refreshStatus();});
 api.onState?.(()=>{liveJobs.clear();refreshStatus();});
 document.addEventListener('pointerdown',e=>{if(!more.contains(e.target))more.open=false;});
 const result={show,openConsole,update:refreshStatus,workspaceHost:readHost,readerNode:reader,taskNode:taskPanel,get route(){return route;}};
 window.appShell=result;
 show('read');
 return result;
}};
