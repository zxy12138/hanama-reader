// User-edit precedence and persisted auto/manual mode. All service traffic is synthetic.
const {app,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/character-controls-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const c={id:'role',name:'小岚',prompt:'black hair',negativePrompt:'',wardrobe:[{id:'school',name:'校服',prompt:'white shirt'}],enabled:true};
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story:{id:'book',title:'角色操作测试',messages:[{id:'m',name:'正文',text:'小岚正在花园散步。'}],images:[],characters:[c],drawingDraft:{castPolicyVersion:0,castReason:'手动设置本张角色与服装',characterIds:['role'],characterOutfits:{role:'blue coat'},characterOutfitIds:{role:''},characterViews:{role:'front'},prompt:'garden',negativePrompt:'',afterId:'m',offset:2,updatedAt:1}},rules:[]}));
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';let releaseMatch,releaseImage,modelCalls=0,imageCalls=0,holdImage=false;
net.fetch=async(url,options={})=>{if(url.endsWith('/user/data'))return new Response(JSON.stringify({tier:2,anlas:100}));if(url.endsWith('/ai/generate-image')){imageCalls++;if(holdImage)await new Promise(r=>releaseImage=r);return new Response(Buffer.from(png,'base64'));}if(url.endsWith('/chat/completions')){modelCalls++;await new Promise(r=>releaseMatch=r);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({needsCharacters:false,characterIds:[],characterOutfits:{},characterPresence:{},castReason:'empty garden'})}}]}));}throw Error('Unexpected network '+url);};
let started=false;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_e,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',async()=>{
 if(started)return;started=true;const js=s=>w.webContents.executeJavaScript(s),invoke=(action,args={})=>js(`hanama.invoke(${JSON.stringify(action)},${JSON.stringify(args)})`),until=async f=>{for(let i=0;i<200;i++){if(await f())return;await sleep(30);}throw Error('UI timeout');};
 try{
  await until(()=>js('!!document.querySelector("[data-scene-outfit]") && document.getElementById("startupScreen").hidden'));
  assert.equal(await js('document.getElementById("autoJudgeCast").checked'),false,'旧手动草稿不自动重新判断');
  await invoke('settings.save',{baseUrl:'https://test.invalid/v1',apiKey:'fake',model:'fake',drawing:{apiKey:'fake'}});
  await js('window.savedCastInput=document.querySelector("[data-scene-outfit]");savedCastInput.value="green coat";savedCastInput.dispatchEvent(new Event("input"));');
  // Unrelated state refresh must not recreate the typing field or its selected wardrobe dropdown.
  const state=await invoke('state');w.webContents.send('hanama:state',state);await sleep(80);
  assert.equal(await js('savedCastInput===document.querySelector("[data-scene-outfit]")'),true);
  assert.equal(await js('document.querySelector("[data-scene-outfit]").value'),'green coat');
  await js('window.flushDrawingDraft()');let s=await invoke('state');assert.equal(s.story.drawingDraft.characterOutfits.role,'green coat');assert.equal(s.story.drawingDraft.autoJudgeCast,false);
  await new Promise(r=>{w.webContents.once('did-finish-load',r);w.webContents.reload();});w.webContents.setBackgroundThrottling(false);await w.webContents.capturePage({x:0,y:0,width:1,height:1},{stayHidden:true,stayAwake:true});
  await until(()=>js('!!document.querySelector("[data-scene-outfit]") && document.getElementById("startupScreen").hidden'));
  assert.equal(await js('document.getElementById("autoJudgeCast").checked'),false);
  assert.equal(await js('document.querySelector("[data-scene-outfit]").value'),'green coat');
  // Automatic analysis finishing after a newer edit must not overwrite that edit.
  await js('document.getElementById("judgeCast").click()');await until(()=>!!releaseMatch);
  await js('document.querySelector("[data-scene-outfit]").value="pink coat";document.querySelector("[data-scene-outfit]").dispatchEvent(new Event("input"));');releaseMatch();await until(async()=>!(await invoke('state')).busy);await sleep(80);
  assert.equal(await js('document.querySelector("[data-scene-outfit]").value'),'pink coat');assert.equal(await js('document.querySelector("#castChoices .character-chip input").checked'),true);assert.equal(await js('document.getElementById("autoJudgeCast").checked'),false);
  await js('window.flushDrawingDraft()');
  // A manual generation does not run another cast model request, nor accept a new selection mid-task.
  holdImage=true;await js('document.getElementById("createIllustration").click()');await until(()=>!!releaseImage);assert.equal(modelCalls,1);
  await js('document.dispatchEvent(new CustomEvent("hanama:illustration-selection",{detail:{storyId:"book",remote:true,start:{messageId:"m",offset:0},end:{messageId:"m",offset:4},afterId:"m",offset:4}}))');
  assert.equal(await js('document.getElementById("autoJudgeCast").checked'),false);assert.equal(await js('document.getElementById("promptText").value'),'garden');
  releaseImage();await until(async()=>!(await invoke('state')).busy);s=await invoke('state');assert.equal(s.gallery.at(-1).characterSnapshots[0].sceneOutfit,'pink coat');assert.equal(imageCalls,1);
  console.log('PASS: legacy manual mode, input survives refresh, draft saves without blur, auto/manual mode survives reload, stale AI cast does not override edits, generation rejects mid-task selection.');app.exit(0);
 }catch(e){console.error(e);console.error('profile:',dir);app.exit(1);}
 });});setTimeout(()=>app.exit(1),40000).unref();require('../desktop/main.cjs');
