const test=require('node:test'),assert=require('node:assert/strict'),model=require('../reader-model.js'),hide=require('../desktop/manual-hide.cjs'),jobs=require('../desktop/book-jobs.cjs');
test('恢复单段覆盖规则和 AI 屏蔽，重复原文不受影响，重启和重新屏蔽可撤销',()=>{
 const story={messages:[{id:'m',text:'甲[隐藏]乙[隐藏]丙',aiExcluded:[{from:1,to:5}]}],images:[]},rules=[{enabled:true,start:'[',end:']',includeBounds:true}];
 hide.restore(story,{messageId:'m',from:1,to:5});assert.equal(model.analyzeMessages(story.messages,rules).messages[0].text,'甲[隐藏]乙丙');
 const saved=JSON.parse(JSON.stringify(story));assert.equal(model.analyzeMessages(saved.messages,rules).hiddenChars,4);
 hide.hide(story,{start:{messageId:'m',offset:1},end:{messageId:'m',offset:5}});assert.equal(model.analyzeMessages(story.messages,rules).messages[0].text,'甲乙丙');hide.undo(story);assert.equal(model.analyzeMessages(story.messages,rules).messages[0].text,'甲[隐藏]乙丙');
});
test('新配图任务按自然段或合并组选择范围，保持原文落点并拒绝无效范围',()=>{
 const story={messages:[{id:'m',text:'第一段。\n第二段。\n第三段。'}],images:[]};
 const task=jobs.create(story,[],'draw',{group:'paragraph',from:2,to:2});assert.equal(task.units.length,1);assert.equal(task.units[0].pieces[0].start,5);assert.equal(task.units[0].pieces[0].end,10);assert.equal(task.available,3);assert.equal(task.from,2);
 assert.equal(jobs.create(story,[],'draw',{group:'passage'}).units.length,1);assert.throws(()=>jobs.create(story,[],'draw',{from:4}),/起止/);
 const fingerprint=jobs.fingerprint(story,[],'draw');hide.restore(story,{messageId:'m',from:0,to:2});assert.notEqual(jobs.fingerprint(story,[],'draw'),fingerprint);
});
