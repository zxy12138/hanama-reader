const {app,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/selection-repeats-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story:{id:'book',title:'重复内容测试',messages:[{id:'m',text:'[提示]故事开头。\n[提示]剧情继续。\n[提示]故事结束。'}],images:[]},rules:[]}));net.fetch=async()=>{throw Error('No network expected');};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',async()=>{
 const js=s=>w.webContents.executeJavaScript(s),invoke=(a,p={})=>js(`hanama.invoke(${JSON.stringify(a)},${JSON.stringify(p)})`),until=async f=>{for(let i=0;i<150;i++){if(await f())return;await sleep(25);}throw Error('timeout');};
 try{
 await until(()=>js('!!document.querySelector("[data-selection=hideRepeated]") && document.getElementById("startupScreen").hidden'));
 await js('document.getElementById("readNav").click();(()=>{const r=document.createRange(),n=document.querySelector(".text-segment").firstChild;r.setStart(n,0);r.setEnd(n,4);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event("pointerup"));})()');
 await until(()=>js('!document.getElementById("selectionMenu").hidden'));await js('document.querySelector("[data-selection=hideRepeated]").click()');
 await until(()=>js('!!document.getElementById("repeatedSelectionDialog")?.open'));
 assert.equal(await js('document.querySelectorAll(".repeat-match").length'),3);
 await js('document.querySelector("[data-keep]").click();document.querySelector("[data-apply]").click()');
 await until(async()=> (await invoke('state')).story.manualHideHistory?.length===1);
 const hidden=await invoke('state');assert.equal(hidden.story.messages[0].manualExcluded.length,2);assert.equal(hidden.story.messages[0].manualExcluded[0].from,10);
 assert.equal(hidden.story.messages[0].text,'[提示]故事开头。\n[提示]剧情继续。\n[提示]故事结束。');
 await until(()=>js('!document.getElementById("undoManualHide").disabled'));await js('document.getElementById("undoManualHide").click()');
 await until(async()=>!(await invoke('state')).story.manualHideHistory.length);assert.equal((await invoke('state')).story.messages[0].manualExcluded.length,0);
 console.log('PASS: selected-text toolbar, exact-match review, keep-first selection, batch hide persists, single undo restores all.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
 });});setTimeout(()=>app.exit(1),20000).unref();require('../desktop/main.cjs');
