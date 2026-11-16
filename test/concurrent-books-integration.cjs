const {app,net,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/concurrent-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story:{id:'a',title:'后台书',messages:[{id:'m',text:'第一段。\n第二段。'}],images:[]},rules:[]}));
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
 const draft=await invoke('import.prepare');await invoke('import.review',{token:draft.token,order:[0],mode:'new',title:'新书'});
 const result=await invoke('import.commit',{token:draft.token,order:[0],mode:'new',title:'新书'}),newId=result.state.story.id;
 assert.notEqual(newId,'a');assert.equal(result.state.busy,true);assert.equal(result.state.activeBookJob.storyId,'a');
 await js('document.getElementById("bookJobsNav").click()');await until(()=>js('!document.getElementById("returnBackgroundBook").hidden'));assert.equal(await js('document.getElementById("pauseBookJobs").disabled'),false);await js('document.getElementById("closeBookJobs").click()');
 await invoke('bookmark.add',{storyId:newId,start:{messageId:'0',offset:0},end:{messageId:'0',offset:2}});
 release();await until(()=>requests===2);
 let s=await invoke('state');assert.equal(s.story.id,newId);assert.equal(s.story.images.length,0);assert.equal(s.gallery.length,1);
 await invoke('story.switch',{id:'a'});s=await invoke('state');assert.equal(s.story.images.length,1);assert.equal(s.story.bookJobs.draw.cursor,1);
 await invoke('story.switch',{id:newId});await invoke('selection.hide',{storyId:newId,start:{messageId:'0',offset:0},end:{messageId:'0',offset:2}});await invoke('bookJob.pause');release();await running;
 s=await invoke('state');assert.equal(s.story.id,newId);assert.equal(s.busy,false);assert.equal(s.story.images.length,0);
 const disk=JSON.parse(fs.readFileSync(path.join(dir,'story.json')));assert.equal(disk.story.id,newId);assert.equal(disk.archives.a.story.images.length,2);assert.equal(disk.archives.a.story.bookJobs.draw.cursor,2);assert.equal(disk.story.bookmarks.length,1);
 await invoke('story.switch',{id:'a'});const single=invoke('drawing.generate',{storyId:'a',afterId:'m',offset:1,prompt:'garden',negativePrompt:'',characterIds:[]});await until(()=>requests===3);await invoke('story.switch',{id:newId});release();await single;assert.equal((await invoke('state')).story.id,newId);await invoke('story.switch',{id:'a'});assert.equal((await invoke('state')).story.images.length,3);
 console.log('PASS: import/review/commit/read/bookmark during generation; multiple switches preserve live task; cross-book pause; images/checkpoints persist only to original book. No real API calls.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
 });});setTimeout(()=>app.exit(1),25000).unref();require('../desktop/main.cjs');
