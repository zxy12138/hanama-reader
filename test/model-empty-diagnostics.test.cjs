const test=require('node:test'),assert=require('node:assert/strict');
const {assertAnswer}=require('../desktop/model-stream.cjs'),{explain}=require('../desktop/service-errors.cjs');
const response=(reason,content='')=>({choices:[{finish_reason:reason,message:{content}}],usage:{prompt_tokens:8100,completion_tokens:92}});
test('空回复不冒充模板故障，保留结束原因与用量',()=>{
 assert.throws(()=>assertAnswer(response('stop')),(e)=>e.code==='MODEL_EMPTY_RESPONSE'&&/输入 tokens：8100/.test(e.message)&&/输出 tokens：92/.test(e.message)&&!e.message.includes('聊天模板'));
 assert.throws(()=>assertAnswer(response('stop'),{local:true}),/不能确定.*聊天模板/);
 assert.throws(()=>assertAnswer(response('context_length_exceeded')),{code:'MODEL_CONTEXT_LIMIT'});
 assert.throws(()=>assertAnswer(response('length'),{maxTokens:4096}),(e)=>e.code==='MODEL_OUTPUT_LIMIT'&&/上下文剩余空间不足/.test(e.message));
 assert.match(explain(Error('context window is full')),/输入与生成所需空间/);
 assert.match(explain(Error('上下文已满')),/每段已独立请求/);
});
