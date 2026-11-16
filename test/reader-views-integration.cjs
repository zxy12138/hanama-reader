// Isolated desktop regression: no real books, credentials, or network requests.
const {app,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/reader-views-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const novel=Array.from({length:3500},(_,i)=>`第${i}段，风穿过庭院，树叶在窗外缓缓摇动。这里是用于阅读位置验证的正文。\n`).join('');
const story={id:'views',title:'双阅读视图测试',images:[],messages:[{id:'intro',name:'序章',text:'前文[hide]秘密[end]后文'},{id:'hidden',name:'已排除整章',text:'[hide]'+'不应创建的屏蔽文字'.repeat(100000)+'[end]'},{id:'novel',name:'正文',text:novel},{id:'last',name:'尾章',text:'最后一行仍然存在。'}]};
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story,rules:[{enabled:true,start:'[hide]',end:'[end]',includeBounds:true}]}));
net.fetch=async()=>{throw Error('Unexpected network request');};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',async()=>{
 const js=s=>w.webContents.executeJavaScript(s),invoke=(a,p={})=>js(`hanama.invoke(${JSON.stringify(a)},${JSON.stringify(p)})`),until=async f=>{for(let i=0;i<200;i++){if(await f())return;await sleep(25);}throw Error('timeout');};
 const settle=async()=>{await w.webContents.capturePage({x:0,y:0,width:1,height:1},{stayHidden:true,stayAwake:true});await sleep(250);};
 try{
  await until(()=>js('!!document.getElementById("reviewBtn") && document.getElementById("startupScreen").hidden'));await js('document.getElementById("readNav").click()');await settle();
  assert.equal(await js('document.getElementById("reader").dataset.readingMode'),'clean');
  assert.equal(await js('document.querySelectorAll(".excluded-text,.excluded-segment").length'),0);
  assert.equal(await js('!!document.querySelector(".message-block[data-id=hidden]")'),false);
  assert.equal(await js('document.querySelector(".message-block[data-id=intro] .message-text").textContent'),'前文后文');
  assert.equal(await js('document.querySelector(".message-block[data-id=novel]").dataset.messageIndex'),'2');
  await js('document.getElementById("searchOpen").click();document.getElementById("searchQuery").value="前文后文";document.getElementById("searchQuery").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))');
  assert.equal(await js('document.getElementById("searchCount").textContent'),'1 / 1');
  assert.equal(await js('document.getElementById("searchExcluded").disabled'),true);
  await js('document.getElementById("searchQuery").value="秘密";document.getElementById("searchQuery").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))');
  assert.equal(await js('document.getElementById("searchCount").textContent'),'未找到');
  await js('document.getElementById("searchClose").click();document.getElementById("reviewBtn").click()');await settle();
  assert.equal(await js('document.querySelectorAll(".excluded-text").length'),2);
  await js('document.querySelector(".excluded-text").open=true');assert.equal(await js('document.querySelector(".excluded-segment").textContent'),'[hide]秘密[end]');
  await js('document.getElementById("sourceBtn").click()');await settle();assert.equal(await js('document.getElementById("reader").dataset.readingMode'),'source');assert.equal(await js('document.querySelectorAll(".excluded-text").length'),0);
  await js('document.getElementById("readingBtn").click()');await settle();
  await js(`(()=>{const list=[...document.querySelectorAll('.message-block[data-id=novel] .text-segment')];window.target=list[Math.floor(list.length*.4)];target.scrollIntoView({block:'center',behavior:'instant'});})()`);await settle();
  await js(`(()=>{const r=document.createRange(),n=target.firstChild;r.setStart(n,100);r.setEnd(n,500);window.hideEnd=Number(target.dataset.rawStart)+500;window.hideStart=Number(target.dataset.rawStart)+100;window.beforeY=r.getBoundingClientRect().top-document.getElementById('reader').getBoundingClientRect().top;getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('pointerup'));})()`);
  await until(()=>js('!document.getElementById("selectionMenu").hidden'));await js('document.querySelector("[data-selection=hide]").click()');
  await until(async()=>!!(await invoke('state')).story.manualHideHistory?.length);await settle();
  assert.equal(await js('document.querySelectorAll(".excluded-text").length'),0);
  const location=await js(`(()=>{const s=[...document.querySelectorAll('.message-block[data-id=novel] .text-segment')].find(n=>Number(n.dataset.rawStart)===hideEnd),r=document.createRange(),reader=document.getElementById('reader');if(!s)return null;r.setStart(s.firstChild,0);r.collapse(true);return {delta:r.getBoundingClientRect().top-reader.getBoundingClientRect().top-Math.max(8,Math.min(reader.getBoundingClientRect().height-48,beforeY))};})()`);
  assert.ok(location&&Math.abs(location.delta)<9,JSON.stringify(location));
  await js('document.getElementById("undoManualHide").click()');await until(async()=>!(await invoke('state')).story.manualHideHistory?.length);await settle();
  assert.equal((await invoke('state')).story.messages.find(m=>m.id==='novel').text,novel);
  await js('document.getElementById("reviewBtn").click()');await settle();const before=await js('JSON.parse(localStorage.getItem("hanama.reading.views"))');await js('document.getElementById("readingBtn").click()');await settle();const after=await js('JSON.parse(localStorage.getItem("hanama.reading.views"))');assert.equal(after.messageId,before.messageId);assert.ok(Math.abs(after.rawOffset-before.rawOffset)<150);
  // A restore action in review updates the canonical story; clean view then shows it.
  await js('document.getElementById("reviewBtn").click()');await settle();await js('document.querySelector(".message-block[data-id=intro] .restore-excluded").click()');await until(async()=>!!(await invoke('state')).story.messages[0].restoredRanges?.length);await js('document.getElementById("readingBtn").click()');await settle();assert.equal(await js('document.querySelector(".message-block[data-id=intro] .message-text").textContent'),'前文[hide]秘密[end]后文');
  assert.equal(await js('localStorage.getItem("hanama.reader.view")'),'clean');
  await js('document.getElementById("reviewBtn").click()');await settle();
  await new Promise(resolve=>{w.webContents.once('did-finish-load',resolve);w.reload();});
  await w.webContents.capturePage({x:0,y:0,width:1,height:1},{stayHidden:true,stayAwake:true});
  await until(()=>js('document.getElementById("startupScreen").hidden'));
  assert.equal(await js('document.getElementById("reader").dataset.readingMode'),'review');
  assert.equal(await js('document.querySelectorAll(".excluded-text").length'),1);
  console.log('PASS: clean/review/source; million hidden characters omitted; whole hidden message removed; exact search across removed text; scroll anchor after hide; undo and restore preserve original data; mode switching retains position and survives reload.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});});setTimeout(()=>{console.error('reader views timeout');app.exit(1);},30000).unref();require('../desktop/main.cjs');
