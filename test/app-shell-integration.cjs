const {app,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/app-shell-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const story={id:'shell-book',title:'雨后书店',messages:[{id:'m1',name:'正文',text:Array.from({length:90},(_,i)=>'第'+i+'段。雨后的书店透出温暖的灯光，她将那封信留在桌边。').join('\n\n')}],images:[]};
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story,rules:[]}));net.fetch=async()=>{throw Error('No network expected');};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let started=false;
app.on('browser-window-created',(_,w)=>{if(started)return;started=true;w.hide();w.setSize(1500,1000);w.webContents.setBackgroundThrottling(false);const errors=[];w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message);});w.webContents.once('did-finish-load',async()=>{
 const js=async s=>{try{return await w.webContents.executeJavaScript(s);}catch(e){console.error('Script:',s);throw e;}},until=async f=>{for(let i=0;i<220;i++){if(await f())return;await sleep(30);}throw Error('timeout');},click=s=>js(`document.querySelector(${JSON.stringify(s)}).click()`),visible=s=>js(`(()=>{const e=document.querySelector(${JSON.stringify(s)});return !!e&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none'})()`);
 const shot=async name=>{await w.webContents.capturePage({x:0,y:0,width:1,height:1},{stayHidden:true,stayAwake:true});await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(dir,name+'.png'),(await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 try{
  await until(()=>js('!!window.appShell && !document.getElementById("startupScreen").hidden===false'));
  assert.equal(await js('document.body.classList.contains("app-redesigned")'),true);
  assert.equal(await visible('#readingWorkspaceHost'),true);
  await click('#libraryNav');assert.equal(await visible('#libraryPage'),true);assert.equal(await visible('#readingWorkspaceHost'),false);
  assert.ok(await js('document.querySelectorAll(".library-card[data-book-id]").length')>=1);
  await shot('library');
  await click('#readNav');await until(()=>visible('.story'));
  await click('#focusBtn');assert.equal(await js('document.body.classList.contains("focus-mode")'),true);await click('#bookJobsNav');await until(()=>visible('#bookJobsDialog'));assert.equal(await js('document.body.classList.contains("focus-mode")'),false);
  assert.equal(await js('document.body.dataset.appView'),'studio');assert.equal(await js('document.getElementById("bookJobsDialog").matches(":modal")'),false);
  assert.equal(await visible('#bookJobGroup'),true);assert.equal(await visible('#pauseBookJobs'),false);
  await shot('studio');
  await js('document.getElementById("bookJobGroup").value="passage";document.getElementById("bookJobGroup").dispatchEvent(new Event("change"));document.getElementById("bookJobChars").value="800";document.getElementById("bookJobChars").dispatchEvent(new Event("input"))');
  await click('#tasksNav');assert.equal(await visible('#pauseBookJobs'),true);assert.equal(await visible('#bookJobGroup'),false);assert.equal(await visible('#runDrawJob'),false);
  await js('document.dispatchEvent(new Event("hanama:open-console"))');assert.equal(await js('document.getElementById("taskConsoleDetails").open'),true);
  await shot('tasks');
  await click('#bookJobsNav');assert.equal(await js('document.getElementById("bookJobChars").value'),'800');
  await click('#closeBookJobs');assert.equal(await js('document.body.dataset.appView'),'read');
  await shot('reader');
  const bounds=await js('(()=>{const a=document.getElementById("appPages").getBoundingClientRect();return {right:a.right,bottom:a.bottom,w:innerWidth,h:innerHeight}})()');assert.ok(bounds.right<=bounds.w+1&&bounds.bottom<=bounds.h);
  assert.deepEqual(errors,[]);
  console.log('PASS: real shell routes, non-modal automation, task/config separation, persistent draft, console, reader return, bounds; screenshots: '+dir);app.exit(0);
 }catch(e){console.error(e);console.error(errors);app.exit(1);}
});});setTimeout(()=>app.exit(1),30000).unref();require('../desktop/main.cjs');
