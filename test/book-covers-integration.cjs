const {app,net,dialog,nativeImage}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/book-covers-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const png=nativeImage.createFromBitmap(Buffer.from([0,100,255,255]),{width:1,height:1}).toPNG().toString('base64'),image={id:'original-image',sourceStoryId:'a',dataUrl:'data:image/png;base64,'+png};
fs.writeFileSync(path.join(dir,'upload.png'),Buffer.from(png,'base64'));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(dir,'upload.png')]});
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story:{id:'a',title:'Book A',messages:[{id:'m',text:'第一本正文。'}],images:[]},archives:{b:{story:{id:'b',title:'Book B',messages:[{id:'b1',text:'第二本正文。'}],images:[]},rules:[]}},gallery:[image],rules:[]}));
let generated=0,release;net.fetch=async(url,options)=>{if(url.endsWith('/user/data'))return new Response(JSON.stringify({tier:2,anlas:1000-generated*12}));if(url.endsWith('/chat/completions'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({prompt:'quiet bookstore, cover illustration, no text',negativePrompt:'text'})},finish_reason:'stop'}]}));if(url.endsWith('/ai/generate-image')){generated++;assert.equal(JSON.parse(options.body).parameters.width,768);await new Promise(r=>release=r);return new Response(Buffer.from(png,'base64'));}throw Error('unexpected URL');};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',async()=>{
 const js=s=>w.webContents.executeJavaScript(s),invoke=(a,p={})=>js(`hanama.invoke(${JSON.stringify(a)},${JSON.stringify(p)})`),until=async f=>{for(let i=0;i<240;i++){if(await f())return;await sleep(25);}throw Error('timeout');};
 try{
  await until(()=>js('document.getElementById("startupScreen").hidden&&!!document.querySelector("[data-edit-cover]")'));
  await invoke('settings.save',{baseUrl:'https://model.invalid/v1',model:'test',apiKey:'fake',drawing:{apiKey:'fake'}});
  await invoke('cover.set',{storyId:'a',imageId:'original-image',title:'封面标题',author:'作者'});let state=await invoke('state');const prior=state.story.cover.imageId;assert.notEqual(prior,'original-image');
  await invoke('image.delete',{imageId:'original-image'});state=await invoke('state');assert.equal(state.story.cover.missing,false);assert.equal(state.story.images.length,0);
  const uploaded=await invoke('cover.upload',{storyId:'b'});assert.ok(uploaded.image.dataUrl.startsWith('hanama-image:'));assert.equal((await invoke('cover.list',{storyId:'b'})).book.cover,null);
  const p=await invoke('cover.prompt',{storyId:'b',summary:'雨后书店'});assert.ok(p.prompt.includes('bookstore'));
  await assert.rejects(()=>invoke('cover.generate',{storyId:'b',prompt:'bookstore',maxEstimate:0}),/费用/);assert.equal(generated,0);
  await js('document.dispatchEvent(new CustomEvent("hanama:book-cover",{detail:{id:"b"}}))');
  await until(()=>js('!!document.querySelector(".book-cover-dialog[open]")'));
  await until(()=>js('!document.querySelector("[data-cover-generate]").disabled'));
  await js('document.querySelector("[data-cover-generate]").click()');await until(()=>generated===1);
  await js('document.querySelector(".cover-dialog-heading button").click()');assert.equal(await js('!!document.querySelector(".book-cover-dialog[open]")'),false);
  await js('document.dispatchEvent(new CustomEvent("hanama:book-cover",{detail:{id:"b"}}))');await until(()=>js('!!document.querySelector(".book-cover-dialog[open]")'));await sleep(80);assert.equal(await js('document.querySelector("[data-cover-generate]").disabled'),true);await invoke('story.switch',{id:'b'});release();await until(async()=>!(await invoke('state')).busy);
  await until(()=>js('!document.querySelector("[data-cover-generate]").disabled'));await until(()=>js('document.querySelectorAll(".cover-candidate-list img").length===2'));state=await invoke('state');assert.equal(state.story.images.length,0);assert.equal(state.gallery.filter(i=>!i.deletedAt).length,0);assert.equal(state.story.cover,null);
  const listing=await invoke('cover.list',{storyId:'b'});assert.equal(listing.candidates.length,2);assert.equal(listing.candidates[0].billing.delta,12);
  await invoke('cover.set',{storyId:'b',imageId:listing.candidates[0].id,title:'B 的封面',author:'写作者'});state=await invoke('state');assert.equal(state.story.cover.title,'B 的封面');assert.equal(state.books.find(b=>b.id==='a').cover.imageId,prior);
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'story.json'),'utf8'));assert.equal(saved.story.cover.title,'B 的封面');assert.ok(saved.gallery.find(g=>g.id===state.story.cover.imageId).asset);assert.ok(!JSON.stringify(saved.story.cover).includes('data:'));
  console.log('PASS: safe uploaded/AI candidates, model prompts, fee-change guard, independent cover selection, gallery-delete protection, cross-book generation, close while drawing, disk persistence. Fake services only.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});});setTimeout(()=>{console.error('cover test timeout');app.exit(1);},30000).unref();require('../desktop/main.cjs');
