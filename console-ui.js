window.ConsoleUI={create({run,api,notify}){
  const nav=document.createElement('button');nav.className='nav';nav.id='consoleNav';nav.innerHTML='<span>⌘</span> 控制台';document.getElementById('settingsNav').after(nav);
  const pane=document.createElement('section');pane.id='modelConsole';pane.hidden=true;
  pane.innerHTML='<div class="console-heading"><strong>控制台 · 模型返回</strong><span id="consoleCount">0 条</span><label><input type="checkbox" id="consoleFollow" checked>跟随最新</label><button class="btn" id="consoleStop">停止模型任务</button><button class="btn" id="consoleClear">清空</button><button class="btn" id="consoleClose">收起</button></div><p class="console-note">思考栏显示服务实际返回的 reasoning / thinking 内容；未返回时会明确提示。记录仅保留在本次运行中，最多 60 条。已提交的绘图请求不会因停止模型任务而取消。</p><div id="consoleLog" role="log"></div>';
  document.body.append(pane);const $=id=>document.getElementById(id),rows=new Map();let busy=false,retrying=false,state=null;
  const quality=document.createElement('p');quality.id='modelQuality';quality.className='console-note';pane.querySelector('.console-note').after(quality);const showQuality=q=>{quality.textContent=q.total?`文字任务可靠性：${q.total} 次 · 最终失败 ${q.failed} 次（${(q.rate*100).toFixed(1)}%） · 首次未通过 ${q.firstFailed} 次 · 自动纠正 ${q.retried} 次。目标低于 10%；统计不代表画面质量。`:'文字任务可靠性：还没有统计样本。目标失败率低于 10%，按最终校验结果统计。';quality.title=q.scope||'取消不计入，最多保留最近 200 次；重启保留。';};api.onQuality?.(showQuality);run('model.quality').then(showQuality).catch(e=>quality.textContent='任务统计读取失败：'+e.message);
  function syncRetry(){for(const row of rows.values()){const button=row.querySelector('.console-retry');if(!button)continue;const t=row.retryTarget,job=state?.story.bookJobs?.[t?.kind],sameBook=state?.story.id===t?.storyId,valid=job?.id===t?.jobId&&job?.status==='failed'&&job.cursor===t.cursor&&(job.reviewQueue?.[0]??null)===t.reviewIndex;button.disabled=busy||retrying||!sameBook||!valid;button.textContent=busy||retrying?'等待当前任务结束':!sameBook?'请先切回对应书籍':!valid?'任务进度已更新':'重试并继续';}}
  function update(entry){
    if(entry.clear){rows.clear();$('consoleLog').replaceChildren();$('consoleCount').textContent='0 条';return;}
    let row=rows.get(entry.id);if(!row){row=document.createElement('article');row.className='console-entry';row.innerHTML='<div class="console-entry-head"><b></b><span></span></div><p></p><details class="console-reasoning" open><summary>模型思考</summary><pre></pre></details><details class="console-answer"><summary>模型回复 / 原始结果</summary><pre></pre></details>';rows.set(entry.id,row);$('consoleLog').append(row);if(rows.size>60){const first=rows.keys().next().value;rows.get(first).remove();rows.delete(first);}}
    row.querySelector('b').textContent=entry.title;row.querySelector('.console-entry-head span').textContent=new Date(entry.time).toLocaleTimeString()+' · '+entry.status;
    row.querySelector('p').textContent=entry.detail+(entry.usage?.total_tokens?' · '+entry.usage.total_tokens+' tokens':'');
    row.querySelector('.console-reasoning pre').textContent=entry.reasoning||(entry.status==='运行中'?'等待服务返回思考内容…':'本次服务未返回独立思考内容');
    row.querySelector('.console-answer pre').textContent=entry.answer||'暂无回复';row.dataset.status=entry.status;
    row.retryTarget=entry.retry;let retry=row.querySelector('.console-retry');if(entry.status==='失败'&&entry.retry){if(!retry){retry=document.createElement('button');retry.className='btn console-retry';retry.title='重新请求失败批次，然后继续后续任务；已完成批次保留';row.append(retry);retry.onclick=async()=>{if(retrying||busy)return;retrying=true;syncRetry();try{notify('正在从失败批次重试，已完成内容保留');await run('console.retry',{id:entry.id});notify('本次任务已结束，进度已保存');}catch(e){notify(e.message);}finally{retrying=false;syncRetry();}};}}else retry?.remove();syncRetry();
    const modelEntry=/^(场景识别 ·|助手对话 ·)/.test(entry.title);row.querySelector('.console-reasoning').hidden=!modelEntry;row.querySelector('.console-answer').hidden=!modelEntry&&!entry.answer;
    $('consoleCount').textContent=rows.size+' 条';nav.classList.toggle('console-active',entry.status==='运行中');
    if($('consoleFollow').checked&&!pane.hidden)$('consoleLog').scrollTop=$('consoleLog').scrollHeight;
  }
  const open=()=>{window.appShell?.openConsole();pane.hidden=false;if($('consoleFollow').checked)$('consoleLog').scrollTop=$('consoleLog').scrollHeight;};nav.onclick=()=>{pane.hidden?open():pane.hidden=true;};$('consoleClose').onclick=()=>pane.hidden=true;
  const assistantConsole=document.createElement('button');assistantConsole.className='btn';assistantConsole.textContent='查看返回控制台';$('assistantClose').before(assistantConsole);assistantConsole.onclick=()=>{$('assistantDialog').close();open();};
  $('consoleClear').onclick=async()=>{try{await run('console.clear');update({clear:true});}catch(e){notify(e.message);}};
  $('consoleStop').onclick=async()=>{try{notify(await run('task.cancel')?'已请求停止模型任务':'当前没有可停止的模型请求');}catch(e){notify(e.message);}};
  api.onBusy?.(value=>{busy=value;syncRetry();});api.onState?.(s=>{state=s;busy=!!s.busy;syncRetry();});run('state').then(s=>{state=s;busy=!!s.busy;syncRetry();}).catch(()=>{});
  api.onConsole?.(update);run('console.list').then(list=>list.forEach(update)).catch(()=>{});document.addEventListener('hanama:open-console',open);
  return {open};
}};
