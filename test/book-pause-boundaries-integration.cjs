// Pause boundaries around optional balance reads and billable image requests.
const {app,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/pause-boundaries-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story:{id:'book',title:'暂停测试',messages:[{id:'m',text:'第一段。\n第二段。\n第三段。'}],images:[]},rules:[]}));
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
let mode='before',balanceWait=false,balanceAborted=0,imageCount=0,promptCount=0,imageWait=false,releaseImage,roleId;
net.fetch=async(url,options={})=>{
 if(url.endsWith('/chat/completions')){promptCount++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(roleId?{prompt:'garden',negativePrompt:'',needsCharacters:true,characterIds:[roleId],characterPresence:{[roleId]:'physical'},characterOutfitIds:{[roleId]:'uniform'}}:{prompt:'garden, no humans',negativePrompt:'',needsCharacters:false,characterIds:[]})},finish_reason:'stop'}]}));}
 if(url.endsWith('/user/data')){
  if(mode==='before'||mode==='after'&&imageCount===1){balanceWait=true;await new Promise((resolve,reject)=>{const cancel=()=>{balanceAborted++;reject(new DOMException('paused','AbortError'));};if(options.signal.aborted)cancel();else options.signal.addEventListener('abort',cancel,{once:true});});}
  return new Response(JSON.stringify({tier:2,anlas:1000}));
 }
 if(url.endsWith('/ai/generate-image')){imageCount++;if(mode==='image'){imageWait=true;await new Promise(resolve=>releaseImage=resolve);}return new Response(Buffer.from(png,'base64'));}
 throw Error('Unexpected test request');
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_e,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',async()=>{
 const js=s=>w.webContents.executeJavaScript(s),invoke=(a,p={})=>js(`hanama.invoke(${JSON.stringify(a)},${JSON.stringify(p)})`),until=async f=>{for(let i=0;i<150;i++){if(await f())return;await sleep(20);}throw Error('timeout');};
 const finish=promise=>Promise.race([promise,sleep(2200).then(()=>{throw Error('Pause did not finish promptly');})]);
 try{
  await until(()=>js('!!document.getElementById("bookJobsNav")'));
  await invoke('settings.save',{baseUrl:'https://test.invalid/v1',apiKey:'fake',model:'fake',drawing:{apiKey:'fake'}});
  let running=invoke('bookJob.run',{storyId:'book',kind:'draw',autoCharacters:false});await until(()=>balanceWait);
  assert.equal(await invoke('bookJob.pause'),true);await finish(running);
  let s=await invoke('state');assert.equal(imageCount,0);assert.equal(balanceAborted,1);assert.equal(s.busy,false);assert.equal(s.story.bookJobs.draw.status,'paused');assert.equal(s.story.bookJobs.draw.units[0].phase,'prompt');assert.equal(s.story.bookJobs.draw.cursor,0);
  mode='after';balanceWait=false;running=invoke('bookJob.run',{storyId:'book',kind:'draw'});await until(()=>balanceWait&&imageCount===1);
  assert.equal((await invoke('state')).story.images.length,1,'图片先落盘，再核对余额');await until(()=>js('document.querySelectorAll(".story-picture").length===1 && document.querySelectorAll(".gallery-card").length===1'));assert.equal((await invoke('state')).busy,true,'正文与图库在任务仍运行、余额未返回时已更新');await invoke('bookJob.pause');await finish(running);
  s=await invoke('state');assert.equal(s.story.bookJobs.draw.cursor,1);assert.equal(s.story.bookJobs.draw.status,'paused');assert.equal(balanceAborted,2);assert.equal(promptCount,1,'提交前暂停续跑不重复请求提示词');
  assert.equal(s.story.images[0].billing.delta,null,'暂停后未查到扣费不伪装免费');
  mode='image';running=invoke('bookJob.run',{storyId:'book',kind:'draw'});await until(()=>imageWait);await invoke('bookJob.pause');await sleep(70);
  assert.equal((await invoke('state')).busy,true,'已提交请求等图片返回，不能误称已暂停');releaseImage();await finish(running);
  s=await invoke('state');assert.equal(s.story.bookJobs.draw.cursor,2);assert.equal(s.story.bookJobs.draw.status,'paused');assert.equal(imageCount,2);assert.equal(s.story.images.length,2);assert.equal(s.busy,false);
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'story.json'),'utf8'));assert.equal(saved.story.bookJobs.draw.cursor,2);assert.equal(saved.story.images.length,2);
  await assert.rejects(invoke('bookJob.run',{storyId:'book',kind:'draw',expectedJobId:'stale',replaceExisting:true}),/其他窗口变化/);
  const role={name:'小岚',prompt:'black hair',wardrobe:[{id:'uniform',name:'制服',prompt:'blue shirt'}]},created=await invoke('character.save',{storyId:'book',profile:role});roleId=created.characterId;
  mode='before';balanceWait=false;running=invoke('bookJob.run',{storyId:'book',kind:'draw',autoCharacters:false,replaceExisting:true,from:1,to:1});await until(()=>balanceWait);await invoke('bookJob.pause');await finish(running);
  await invoke('character.save',{storyId:'book',profile:{...role,id:roleId,wardrobe:[]}});mode='normal';const submitted=imageCount;
  await assert.rejects(invoke('bookJob.run',{storyId:'book',kind:'draw'}),/请求尚未提交/);s=await invoke('state');assert.equal(imageCount,submitted);assert.equal(s.story.bookJobs.draw.units[0].phase,'prompt');assert.equal(s.story.bookJobs.draw.status,'failed');
  await invoke('character.save',{storyId:'book',profile:{...role,id:roleId}});await invoke('bookJob.run',{storyId:'book',kind:'draw'});assert.equal(imageCount,submitted+1);
  console.log('PASS: pause before submit, cancel balance reads, preserve paid response, checkpoint cursor, resume cached prompt, unknown billing, stale task guard, preflight validation never marks charged. No real API calls.');app.exit(0);
 }catch(e){console.error(e);console.error(dir);app.exit(1);}
 });});setTimeout(()=>app.exit(1),25000).unref();require('../desktop/main.cjs');
