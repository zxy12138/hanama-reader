const test=require('node:test'),assert=require('node:assert/strict'),repeats=require('../desktop/selection-repeats.cjs'),manual=require('../desktop/manual-hide.cjs'),model=require('../reader-model.js');
test('选文精确匹配全部位置，差异文字不删除，选择性屏蔽且一次撤销',()=>{
 const story={id:'s',messages:[{id:'m',text:'前文[提示]后文\n[提示]\n[提 示]结束[提示]'}],images:[{id:'i',afterId:'m',offset:4}]},before=structuredClone(story);
 const r=repeats.scan(story,{start:{messageId:'m',offset:2},end:{messageId:'m',offset:6}});assert.equal(r.matches.length,3);assert.equal(r.matches[0].selected,true);
 const result=repeats.apply(story,r,['1','2']);assert.equal(result.matches,2);assert.equal(story.manualHideHistory.length,1);assert.deepEqual(story.images,before.images);assert.equal(story.messages[0].text,before.messages[0].text);
 assert.equal(model.analyzeMessages(story.messages,[]).messages[0].text,'前文[提示]后文\n\n[提 示]结束');manual.undo(story);assert.equal(model.analyzeMessages(story.messages,[]).messages[0].text,before.messages[0].text);
});
test('跨消息多段选择、CRLF 归一、陈旧预览和伪造选择均受保护',()=>{
 const story={id:'s',messages:[{id:'a',text:'甲\r\n乙'},{id:'b',text:'丙'},{id:'c',text:'乙\n丙'}],images:[]};
 const r=repeats.scan(story,{start:{messageId:'a',offset:2},end:{messageId:'b',offset:1}});assert.equal(r.text,'乙\n丙');assert.equal(r.matches.length,2);
 assert.throws(()=>repeats.apply(story,r,['bad']),/有效/);assert.equal(story.manualHideHistory,undefined);
 repeats.apply(story,r,['0','1']);assert.equal(story.manualHideHistory.length,1);manual.undo(story);assert.throws(()=>repeats.apply(story,r,['0']),/已变化/);
});
test('既有屏蔽与恢复范围保留，批量撤销不会取消之前的屏蔽',()=>{
 const story={id:'s',messages:[{id:'m',text:'甲乙甲乙'}]};manual.hide(story,{start:{messageId:'m',offset:0},end:{messageId:'m',offset:1}});manual.restore(story,{messageId:'m',from:0,to:1});
 const r=repeats.scan(story,{start:{messageId:'m',offset:0},end:{messageId:'m',offset:2}});repeats.apply(story,r,['0','1']);assert.equal(story.manualHideHistory.length,2);manual.undo(story);assert.equal(story.manualHideHistory.length,1);assert.equal(model.analyzeMessages(story.messages,[]).messages[0].text,'甲乙甲乙');
});
