const test=require('node:test'),assert=require('node:assert/strict'),bookmarks=require('../desktop/bookmarks.cjs');
test('书签精确范围、重复去重、跨段摘录、删除与逐书隔离',()=>{
 const story={messages:[{id:'a',text:'清晨。\n庭院。'},{id:'b',text:'月色。星光。'}]},other={messages:story.messages};
 const args={start:{messageId:'a',offset:4},end:{messageId:'b',offset:3}},item=bookmarks.add(story,args);
 assert.match(item.excerpt,/庭院/);assert.match(item.excerpt,/月色/);assert.equal(bookmarks.add(story,args).id,item.id);assert.equal(story.bookmarks.length,1);assert.equal(other.bookmarks,undefined);
 assert.throws(()=>bookmarks.add(story,{start:args.end,end:args.start}));assert.throws(()=>bookmarks.add(story,{start:{messageId:'missing',offset:0},end:args.end}));
 bookmarks.remove(story,item.id);assert.equal(story.bookmarks.length,0);
});
