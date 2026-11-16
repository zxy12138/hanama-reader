const test=require('node:test'),assert=require('node:assert/strict'),refusal=require('../desktop/model-refusal.cjs'),jobs=require('../desktop/book-jobs.cjs');
const response=content=>({choices:[{message:{content},finish_reason:'stop'}]}),scene=()=>response(JSON.stringify({prompt:'quiet mountains, no humans',negativePrompt:'people',needsCharacters:false,characterIds:[],characterOutfits:{}}));
test('直接跳过拒绝并持久续跑，旧风景失败不再发送请求，手动跳过保护付费步骤',async()=>{
 const story={id:'s',messages:[{id:'m',text:'甲。\n乙。\n丙。'}],images:[]},job=jobs.create(story,[],'draw');let calls=0,images=0,saved;
 job.units[0].refusalFallback={reason:'原段被拒绝'};
 await jobs.run(job,{story,rules:[],online:true,save:async()=>{saved=JSON.parse(JSON.stringify(job));},call:async(_body,title)=>{calls++;assert.ok(!title.includes('风景替代'));if(job.cursor===1)throw refusal.error('拒绝');return scene();},generate:async()=>({imageId:'i'+(++images)})});
 assert.equal(calls,2);assert.equal(images,1);assert.equal(job.cursor,3);assert.equal(saved.status,'completed');assert.equal(jobs.summary(job).skipped,2);
 await jobs.run(saved,{story,rules:[],call:()=>assert.fail('已跳过的段落不得重发')});
 const manual=jobs.create(story,[],'draw');manual.status='failed';manual.error='空回复';jobs.skipText(manual);assert.equal(manual.cursor,1);assert.equal(manual.error,'');assert.equal(manual.units[0].skipReason,'用户手动跳过');manual.units[1].phase='uncertain';assert.throws(()=>jobs.skipText(manual));assert.equal(manual.cursor,1);
});
test('明确内容拒绝与正文引用、网络权限故障区分',()=>{
 for(const text of ['抱歉，该段内容我无法生成绘图提示词。','抱歉，我无法生成这段内容。',"I'm sorry, I cannot help with this request."])assert.throws(()=>refusal.check(response(text)),{code:'MODEL_CONTENT_REFUSED'});
 for(const text of ['{"caption":"我无法生成这段内容"}','“我不能帮助你。”他说。','API quota exceeded','Invalid API key'])assert.doesNotThrow(()=>refusal.check(response(text)));
 assert.throws(()=>refusal.check({choices:[{message:{refusal:'拒绝'},finish_reason:'stop'}]}),{code:'MODEL_CONTENT_REFUSED'});
 assert.equal(refusal.fromProvider({error:{code:'insufficient_quota'}}),null);
});
test('在线配图拒绝后替代一次，替代仍拒绝则持久跳过并继续；不发送原段到替代请求',async()=>{
 const story={id:'s',messages:[{id:'m',text:'第一段素材。\n第二段素材。\n第三段素材。'}],images:[]},job=jobs.create(story,[],'draw',{refusalPolicy:'landscape'});let images=0,calls=0,saved,recoveries=[];
 await jobs.run(job,{story,rules:[],online:true,onRecovery:(detail,title)=>recoveries.push(title),save:async()=>{saved=JSON.parse(JSON.stringify(job));},call:async(body,title)=>{
  calls++;if(title.includes('风景替代')){assert.ok(!JSON.stringify(body).includes('素材'));assert.equal(body.messages.filter(m=>m.role==='user').length,1);if(job.cursor===0)throw refusal.error('替代也拒绝');return scene();}
  if(job.cursor<2)throw refusal.error('本段拒绝');return scene();
 },generate:async()=>({imageId:'image'+(++images)})});
 assert.equal(job.status,'completed');assert.equal(job.cursor,3);assert.equal(job.units[0].phase,'skipped');assert.ok(saved.units[0].skipReason);assert.equal(images,2);assert.equal(calls,5);assert.ok(recoveries.length>0);assert.ok(recoveries.every(t=>t.startsWith('内容拒绝 ·')));assert.equal(jobs.summary(job).alternatives,1);assert.equal(jobs.summary(job).skipped,1);
 await jobs.run(job,{story,rules:[],call:()=>assert.fail('完成后不能重复请求')});
});
test('本地拒绝、网络故障、已提交绘图失败不自动跳过或重复绘图',async()=>{
 for(const [online,error,paid] of [[false,refusal.error('拒绝'),false],[true,Error('HTTP 429'),false],[true,refusal.error('图像服务拒绝'),true]]){
 const story={id:'s',messages:[{id:'m',text:'一段。'}],images:[]},job=jobs.create(story,[],'draw');let images=0;
 await assert.rejects(jobs.run(job,{story,rules:[],online,save:async()=>{},call:async()=>{if(!paid)throw error;return scene();},generate:async()=>{images++;throw error;}}));
 assert.equal(job.cursor,0);assert.equal(job.status,'failed');assert.equal(images,paid?1:0);if(paid)assert.equal(job.units[0].phase,'uncertain');
 }
});
