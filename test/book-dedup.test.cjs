const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const dedup=require('../desktop/book-dedup.cjs'),{WorkspaceStore}=require('../desktop/workspace-store.cjs'),model=require('../reader-model.js'),core=require('../desktop/core.cjs');
const paragraph='春风从门前经过，远处的山峰仍然安静，旅人整理行囊，继续沿着溪水向前走。'.repeat(7);
const book=(id,text)=>({id,title:id,messages:[{id:'0',name:'正文',text}],images:[]});
test('永久删除仅限已移除书，主存档和备份都不复活，失败保留恢复入口',async()=>{
 const parent=path.resolve(__dirname,'../.reader-test');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'delete-books-')),file=path.join(dir,'story.json'),store=new WorkspaceStore(file),current=book('current','正在阅读'),removed=book('removed','将删除的存档');
 removed.bookJobs={clean:{cursor:8}};store.remember(removed,[]);await store.save(current,[]);store.removeBook(removed.id,current,[]);await store.save(current,[]);
 store.gallery.push({id:'shared',sourceStoryId:removed.id,caption:'独立图库图片'});
 await assert.rejects(store.deleteRemovedBook(current.id,current,[]),/只能永久删除/);
 const atomic=store.atomic.bind(store);store.atomic=async()=>{throw Error('模拟磁盘失败')};await assert.rejects(store.deleteRemovedBook(removed.id,current,[]),/模拟磁盘失败/);assert.ok(store.removedBooks[removed.id]);store.atomic=atomic;
 await store.deleteRemovedBook(removed.id,current,[]);assert.equal(store.gallery.length,1);assert.throws(()=>store.restoreBook(removed.id),/不在已移除/);
 for(const name of [file,file+'.bak']){const saved=JSON.parse(await fs.readFile(name,'utf8'));assert.equal(saved.removedBooks[removed.id],undefined);assert.equal(saved.archives[removed.id],undefined);assert.equal(saved.story.id,current.id);}
 const reload=new WorkspaceStore(file);await reload.load();assert.throws(()=>reload.restoreBook(removed.id),/不在已移除/);
 await fs.writeFile(file,'broken');const backup=new WorkspaceStore(file);await backup.load();assert.ok(backup.recovered);assert.equal(backup.removedBooks[removed.id],undefined);
 const fresh=backup.switchTo(removed,current,[]);assert.deepEqual(fresh.rules,[]);
});
test('只查完全相同长段，短句/近似/不同说话人保留',()=>{
 for(const text of ['好的。\n好的。',paragraph+'\n'+paragraph.replace('安静','热闹')])assert.equal(dedup.scan(book('a',text)).candidates.length,0);
 const s=book('a',paragraph);s.messages.push({id:'1',name:'其他人物',text:paragraph});assert.equal(dedup.scan(s).candidates.length,0);
 const exact=dedup.scan(book('a',paragraph+'\n'+paragraph));assert.equal(exact.candidates.length,1);assert.equal(exact.candidates[0].remove[0].from,paragraph.length+1);
});
test('多段重叠只隐藏确认后份，保留首份和差异剧情，原文/图锚不动且可撤销',()=>{
 const s=book('a',paragraph+'\n独有剧情。\n'+paragraph+'\n下一章新剧情。');s.images=[{id:'image',afterId:'0',offset:s.messages[0].text.length}];const original=s.messages[0].text,review=dedup.scan(s);
 assert.equal(dedup.apply(s,review,[]).count,0);assert.equal(s.messages[0].dedupExcluded,undefined);
 dedup.apply(s,review,['0']);const visible=model.analyzeMessages(s.messages,[]).messages[0].text;assert.equal(visible.split(paragraph).length-1,1);assert.ok(visible.includes('独有剧情。')&&visible.includes('下一章新剧情。'));assert.equal(s.messages[0].text,original);assert.equal(s.images[0].offset,original.length);assert.equal(dedup.scan(s).candidates.length,0);
 assert.equal(core.exportHtml(s,[]).split(paragraph).length-1,1);dedup.undo(s);assert.equal(model.analyzeMessages(s.messages,[]).messages[0].text,original);
});
test('连续短段组成长块可检测；保留段绝不指向另一候选删除区',()=>{
 const a='花园开场。'.repeat(12),b='走向庭院。'.repeat(12),text=[a,b,a,b,a,b].join('\n'),s=book('a',text),review=dedup.scan(s);assert.ok(review.candidates.length>=1);
 for(const c of review.candidates)for(const keep of c.keep)for(const d of review.candidates)for(const remove of d.remove)assert.ok(keep.messageIndex!==remove.messageIndex||keep.to<=remove.from||keep.from>=remove.to);
 dedup.apply(s,review,review.candidates.map(c=>c.id));assert.equal(model.analyzeMessages(s.messages,[]).messages[0].text.trim(),a+'\n'+b);
});
test('陈旧预览或伪造选择不修改正文，新增去重会使配图旧任务失效',()=>{
 const s=book('a',paragraph+'\n'+paragraph),r=dedup.scan(s);assert.throws(()=>dedup.apply(s,r,['missing']),/无效/);assert.equal(s.messages[0].dedupExcluded,undefined);
 s.messages[0].text+='变化';assert.throws(()=>dedup.apply(s,r,['0']),/已变化/);s.messages[0].text=paragraph+'\n'+paragraph;
 const jobs=require('../desktop/book-jobs.cjs'),j=jobs.create(s,[],'draw');dedup.apply(s,dedup.scan(s),['0']);assert.notEqual(j.fingerprint,jobs.fingerprint(s,[],'draw'));
});
test('移出当前/非当前/最后一本后可恢复，重启保留独立规则和去重',async()=>{
 const parent=path.resolve(__dirname,'../.reader-test');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'removed-books-')),file=path.join(dir,'story.json');const store=new WorkspaceStore(file),a=book('a',paragraph+'\n'+paragraph),b=book('b','第二本');const rules=[{start:'a',end:'b',enabled:true,includeBounds:true}];
 dedup.apply(a,dedup.scan(a),['0']);store.remember(b,[]);await store.save(a,rules);
 let next=store.removeBook('b',a,rules);assert.equal(next.story.id,'a');assert.ok(store.removedBooks.b);next=store.removeBook('a',next.story,next.rules);assert.equal(next.story.messages.length,0);await store.save(next.story,next.rules);
 const restored=new WorkspaceStore(file);await restored.load();assert.equal(Object.keys(restored.archives).length,0);assert.equal(Object.keys(restored.removedBooks).length,2);
 restored.restoreBook('a');const back=restored.switchTo(a,next.story,next.rules);assert.equal(back.rules.length,1);assert.equal(back.story.messages[0].dedupExcluded.length,1);assert.equal(Object.keys(restored.removedBooks).length,1);
 // Reimport a removed original restores its saved state instead of losing it.
 const second=restored.switchTo(b,back.story,back.rules);assert.equal(second.story.id,'b');assert.equal(Object.keys(restored.removedBooks).length,0);
});
