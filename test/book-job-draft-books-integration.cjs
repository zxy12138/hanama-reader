const {app,net,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/concurrent-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story:{id:'a',title:'后台书',messages:[{id:'m',text:'第一段。\n第二段。\n第三段。'}],images:[]},rules:[]}));
const imported=path.join(dir,'新书.txt');fs.writeFileSync(imported,'这是新书的正文。');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[imported]});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';let release,requests=0;
net.fetch=async(url)=>{if(url.endsWith('/chat/completions'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({prompt:'garden, no humans',negativePrompt:'',needsCharacters:false,characterIds:[]})},finish_reason:'stop'}]}));if(url.endsWith('/user/data'))return new Response(JSON.stringify({tier:2,anlas:1000}));if(url.endsWith('/ai/generate-image')){requests++;await new Promise(r=>release=r);return new Response(Buffer.from(png,'base64'));}throw Error('unexpected request');};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_e,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',async()=>{
 const js=s=>w.webContents.executeJavaScript(s),invoke=(a,p={})=>js(`hanama.invoke(${JSON.stringify(a)},${JSON.stringify(p)})`),until=async f=>{for(let i=0;i<200;i++){if(await f())return;await sleep(25);}throw Error('timeout');};
 try{
 await until(()=>js('!!document.getElementById("bookJobsNav")'));
 await invoke('settings.save',{baseUrl:'https://test.invalid/v1',apiKey:'fake',model:'fake',drawing:{apiKey:'fake'}});
 const running=invoke('bookJob.run',{storyId:'a',kind:'draw',autoCharacters:false});await until(()=>requests===1);
 await js('document.getElementById("bookJobsNav").click();document.querySelectorAll("[data-image-chars]")[0].click()');
 assert.equal(await js('document.getElementById("bookJobChars").value'),'800');await js('document.querySelector("[data-job-style]").value="watercolor";document.querySelector("[data-job-style]").dispatchEvent(new Event("input"));document.querySelector("[data-size]").value="832x1216";document.querySelector("[data-size]").dispatchEvent(new Event("change"))');
 const draft=await invoke('import.prepare');await invoke('import.review',{token:draft.token,order:[0],mode:'new',title:'新书'});
 const result=await invoke('import.commit',{token:draft.token,order:[0],mode:'new',title:'新书'}),newId=result.state.story.id;
 assert.notEqual(newId,'a');assert.equal(result.state.busy,true);assert.equal(result.state.activeBookJob.storyId,'a');
 await js('document.getElementById("tasksNav").click()');await until(()=>js('!document.getElementById("returnBackgroundBook").hidden'));
 await js('document.getElementById("pauseBookJobs").click()');release();await running;await sleep(100);
 let state=await invoke('state');assert.equal(state.books.find(b=>b.id==='a').bookJobs.draw.cursor,1);assert.equal(state.books.find(b=>b.id==='a').bookJobs.draw.total,3);assert.ok(!('units' in state.books.find(b=>b.id==='a').bookJobs.draw));
 await until(()=>js('!!document.querySelector("#allBookTaskList [data-task-story-id=a]")'));assert.match(await js('document.querySelector("#allBookTaskList [data-task-story-id=a]").textContent'),/暂停/);await js('document.querySelector("#allBookTaskList [data-task-story-id=a] button").click()');await until(async()=>(await invoke('state')).story.id==='a');await sleep(100);assert.equal(await js('appShell.route'),'tasks');assert.equal(requests,1);
 assert.equal(await js('document.getElementById("bookJobChars").value'),'800');assert.equal(await js('document.getElementById("bookJobGroup").value'),'passage');assert.equal(await js('document.querySelector("[data-job-style]").value'),'watercolor');assert.equal(await js('document.querySelector("[data-size]").value'),'832x1216');
 assert.equal(await js('!!document.getElementById("resumeOriginalDraw").getClientRects().length'),true);assert.equal(requests,1);
 await js('document.getElementById("resumeOriginalDraw").click()');await until(()=>requests===2);await invoke('bookJob.pause');release();await until(async()=>!(await invoke('state')).busy);await sleep(100);
 state=await invoke('state');assert.equal(state.story.bookJobs.draw.cursor,2);assert.equal(state.story.bookJobs.draw.group,'paragraph');assert.equal(await js('document.getElementById("bookJobChars").value'),'800');
 await new Promise(r=>{w.webContents.once('did-finish-load',r);w.webContents.reload();});w.webContents.setBackgroundThrottling(false);await w.webContents.capturePage({x:0,y:0,width:1,height:1},{stayHidden:true,stayAwake:true});await until(()=>js('document.getElementById("startupScreen").hidden&&!!document.getElementById("bookJobChars")'));
 assert.equal(await js('document.getElementById("bookJobChars").value'),'800');assert.equal(await js('document.querySelector("[data-job-style]").value'),'watercolor');
 await js('document.getElementById("discardDrawChanges").click()');assert.equal(await js('localStorage.getItem("hanama.book-job-draft.v1.a")'),null);assert.equal(await js('document.getElementById("bookJobGroup").value'),'paragraph');
 console.log('PASS: per-book draft density/style/size survives switching, old task resume and reload; discard clears draft; cross-book job metadata is bounded. No real API.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
 });});setTimeout(()=>app.exit(1),25000).unref();require('../desktop/main.cjs');
