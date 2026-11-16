const {app,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/live-images-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story:{id:'live',title:'逐张显示测试',messages:[{id:'m1',text:'第一段。'},{id:'m2',text:'阅读中的文字。'.repeat(1500)}],images:[]},rules:[]}));
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';let images=0,release;
net.fetch=async url=>{if(url.endsWith('/chat/completions'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({prompt:'garden',negativePrompt:'',needsCharacters:false,characterIds:[]})},finish_reason:'stop'}]}));if(url.endsWith('/user/data'))return new Response(JSON.stringify({tier:2,anlas:1000}));if(url.endsWith('/ai/generate-image')){images++;await new Promise(r=>release=r);return new Response(Buffer.from(png,'base64'));}throw Error('unexpected request');};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let main,child;
app.on('browser-window-created',(_e,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);if(main){child=w;return;}main=w;w.webContents.once('did-finish-load',async()=>{
 const js=s=>w.webContents.executeJavaScript(s),invoke=(a,p={})=>js(`hanama.invoke(${JSON.stringify(a)},${JSON.stringify(p)})`),until=async f=>{for(let i=0;i<180;i++){if(await f())return;await sleep(25);}throw Error('timeout');};
 try{
 await until(()=>js('!!document.getElementById("bookJobsNav") && document.getElementById("startupScreen").hidden'));
 await invoke('settings.save',{baseUrl:'https://test.invalid/v1',apiKey:'fake',model:'fake',drawing:{apiKey:'fake'}});
 await invoke('panel.open',{id:'gallery'});await until(async()=>child&&!child.webContents.isLoading()&&await child.webContents.executeJavaScript('!!document.getElementById("galleryGrid")'));
 await js('document.getElementById("readNav").click();document.querySelector("[data-id=m2] .text-segment").scrollIntoView({block:"start"});document.getElementById("reader").scrollTop+=350;window.flushReadingPosition()');
 const before=await js('JSON.parse(localStorage.getItem("hanama.reading.live"))');assert.equal(before.messageId,'m2');assert.ok(Number.isInteger(before.rawOffset));
 const running=invoke('bookJob.run',{storyId:'live',kind:'draw',autoCharacters:false});await until(()=>images===1);release();
 await until(async()=>images===2&&await js('document.querySelectorAll(".story-picture").length===1'));
 await until(()=>child.webContents.executeJavaScript('document.querySelectorAll(".gallery-card").length===1'));
 await sleep(250);await js('window.flushReadingPosition()');const after=await js('JSON.parse(localStorage.getItem("hanama.reading.live"))');assert.equal(after.messageId,before.messageId);assert.ok(Math.abs(after.rawOffset-before.rawOffset)<40,'阅读文字锚点保持稳定');
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'story.json')));assert.equal(saved.story.images.length,1);assert.equal((await invoke('state')).busy,true);
 await invoke('bookJob.pause');release();await running;await until(()=>js('document.querySelectorAll(".story-picture").length===2'));
 console.log('PASS: first image visible and saved before task completion, detached gallery updated, reading text anchor retained, pause preserves next paid image. No real API calls.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
 });});setTimeout(()=>app.exit(1),25000).unref();require('../desktop/main.cjs');
