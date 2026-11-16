const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {WorkspaceStore}=require('../desktop/workspace-store.cjs');
const make=(id)=>({id,title:id,messages:[{id:'0',name:'正文',text:'春日的樱花。'}],images:[]});
const dataUrl='data:image/png;base64,iVBORw0KGgo=';
test('旧存档迁移图片文件后重启恢复精确位置，重复导入同一故事不丢图',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../.reader-test/store-')),file=path.join(dir,'story.json'),story=make('a');story.images.push({afterId:'0',offset:2,dataUrl,pending:false});await fs.writeFile(file,JSON.stringify({story,rules:[]}));
 const store=new WorkspaceStore(file),loaded=await store.load();await store.save(loaded.story,[]);const raw=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(raw.story.images[0].dataUrl,undefined);assert.equal(raw.gallery[0].dataUrl,undefined);assert.ok(raw.gallery[0].asset);assert.equal((await fs.readdir(path.join(dir,'images'))).length,1);
 const restart=new WorkspaceStore(file),restored=await restart.load();assert.equal(restored.story.images[0].dataUrl,dataUrl);assert.equal(restored.story.images[0].offset,2);const reimport=restart.switchTo(make('a'),restored.story,[]);assert.equal(reimport.story.images.length,1);assert.equal(reimport.story.images[0].pending,false);
});
test('切换故事保留全图库、回收站不删除原图，备份损坏恢复且写入失败不假报保存',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../.reader-test/store-')),file=path.join(dir,'story.json'),store=new WorkspaceStore(file),a=make('a');a.images=[{id:'one',afterId:'0',offset:3,dataUrl}];await store.save(a,[]);const b=store.switchTo(make('b'),a,[]);await store.save(b.story,[]);
 const restart=new WorkspaceStore(file),loaded=await restart.load();assert.equal(loaded.story.id,'b');assert.equal(restart.gallery.length,1);assert.equal(restart.hydrate(restart.archives.a.story).images[0].dataUrl,dataUrl);restart.gallery[0].deletedAt=Date.now();restart.removeEverywhere('one');await restart.save(loaded.story,[]);assert.equal(restart.archives.a.story.images.length,0);assert.equal((await fs.readdir(path.join(dir,'images'))).length,1);
 await fs.writeFile(file,'broken');const backup=new WorkspaceStore(file);assert.equal((await backup.load()).story.id,'b');assert.equal(backup.recovered,true);await fs.writeFile(file+'.bak','also broken');const blocked=new WorkspaceStore(file);await assert.rejects(()=>blocked.load(),/保护/);await assert.rejects(()=>blocked.save(a,[]),/保护/);
});
