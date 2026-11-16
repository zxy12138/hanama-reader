const test=require('node:test'),assert=require('node:assert/strict'),{find}=require('../desktop/image-location.cjs');
test('图库定位优先当前正文，再找来源书；排除未插入、回收站和失效锚点',()=>{
 const book=(id,pending=false)=>({id,messages:[{id:'m'}],images:[{id:'image',afterId:'m',pending}]}),current=book('current'),source=book('source');
 const workspace={gallery:[{id:'image',sourceStoryId:'source'}],archives:{source:{story:source}},removedBooks:{removed:{story:book('removed')}}};
 assert.equal(find(current,workspace,'image').story.id,'current');
 current.images[0].pending=true;assert.equal(find(current,workspace,'image').story.id,'source');
 source.images[0].afterId='missing';assert.throws(()=>find(current,workspace,'image'),/尚未插入/);
 workspace.gallery[0].deletedAt=1;assert.throws(()=>find(current,workspace,'image'),/回收站/);
});
