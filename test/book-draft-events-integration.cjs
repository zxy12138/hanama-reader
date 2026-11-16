// Real Chromium controls, deterministic asynchronous state/progress; no paid services.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.reader-test','draft-events-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}}),js=async s=>{try{return await w.webContents.executeJavaScript(s.includes('await ')?'(async()=>{'+s+'})()':s);}catch(e){console.error('Failed script:',s.slice(0,250));throw e;}};w.webContents.on('console-message',e=>console.error(e.message));try{
 await w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><button id="assistantNav"></button><div class="read-controls"></div>'));
 await js(fs.readFileSync(path.join(root,'book-drawing-ui.js'),'utf8')+';void 0');await js(fs.readFileSync(path.join(root,'book-jobs-ui.js'),'utf8')+';void 0');
 await js(`window.cb={};window.s={story:{id:'s',title:'测试',messages:[{id:'m',text:'第一段\\n第二段'}],bookJobs:{draw:{id:'old',kind:'draw',group:'paragraph',from:1,to:2,cursor:0,status:'paused',units:[{},{}]}},images:[]},drawing:{width:1216,height:832,steps:28,model:'nai-diffusion-5-full',scale:6,seed:-1},account:null};window.runRequests=[];window.run=async(a,v)=>{if(a==='bookJob.preview'){return {total:2,chars:10,estimate:{perImage:30,paid:30,total:60,paidTotal:60,remaining:2,width:v.drawing.width,height:v.drawing.height,accountKnown:false}};}if(a==='bookJob.run'){runRequests.push(v);s.story.bookJobs.draw={...s.story.bookJobs.draw,id:'new',status:'running',group:v.group,charsPerImage:v.charsPerImage,from:v.from,to:v.to,drawing:v.drawing};cb.busy(true);cb.progress({storyId:'s',job:s.story.bookJobs.draw});return new Promise(r=>window.finish=()=>{s.story.bookJobs.draw.status='completed';cb.progress({storyId:'s',job:s.story.bookJobs.draw});cb.busy(false);r(s);});}throw Error(a);};window.ui=BookJobsUI.create({run,getState:()=>s,onState:v=>s=v,render:()=>ui.update(),notify:()=>{},api:{onBusy:f=>cb.busy=f,onBookJob:f=>cb.progress=f}});await ui.open();`);
 // Reproduce historical 'running' status + unrelated balance/preview activity.
 await js(`s.story.bookJobs.draw.status='running';cb.busy(true);ui.update()`);
 assert.equal(await js('document.getElementById("bookJobGroup").disabled'),false);
 // Actual keyboard selection, not just assignment to disabled controls.
 await js('document.getElementById("bookJobGroup").focus()');
 w.webContents.sendInputEvent({type:'keyDown',keyCode:'End'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'End'});
 await new Promise(r=>setTimeout(r,80));
 assert.equal(await js('document.getElementById("bookJobGroup").value'),'passage');
 await js('document.querySelectorAll("[data-image-chars]")[0].click()');
 assert.equal(await js('document.getElementById("bookJobCharsRow").hidden'),false);
 await js(`for(let i=0;i<10;i++){cb.progress({storyId:'s',job:s.story.bookJobs.draw});ui.update();}cb.busy(false);await ui.open();`);
 assert.equal(await js('document.getElementById("bookJobGroup").value'),'passage');
 await js(`document.getElementById('runDrawJob').click()`);await new Promise(r=>setTimeout(r,30));
 assert.equal(await js('runRequests[0].group'),'passage');
 assert.equal(await js('runRequests[0].charsPerImage'),800);
 assert.equal(await js('document.getElementById("bookJobGroup").disabled'),false);
 await js(`const group=document.getElementById('bookJobGroup');group.value='paragraph';group.dispatchEvent(new Event('change'));const from=document.getElementById('bookJobFrom');from.value=2;from.dispatchEvent(new Event('change'));document.querySelector('[data-job-style]').value='watercolor';document.querySelector('[data-job-style]').dispatchEvent(new Event('input'));document.getElementById('closeBookJobs').click();cb.progress({storyId:'s',job:s.story.bookJobs.draw});await ui.open();`);
 assert.equal(await js('document.getElementById("bookJobGroup").value'),'paragraph');
 assert.equal(await js('document.getElementById("bookJobFrom").value'),'2');
 assert.equal(await js('document.querySelector("[data-job-style]").value'),'watercolor');
 assert.equal(await js('runRequests.length'),1,'editing must not start another task');
 assert.equal(await js('s.story.bookJobs.draw.group'),'passage','running snapshot unchanged');
 await js('finish()');await new Promise(r=>setTimeout(r,80));
 assert.equal(await js('document.getElementById("bookJobGroup").value'),'paragraph');
 assert.equal(await js('document.getElementById("bookJobFrom").value'),'2');
 assert.equal(await js('document.querySelector("[data-job-style]").value'),'watercolor');
 assert.match(await js('document.getElementById("runDrawJob").textContent'),/新设置/);
 // Repeated state updates before input blur cannot reset a partially edited field.
 await js(`document.getElementById('bookJobFrom').value='1';ui.update();cb.busy(true);cb.busy(false)`);
 assert.equal(await js('document.getElementById("bookJobFrom").value'),'1');
 await js('document.getElementById("bookJobGroup").value="passage";document.getElementById("bookJobGroup").dispatchEvent(new Event("change"));document.getElementById("bookJobChars").value="1000";document.getElementById("bookJobChars").dispatchEvent(new Event("input"));ui.update()');
 assert.equal(await js('document.getElementById("bookJobChars").value'),'1000');
 assert.equal(await js('s.story.bookJobs.draw.charsPerImage'),800);
 await js('document.getElementById("discardDrawChanges").click()');
 assert.equal(await js('document.getElementById("bookJobChars").value'),'800');
 await js('document.getElementById("bookJobChars").value="";document.getElementById("bookJobChars").dispatchEvent(new Event("input"))');
 assert.equal(await js('document.getElementById("runDrawJob").disabled'),true);
 console.log('PASS: native density selection during busy/running, progress broadcasts, close/reopen, draft during generation survives completion, running snapshot unchanged, unblurred edit retained.');app.exit(0);
}catch(e){console.error(e);app.exit(1);}});setTimeout(()=>app.exit(1),20000).unref();
