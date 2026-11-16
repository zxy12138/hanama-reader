// OpenAI-compatible SSE, including reasoning fields returned by external providers.
function cleanMessage(message){
  let content=typeof message.content==='string'?message.content:'',reasoning=message.reasoning_content||message.reasoning||message.thinking||'';
  // Quoted story fragments in JSON may literally contain <think> tags.
  // They are data, not a reasoning envelope, and must survive exact-span cleanup.
  try{JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));return {...message,content:content.trim(),reasoning_content:typeof reasoning==='string'?reasoning:''};}catch{}
  while(/^\s*<think>/i.test(content)){const match=/^\s*<think>([\s\S]*?)<\/think>/i.exec(content);if(!match)break;reasoning+=(reasoning?'\n':'')+match[1];content=content.slice(match[0].length);}
  if(/^\s*<think>/i.test(content)){reasoning+=(reasoning?'\n':'')+content.replace(/^\s*<think>/i,'');content='';}
  return {...message,content:content.trim(),reasoning_content:typeof reasoning==='string'?reasoning:''};
}
const LIMITS={transport:64*1024*1024,event:8*1024*1024,content:4*1024*1024,reasoning:16*1024*1024,tools:2*1024*1024,preview:80000};
const size=value=>Buffer.byteLength(value,'utf8');
const reasoningNote='\n[思考内容较长，仅保留前 80,000 字；模型正文继续完整接收]';
function checkSize(n,limit,label){if(n>limit)throw Error(label+`（已接收 ${(n/1024/1024).toFixed(2)} MB）`+'；已停止接收，未自动重试。已完成批次保留，可从上次位置继续');}
function nativeResult(data,maxTokens){
 if(data.error)return data;
 if(!Array.isArray(data.output))throw Error('本地引擎返回格式无效，缺少 output');
 if(data.output.some(o=>o.type==='tool_call'||o.type==='invalid_tool_call'))throw Error('本次文字任务意外返回工具调用，未应用结果');
 const message={role:'assistant',content:data.output.filter(o=>o.type==='message').map(o=>o.content||'').join(''),reasoning_content:data.output.filter(o=>o.type==='reasoning').map(o=>o.content||'').join('')},stats=data.stats||{};
 return {choices:[{message,finish_reason:stats.total_output_tokens>=maxTokens?'length':'stop'}],usage:{prompt_tokens:stats.input_tokens,completion_tokens:stats.total_output_tokens,completion_tokens_details:{reasoning_tokens:stats.reasoning_output_tokens}}};
}
async function readResponse(response,onUpdate=()=>{},secrets=[],native){
  if(!(response.headers?.get('content-type')||'').includes('text/event-stream')){
    let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.byteLength;checkSize(bytes,LIMITS.transport,'模型响应数据超过 64 MB 安全上限');chunks.push(Buffer.from(chunk));}
    let data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(native)data=nativeResult(data,native.maxTokens);if(data.error)throw require('./model-refusal.cjs').fromProvider(data)||Error('模型在生成过程中返回错误：'+require('./service-errors.cjs').providerError(data,secrets));const message=cleanMessage(data.choices?.[0]?.message||{});
    checkSize(size(message.content),LIMITS.content,'模型实际正文超过 4 MB，可能包含大段重复输出');checkSize(size(message.reasoning_content),LIMITS.reasoning,'模型思考内容超过 16 MB');checkSize(size(JSON.stringify(message.tool_calls||[])),LIMITS.tools,'模型工具参数超过 2 MB');
    if(message.reasoning_content.length>LIMITS.preview)message.reasoning_content=message.reasoning_content.slice(0,LIMITS.preview)+reasoningNote;
    onUpdate(message);return {...data,choices:[{...data.choices?.[0],message}]};
  }
  const decoder=new TextDecoder(),message={role:'assistant',content:'',reasoning_content:''},calls=new Map();let buffer='',finishReason=null,usage,done=false,bytes=0,contentBytes=0,reasoningBytes=0,toolBytes=0,reasoningClipped=false;
  const snapshot=()=>({...message,reasoning_content:message.reasoning_content+(reasoningClipped?reasoningNote:''),...(calls.size?{tool_calls:[...calls.values()].map(c=>({...c,function:{...c.function}}))}:{})});
  function event(block){
    const text=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!text)return;
    if(text==='[DONE]'){done=true;return;}
    let data;try{data=JSON.parse(text);}catch{throw Error('模型流式响应格式不完整');}
    if(data.error)throw Error('模型在生成过程中返回错误：'+require('./service-errors.cjs').providerError(data,secrets));
    if(native){if(data.type==='chat.end')data=nativeResult(data.result||{},native.maxTokens);else if(['message.delta','reasoning.delta'].includes(data.type))data={choices:[{delta:{[data.type==='message.delta'?'content':'reasoning_content']:data.content}}]};else return;}
    if(data.error)throw Error('模型在生成过程中返回错误：'+require('./service-errors.cjs').providerError(data,secrets));
    if(data.usage)usage=data.usage;
    const choice=data.choices?.[0];if(!choice)return;const d=choice.delta||choice.message||{},full=!choice.delta&&!!choice.message;
    if(typeof d.content==='string'){contentBytes=(full?0:contentBytes)+size(d.content);checkSize(contentBytes,LIMITS.content,'模型实际正文超过 4 MB，可能包含大段重复输出');message.content=full?d.content:message.content+d.content;}
    if(typeof d.refusal==='string')message.refusal=(message.refusal||'')+d.refusal;
    const thinking=d.reasoning_content??d.reasoning??d.thinking;if(typeof thinking==='string'){reasoningBytes=(full?0:reasoningBytes)+size(thinking);checkSize(reasoningBytes,LIMITS.reasoning,'模型思考内容超过 16 MB');if(full){message.reasoning_content='';reasoningClipped=false;}const room=LIMITS.preview-message.reasoning_content.length;message.reasoning_content+=thinking.slice(0,room);if(thinking.length>room)reasoningClipped=true;}
    if(full&&d.tool_calls){calls.clear();toolBytes=0;}
    for(const [i,item] of (d.tool_calls||[]).entries()){const key=item.index??(full?i:0),call=calls.get(key)||{id:'',type:'function',function:{name:'',arguments:''}};const fields=[item.id,item.function?.name,item.function?.arguments];toolBytes+=fields.reduce((n,s)=>n+(typeof s==='string'?size(s):0),0);checkSize(toolBytes,LIMITS.tools,'模型工具参数超过 2 MB');if(calls.size>=128&&!calls.has(key))throw Error('模型返回工具调用过多，已停止');if(item.id)call.id+=item.id;if(item.function?.name)call.function.name+=item.function.name;if(item.function?.arguments)call.function.arguments+=item.function.arguments;calls.set(key,call);}
    if(choice.finish_reason)finishReason=choice.finish_reason;
    onUpdate(snapshot());
  }
  for await(const chunk of response.body){bytes+=chunk.byteLength;checkSize(bytes,LIMITS.transport,'模型流式传输超过 64 MB 安全上限');buffer+=decoder.decode(chunk,{stream:true});let match;
    while((match=/\r?\n\r?\n/.exec(buffer))){const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);checkSize(size(block),LIMITS.event,'模型单个数据包超过 8 MB');event(block);if(done)break;}if(done)break;checkSize(size(buffer),LIMITS.event,'模型单个未结束数据包超过 8 MB');
  }
  buffer+=decoder.decode();if(!done&&buffer.trim()){checkSize(size(buffer),LIMITS.event,'模型单个数据包超过 8 MB');event(buffer);}
  if(!done&&!finishReason)throw Error('模型连接提前结束，已收到的内容可在控制台查看；未自动重试');
  const result=cleanMessage(snapshot());if(result.reasoning_content.length>LIMITS.preview)result.reasoning_content=result.reasoning_content.slice(0,LIMITS.preview)+reasoningNote;onUpdate(result);
  return {choices:[{message:result,finish_reason:finishReason}],usage};
}
function assertAnswer(response,{maxTokens,local=false}={}){
 const choice=response.choices?.[0],m=choice?.message||{},reason=choice?.finish_reason;
 require('./model-refusal.cjs').check(response);
 const diagnostic=`结束原因：${typeof reason==='string'?reason.slice(0,100):'服务未返回'}；输入 tokens：${Number.isFinite(response.usage?.prompt_tokens)?response.usage.prompt_tokens:'未知'}；输出 tokens：${Number.isFinite(response.usage?.completion_tokens)?response.usage.completion_tokens:'未知'}`;
 if(['context_length_exceeded','context_window_exceeded','context_full'].includes(reason))throw Object.assign(Error('模型报告上下文容量不足；请缩短本次输入或调整实际加载的上下文长度。'+diagnostic),{code:'MODEL_CONTEXT_LIMIT',usage:response.usage});
 const help=local?'请在「模型与设置 → 本地模型 → 生成参数」提高最大输出长度，或在本地引擎关闭思考模式；长任务也可缩短每批正文。':'请提高输出额度或缩短每批正文。';
 if(reason==='length'){
  const error=new Error(`模型达到输出上限${maxTokens?'（请求上限 '+maxTokens+' tokens）':''}，${!m.content?.trim()&&m.reasoning_content?'只返回了思考内容，尚未输出正文':'回复被截断，未应用不完整结果'}。${help}服务返回 length 也可能表示上下文剩余空间不足，并不证明已用完请求的输出额度。\n${diagnostic}`);
  error.code='MODEL_OUTPUT_LIMIT';
  error.usage=response.usage;
  throw error;
 }
 if(reason==='content_filter')throw Error('模型服务过滤了本次输出，未返回可用结果。请检查本地模型或服务的内容设置。');
 if(!m.content?.trim()&&!m.tool_calls?.length)throw Object.assign(Error((m.reasoning_content?'模型只返回思考内容，没有最终正文。'+help:'模型接口已响应，但没有正文或工具调用。仅凭空回复不能确定是上下文不足、服务异常'+(local?'还是聊天模板不兼容。':'。请查看服务端原始错误。'))+'\n'+diagnostic),{code:'MODEL_EMPTY_RESPONSE',usage:response.usage});
 return response;
}
module.exports={readResponse,cleanMessage,assertAnswer};
