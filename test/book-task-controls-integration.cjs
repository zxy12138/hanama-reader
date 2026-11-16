// Deterministic renderer regression: task progress and edited next-task settings stay independent.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.reader-test','task-controls-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}}),js=s=>w.webContents.executeJavaScript(s.includes('await ')?'(async()=>{'+s+'})()':s),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 try{
  await w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><button id="assistantNav"></button><div class="read-controls"></div>'));
  for(const file of ['book-drawing-ui.js','book-jobs-ui.js'])await js(fs.readFileSync(path.join(root,file),'utf8')+';void 0');
  await js(`window.cb={};window.s={busy:true,story:{id:'s',title:'测试',messages:[{id:'m',text:'甲。乙。'}],images:[],bookJobs:{draw:{id:'old',kind:'draw',status:'running',group:'paragraph',from:1,to:2,cursor:1,units:[{phase:'done'},{phase:'prompt',prompt:{prompt:'old garden'}}],drawing:{model:'nai-diffusion-5-full',width:1216,height:832,steps:28,scale:6,seed:-1}}}},drawing:{model:'nai-diffusion-5-full',width:1216,height:832,steps:28,scale:6,seed:-1}};window.calls=[];window.run=async(a,v)=>{calls.push({a,v});if(a==='bookJob.preview')return {total:2,chars:6,estimate:{width:1216,height:832,perImage:30,paid:30,total:60,paidTotal:60,remaining:2}};if(a==='bookJob.pause'){s.story.bookJobs.draw.pauseRequested=true;cb.progress({storyId:'s',job:s.story.bookJobs.draw});return true;}if(a==='bookJob.run'){s.busy=true;s.story.bookJobs.draw.status='running';s.story.bookJobs.draw.pauseRequested=false;cb.busy(true);cb.progress({storyId:'s',job:s.story.bookJobs.draw});return new Promise(resolve=>window.finish=()=>{s.story.bookJobs.draw.status='paused';cb.progress({storyId:'s',job:s.story.bookJobs.draw});cb.busy(false);resolve({...s,busy:true});});}if(a==='bookJob.refusalPolicy'){s.story.bookJobs.draw.refusalPolicy=v.policy;return s;}if(a==='bookJob.skipText'){s.story.bookJobs.draw.cursor=2;s.story.bookJobs.draw.status='completed';return s;}if(a==='bookJob.resolve'){s.story.bookJobs.draw.units[1].phase='prompt';return s;}throw Error(a);};window.ui=BookJobsUI.create({run,getState:()=>s,onState:v=>s=v,render:()=>ui.update(),notify:()=>{},api:{onBusy:f=>cb.busy=f,onBookJob:f=>cb.progress=f}});await ui.open();`);
  // A window opened while a task is already running receives no historical busy event.
  assert.equal(await js('document.getElementById("pauseBookJobs").disabled'),false);
  assert.equal(await js('document.getElementById("runDrawJob").disabled'),true);
  await js('s.story.bookJobs.clean={id:"stale",kind:"clean",status:"paused",pauseRequested:true,units:[],cursor:0};ui.update()');
  assert.equal(await js('document.getElementById("pauseBookJobs").disabled'),false,'old unrelated pause flag cannot disable the active draw task');
  await js(`document.querySelector('[data-job-param=steps]').value='22';document.querySelector('[data-job-param=steps]').dispatchEvent(new Event('input'));`);
  assert.match(await js('document.getElementById("drawJobStatus").textContent'),/原任务.*1 \/ 2/);
  assert.equal(await js('document.getElementById("drawJobProgress").value'),1);
  assert.equal(await js('document.getElementById("bookJobPrompt").textContent'),'old garden');
  assert.equal(await js('document.getElementById("resumeOriginalDraw").hidden'),false);
  assert.equal(await js('document.getElementById("resumeOriginalDraw").disabled'),true);
  await js('document.getElementById("pauseBookJobs").click()');await sleep(20);
  assert.equal(await js('calls.find(c=>c.a==="bookJob.pause").v.jobId'),'old');
  assert.equal(await js('document.getElementById("pauseBookJobs").disabled'),true);
  await js('s.story.bookJobs.draw.status="paused";s.story.bookJobs.draw.pauseRequested=false;cb.progress({storyId:"s",job:s.story.bookJobs.draw});cb.busy(false);ui.update()');
  await js('document.getElementById("resumeOriginalDraw").click()');await sleep(20);
  assert.equal(await js('calls.find(c=>c.a==="bookJob.run").v.replaceExisting'),false);
  assert.equal(await js('calls.find(c=>c.a==="bookJob.run").v.expectedJobId'),'old');
  assert.equal(await js('document.querySelector("[data-job-param=steps]").value'),'22','resuming cannot overwrite draft');
  await js('finish()');await sleep(50);
  assert.equal(await js('document.getElementById("resumeOriginalDraw").disabled'),false,'late result busy:true cannot override latest busy:false event');
  assert.match(await js('document.getElementById("runDrawJob").textContent'),/新设置/);
  // An unconfirmed paid request remains visible even while editing new settings.
  await js('s.story.bookJobs.draw.units[1].phase="uncertain";ui.update()');
  assert.equal(await js('document.getElementById("uncertainImage").hidden'),false);
  assert.equal(await js('document.getElementById("runDrawJob").disabled'),true);
  await js('document.getElementById("skipBookImage").click()');await sleep(30);
  assert.equal(await js('calls.find(c=>c.a==="bookJob.resolve").v.jobId'),'old');
  await js('document.getElementById("discardDrawChanges").click()');await sleep(20);
  assert.equal(await js('document.querySelector("[data-job-param=steps]").value'),'28');
  assert.equal(await js('document.getElementById("resumeOriginalDraw").hidden'),true);
  assert.match(await js('document.getElementById("runDrawJob").textContent'),/继续/);
  assert.equal(await js('calls.filter(c=>c.a==="bookJob.run").length'),1);
  await js('s.story.bookJobs.draw.status="running";cb.busy(true);ui.update()');
  assert.equal(await js('document.getElementById("pauseBookJobs").disabled'),true,'an unrelated busy operation does not revive stale running jobs');
  assert.match(await js('document.getElementById("drawJobStatus").textContent'),/已保存，可继续/);
  await js('s.story.bookJobs.draw.status="failed";cb.busy(false);ui.update();document.getElementById("bookRefusalPolicy").value="skip";document.getElementById("bookRefusalPolicy").dispatchEvent(new Event("change"))');await sleep(30);
  assert.equal(await js('calls.find(c=>c.a==="bookJob.refusalPolicy").v.policy'),'skip');
  assert.equal(await js('document.getElementById("skipTextJob").hidden'),false);
  await js('document.getElementById("skipTextJob").click()');await sleep(30);
  assert.equal(await js('calls.find(c=>c.a==="bookJob.skipText").v.jobId'),'old');
  assert.equal(await js('document.getElementById("skipTextJob").hidden'),true);
  assert.equal(await js('calls.filter(c=>c.a==="bookJob.run").length'),1,'skipping final unit does not restart the job');
  console.log('PASS: initial running state, draft progress, explicit original resume, unchanged pending settings, pause latch, uncertain resolution visibility, expected task IDs, discard draft.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});setTimeout(()=>app.exit(1),20000).unref();
