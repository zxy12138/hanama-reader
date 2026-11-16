const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const core=require('../desktop/core.cjs'),books=require('../desktop/book-files.cjs'),{WorkspaceStore}=require('../desktop/workspace-store.cjs');
const rule={start:'<私有>',end:'</私有>',enabled:true,includeBounds:true};
const part=(text,name)=>({...core.parseStory(text,name+'.txt'),sources:[{path:name+'.txt',name:name+'.txt',contentId:core.parseStory(text,name+'.txt').id,size:Buffer.byteLength(text)}]});
test('顺序合并仅跳过完整重复文件，保留部分重复章节与唯一消息 ID',()=>{
 const a=part('第一章\n共同段落。','上卷'),b=part('共同段落。\n第二章','下卷'),copy=part(a.messages[0].text,'复制上卷');
 const result=books.combine([b,a,copy],null,'我的书');assert.equal(result.added,2);assert.equal(result.skipped,1);assert.deepEqual(result.story.messages.map(m=>m.text),[b.messages[0].text,a.messages[0].text]);assert.equal(new Set(result.story.messages.map(m=>m.id)).size,2);assert.equal(result.story.sources.length,2);assert.equal(result.story.title,'我的书');
});
test('追加不改变原书、旧消息与图片落点，失败不部分修改原书',()=>{
 const base=part('原书正文','原书');base.images=[{id:'picture',afterId:'0',offset:2}];base.characters=[{id:'c',name:'岚'}];base.plan=[{afterId:'0'}];base.useGlobalRules=false;
 const a=part('后续正文','后续');const before=structuredClone(base),result=books.combine([base,a],base);
 assert.deepEqual(base,before);assert.equal(result.story.id,base.id);assert.deepEqual(result.story.messages[0],base.messages[0]);assert.deepEqual(result.story.images,base.images);assert.deepEqual(result.story.characters,base.characters);assert.equal(result.story.useGlobalRules,false);assert.equal(result.skipped,1);
 const enormous=part('过大','过大');enormous.sources[0].size=books.BOOK_LIMIT+1;assert.throws(()=>books.combine([a,enormous],base),/128 MB/);assert.deepEqual(base,before);
});
test('超过旧 4 MB 限制的正文可读取；源文件大小与路径可追溯',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../.reader-test/book-import-'));const file=path.join(dir,'长篇.txt'),text='春风翻过书页。\n'.repeat(200000);await fs.writeFile(file,text);assert.ok(Buffer.byteLength(text)>4*1024*1024);const [book]=await books.readBooks([file]);assert.equal(book.messages[0].text,text);assert.equal(book.sources[0].size,Buffer.byteLength(text));assert.equal(book.sources[0].path,await fs.realpath(file));
 const oversized=path.join(dir,'过大.txt');const handle=await fs.open(oversized,'w');await handle.truncate(books.FILE_LIMIT+1);await handle.close();await assert.rejects(()=>books.readBooks([oversized]),/64 MB/);await fs.unlink(oversized);
});
test('旧书规则不继承给新书，通用开关逐书保存并跨重启恢复',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../.reader-test/book-rules-')),file=path.join(dir,'story.json');const a=part('旧书','旧书'),b=part('新书','新书');await fs.writeFile(file,JSON.stringify({story:a,rules:[rule]}));
 const store=new WorkspaceStore(file),old=await store.load();assert.equal(books.effectiveRules(old.story,old.rules,store.globalRules).length,1);
 store.globalRules=[{...rule,start:'<通用>',end:'</通用>'}];const fresh=store.switchTo(b,old.story,old.rules);assert.deepEqual(fresh.rules,[]);assert.equal(fresh.story.useGlobalRules,true);assert.equal(books.effectiveRules(fresh.story,fresh.rules,store.globalRules).length,1);
 fresh.story.useGlobalRules=false;await store.save(fresh.story,fresh.rules);const reloaded=new WorkspaceStore(file),saved=await reloaded.load();assert.equal(saved.story.useGlobalRules,false);assert.equal(reloaded.globalRules.length,1);const original=reloaded.switchTo(a,saved.story,saved.rules);assert.deepEqual(original.rules,[rule]);assert.equal(books.effectiveRules(original.story,original.rules,reloaded.globalRules).length,1);
});
test('补记旧书源文件信息时保留规则与插图',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../.reader-test/book-source-')),store=new WorkspaceStore(path.join(dir,'story.json'));const incoming=part('同一本','原文件'),old={...incoming,sources:[],images:[{id:'image',afterId:'0',offset:2}]};const result=store.switchTo(incoming,old,[rule]);assert.equal(result.story.sources.length,1);assert.equal(result.story.images.length,1);assert.deepEqual(result.rules,[rule]);
 const appended=books.combine([part('续篇','续篇')],old).story;const enriched=store.switchTo(incoming,appended,[rule]);assert.equal(enriched.story.sources.length,2);assert.equal(enriched.story.sources[0].contentId,incoming.id);assert.equal(enriched.story.messages.length,2);assert.deepEqual(enriched.story.images.map(({id,afterId,offset})=>({id,afterId,offset})),old.images);
});
