const {test}=require('node:test');const assert=require('node:assert/strict');
const {analyzeMessages,findMatches}=require('../reader-model.js');
const {normalizeAppearance,searchFromAnchor}=require('../reader-model.js');
const {parseStory,exportHtml,storyId}=require('../desktop/core.cjs');
const r={start:'开始',end:'结束',enabled:true,includeBounds:true};
test('起止位于不同消息也能排除，仍保留原文段和每条规则计数',()=>{
 const messages=[{text:'保留开始甲'},{text:'乙\n丙'},{text:'丁结束继续'}];const a=analyzeMessages(messages,[r]);
 assert.deepEqual(a.messages.map(m=>m.text),['保留','','继续']);assert.equal(a.stats[0].matches,1);assert.equal(a.hiddenChars,9);
 assert.equal(a.messages[1].segments[0].text,'乙\n丙');assert.equal(a.messages[1].segments[0].hidden,true);assert.equal(messages[0].text,'保留开始甲');
});
test('保留边界、未匹配、未闭合和禁用均有准确结果',()=>{
 let a=analyzeMessages([{text:'前开始\r\n秘密结束后开始尚未闭合'}],[{...r,includeBounds:false}]);assert.equal(a.messages[0].text,'前开始结束后开始尚未闭合');assert.equal(a.stats[0].unclosed,1);
 a=analyzeMessages([{text:'正文'}],[r]);assert.equal(a.stats[0].matches,0);
 a=analyzeMessages([{text:'开始甲结束'}],[{...r,enabled:false}]);assert.equal(a.messages[0].text,'开始甲结束');
});
test('多规则重叠取并集，不重复计算排除字符',()=>{
 const a=analyzeMessages([{text:'a[b(c]d)e'}],[{...r,start:'[',end:']'},{...r,start:'(',end:')'}]);assert.equal(a.messages[0].text,'ae');assert.equal(a.hiddenChars,7);assert.equal(a.matches,2);
});
test('多行选择的 CRLF 与 LF 标记等价匹配',()=>{
 const a=analyzeMessages([{text:'前开始\r\n甲内容结束后'}],[{...r,start:'开始\n甲'}]);assert.equal(a.messages[0].text,'前后');
});
test('导出和阅读共用跨消息规则，导出不含隐藏原文',()=>{
 const html=exportHtml({title:'书',messages:[{id:'0',name:'甲',text:'好开始秘密'},{id:'1',name:'乙',text:'继续秘密结束哦'}]},[r]);assert.ok(!html.includes('秘密'));assert.ok(html.includes('<div class="prose">好</div>'));assert.ok(html.includes('<div class="prose">哦</div>'));
});
test('搜索按字面匹配中文和正则特殊符号',()=>{assert.deepEqual(findMatches('a.*b.*','.*'),[{start:1,end:3},{start:4,end:6}]);assert.equal(findMatches('你好你好','你好').length,2);assert.deepEqual(findMatches('abc',''),[])});
test('同一本故事重导入有稳定阅读标识，不同故事不混用位置',()=>{const a=parseStory('相同正文','a.txt'),b=parseStory('相同正文','b.txt'),c=parseStory('其他正文','a.txt');assert.equal(a.id,b.id);assert.notEqual(a.id,c.id);assert.equal(a.id,storyId(a.messages))});
test('阅读外观限制字号行距并拒绝无效颜色与字体',()=>{const a=normalizeAppearance({size:80,lineHeight:0,color:'red',font:'unknown'});assert.equal(a.size,36);assert.equal(a.lineHeight,1.4);assert.equal(a.color,'#584550');assert.equal(a.font,'serif');assert.equal(normalizeAppearance({size:24,color:'#123456'}).size,24);assert.equal(normalizeAppearance(null).size,16)});
test('从鼠标对应字符向下搜索，不重置到全文第一项',()=>{const hits=[{messageIndex:0,segmentIndex:0,start:2,end:4},{messageIndex:10,segmentIndex:0,start:3,end:5},{messageIndex:10,segmentIndex:0,start:12,end:14}];assert.deepEqual(searchFromAnchor(hits,{messageIndex:10,segmentIndex:0,offset:6}),{index:2,wrapped:false});assert.deepEqual(searchFromAnchor(hits,{messageIndex:11,segmentIndex:0,offset:0}),{index:0,wrapped:true});assert.equal(searchFromAnchor(hits,{messageIndex:10,segmentIndex:0,offset:6},-1).index,1);assert.equal(searchFromAnchor([],{messageIndex:0,segmentIndex:0,offset:0}).index,-1)});
