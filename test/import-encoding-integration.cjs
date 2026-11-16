const {app,dialog,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/import-encoding-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const file=path.join(dir,'编码测试.txt');fs.writeFileSync(file,Buffer.from('c4e3bac3a3accac0bde7a3a1','hex'));dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});net.fetch=async()=>{throw Error('No network');};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_e,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',async()=>{
 const js=s=>w.webContents.executeJavaScript(s),invoke=(a,p={})=>js(`hanama.invoke(${JSON.stringify(a)},${JSON.stringify(p)})`),until=async f=>{for(let i=0;i<180;i++){if(await f())return;await sleep(25);}throw Error('UI timeout');};
 try{
 await until(()=>js('document.getElementById("startupScreen").hidden'));
 await js('document.getElementById("importTop").click()');await until(()=>js('document.getElementById("importDialog").open'));
 assert.equal(await js('document.querySelector(".book-encoding-preview").textContent'),'你好，世界！');
 await js('document.querySelector("[data-file-encoding]").value="utf-8";document.querySelector("[data-file-encoding]").dispatchEvent(new Event("change"))');
 await until(()=>js('document.getElementById("bookImportFiles").textContent.includes("读取失败")'));
 assert.equal(await js('document.getElementById("confirmBookImport").disabled'),true);
 await js('document.querySelector("[data-file-encoding]").value="gb18030";document.querySelector("[data-file-encoding]").dispatchEvent(new Event("change"))');
 await until(()=>js('!document.getElementById("confirmBookImport").disabled'));
 assert.equal(await js('document.querySelector(".book-encoding-preview").textContent'),'你好，世界！');
 await js('document.getElementById("confirmBookImport").click()');await until(()=>js('!document.getElementById("importDialog").open'));
 const state=await invoke('state');assert.equal(state.story.messages[0].text,'你好，世界！');assert.equal(state.story.sources[0].encoding,'gb18030');assert.equal(fs.readFileSync(file).toString('hex'),'c4e3bac3a3accac0bde7a3a1');
 console.log('PASS: automatic preview, manual encoding failure blocks commit, correction reloads original bytes, successful import preserves source and encoding.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
 });});setTimeout(()=>app.exit(1),25000).unref();require('../desktop/main.cjs');
