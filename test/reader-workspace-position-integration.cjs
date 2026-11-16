const {app,net}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../.reader-test/reader-workspace-position-'+Date.now());fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const text=Array.from({length:2600},(_,i)=>`第${i}段，风穿过庭院，树叶在窗外缓缓摇动。这里是用于阅读位置验证的正文。\n`).join('');
const dataUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
fs.writeFileSync(path.join(dir,'story.json'),JSON.stringify({story:{id:'workspace-position',title:'后台更新位置测试',messages:[{id:'m',name:'正文',text}],images:[{id:'img',afterId:'m',offset:10,pending:true,dataUrl,width:832,height:1216}]},rules:[]}));
net.fetch=async()=>{throw Error('No network expected');};const sleep=ms=>new Promise(r=>setTimeout(r,ms));let main;
app.on('browser-window-created',(_,w)=>{w.hide();w.webContents.setBackgroundThrottling(false);if(main)return;main=w;w.webContents.once('did-finish-load',async()=>{
 const js=s=>w.webContents.executeJavaScript(s),invoke=(a,p={})=>js(`hanama.invoke(${JSON.stringify(a)},${JSON.stringify(p)})`),until=async f=>{for(let i=0;i<200;i++){if(await f())return;await sleep(25);}throw Error('timeout');};
 const settle=async()=>{await w.webContents.capturePage({x:0,y:0,width:1,height:1},{stayHidden:true,stayAwake:true});await sleep(300);},saved=()=>js('JSON.parse(localStorage.getItem("hanama.reading.workspace-position"))');
 const at=async portion=>{await js(`(()=>{const s=[...document.querySelectorAll('.reading-chunk .text-segment')];s[Math.floor(s.length*${portion})].scrollIntoView({block:'start',behavior:'instant'});window.flushReadingPosition();})()`);await settle();return saved();};
 const near=(a,b,label)=>{assert.equal(b.messageId,a.messageId,label);assert.ok(Math.abs(a.rawOffset-b.rawOffset)<120,label+': '+JSON.stringify([a,b]));};
 try{
  await until(()=>js('!document.body.classList.contains("booting")&&!!window.appShell?.workspace'));await settle();
  const before=await at(.4);await js('window.appShell.show("tasks")');
  await invoke('image.move',{storyId:'workspace-position',imageId:'img',position:{messageId:'m',offset:500}});await settle();
  near(before,await saved(),'hidden page must not overwrite saved anchor');
  await js('window.appShell.show("read")');await settle();near(before,await saved(),'return from task page restores anchor after image insertion');
  // Opening an existing visible workspace must save the current position before
  // the visibility event; do not jump back to the last debounced scroll event.
  await js(`(()=>{const s=[...document.querySelectorAll('.reading-chunk .text-segment')];window.nextAnchor=Number(s[Math.floor(s.length*.6)].dataset.rawStart);s[Math.floor(s.length*.6)].scrollIntoView({block:'start',behavior:'instant'});window.appShell.show('read');})()`);await settle();
  assert.ok(Math.abs((await saved()).rawOffset-await js('nextAnchor'))<150,'repeat show(read) should not rewind a freshly scrolled reader');
  await js(`(()=>{document.querySelector('.workspace-edit').click();const s=window.appShell.workspace.capture();let target;const walk=n=>{if(n?.tabs?.includes('reader'))target=n.id;else if(n&&!n.tabs){walk(n.a);walk(n.b);}};walk(s.root);window.appShell.workspace.move('gallery',target,'center');document.querySelector('.workspace-save').click();window.appShell.workspace.open('reader');})()`);await settle();
  const beforeTab=await at(.7);await js('window.appShell.workspace.open("gallery")');
  await invoke('image.move',{storyId:'workspace-position',imageId:'img',position:{messageId:'m',offset:10000}});await settle();near(beforeTab,await saved(),'hidden reader tab must preserve anchor during updates');
  await js('window.appShell.workspace.open("reader")');await settle();near(beforeTab,await saved(),'reader tab restores after hidden DOM update');
  console.log('PASS: task-page return and reader-tab return restore anchors after background image updates; repeat visible navigation preserves a fresh scroll.');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});});setTimeout(()=>{console.error('reader workspace timeout');app.exit(1);},30000).unref();require('../desktop/main.cjs');
