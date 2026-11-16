const test=require('node:test'),assert=require('node:assert/strict'),jobs=require('../desktop/book-jobs.cjs');
const story=text=>({id:'s',messages:[{id:'m',text}],images:[]});
test('按自定义字数分组，张数、范围与原文坐标一致，旧任务默认兼容',()=>{
 const s=story('甲'.repeat(2400));
 for(const [chars,count] of [[800,3],[1000,3],[2000,2]]){
  const j=jobs.create(s,[],'draw',{group:'passage',charsPerImage:chars});assert.equal(j.units.length,count);assert.equal(j.charsPerImage,chars);assert.equal(jobs.summary(j).charsPerImage,chars);
  assert.equal(j.units.flatMap(u=>u.pieces).map(p=>s.messages[0].text.slice(p.start,p.end)).join(''),s.messages[0].text);
  assert.ok(j.units.every(u=>u.pieces.reduce((n,p)=>n+p.end-p.start,0)<=chars));
 }
 const range=jobs.create(s,[],'draw',{group:'passage',charsPerImage:800,from:2,to:2});assert.equal(range.units[0].pieces[0].start,800);assert.equal(range.units[0].pieces[0].end,1600);
 const old=jobs.create(s,[],'draw',{group:'passage'});delete old.charsPerImage;assert.equal(jobs.summary(old).charsPerImage,2000);
 for(const n of [0,99,6001,800.5,'',null,'oops'])assert.throws(()=>jobs.create(s,[],'draw',{group:'passage',charsPerImage:n}),/配图字数/);
 assert.equal(jobs.create(s,[],'clean',{charsPerImage:800}).units.length,1);
});
test('自定义分组暂停存档后续跑，不重分段或重复已完成图片',async()=>{
 const s=story(('甲'.repeat(799)+'😀').repeat(3)),j=jobs.create(s,[],'draw',{group:'passage',charsPerImage:800});let pause=false,calls=0,images=0;
 const original=JSON.stringify(j.units.map(u=>u.pieces));
 const ctx={story:s,rules:[],save:async()=>{},paused:()=>pause,call:async()=>{calls++;return {choices:[{message:{content:JSON.stringify({prompt:'garden',negativePrompt:''})},finish_reason:'stop'}]};},generate:async()=>{images++;pause=true;return {imageId:'i'+images};}};
 await jobs.run(j,ctx);assert.equal(j.cursor,1);const resumed=JSON.parse(JSON.stringify(j));pause=false;
 await jobs.run(resumed,{...ctx,paused:()=>false});assert.equal(resumed.status,'completed');assert.equal(calls,resumed.units.length);assert.equal(images,resumed.units.length);assert.equal(JSON.stringify(resumed.units.map(u=>u.pieces)),original);
});
