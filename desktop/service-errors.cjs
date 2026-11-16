function redact(value,secrets=[]){let text=String(value||'');for(const key of secrets.filter(Boolean))text=text.split(key).join('[密钥已隐藏]');return text.replace(/Bearer\s+[^\s"',;]+/gi,'Bearer [已隐藏]').replace(/([?&](?:key|api_key|token|access_token)=)[^&\s]+/gi,'$1[已隐藏]').slice(0,3000);}
function providerError(value,secrets=[]){const e=value?.error??value;if(typeof e==='string')return redact(e,secrets).slice(0,1200);if(!e||typeof e!=='object')return '服务未提供具体原因';return redact([e.code,e.type,e.message].filter(v=>typeof v==='string'||typeof v==='number').join(' · ')||'服务未提供具体原因',secrets).slice(0,1200);}
async function httpError(response,secrets=[]){
 let bytes=0,text='',decoder=new TextDecoder();try{for await(const chunk of response.body){const take=chunk.subarray(0,8192-bytes);bytes+=take.length;text+=decoder.decode(take,{stream:true});if(bytes>=8192)break;}text+=decoder.decode();}catch{}
 let refusal;try{refusal=require('./model-refusal.cjs').fromProvider(JSON.parse(text));}catch{}
 let detail='服务未提供可读的错误说明';try{detail=providerError(JSON.parse(text),secrets);}catch{if(text.trim()&&!/<(?:html|!doctype)/i.test(text))detail=redact(text.trim(),secrets).slice(0,1200);}
 return refusal||Error(`模型服务返回 HTTP ${response.status}：${detail}`);
}
function explain(error,secrets=[]){const raw=redact(error?.message||error,secrets);if(raw.includes('\n处理建议：'))return raw;
 let reason,advice;
 if(/ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ECONNRESET|socket hang up/i.test(raw)){reason='连接在返回过程中断开。可能是网络、代理或服务端关闭了连接，仅凭此错误无法确定是哪一端。';advice='检查网络和代理，稍后点击「重试并继续」。';}
 else if(/TimeoutError|timed?[\s_]*out|timeout|超时/i.test(raw)){reason='等待模型响应超时，可能是服务繁忙、生成较慢或网络延迟。';advice='稍后重试；连续超时可换模型或检查代理。';}
 else if(/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i.test(raw)){reason='无法解析模型服务的域名。';advice='检查服务地址、网络与 DNS/代理设置。';}
 else if(/ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(raw)){reason='目标服务拒绝连接，服务或代理可能未启动。';advice='检查服务地址和端口，确认本地服务或代理正在运行。';}
 else if(/HTTP 401\b|invalid_api_key|authentication_error/i.test(raw)){reason='服务拒绝身份验证，密钥可能失效或不正确。';advice='检查模型设置中的密钥并检测连接。';}
 else if(/HTTP 403\b/.test(raw)){reason='服务拒绝访问，可能涉及模型权限、账号或地区限制。';advice='根据下方服务原始说明检查账号权限。';}
 else if(/HTTP (402|429)\b|insufficient_quota|rate_limit|quota exceeded/i.test(raw)){reason='服务限制了请求，可能是频率、配额或余额不足。';advice='查看下方错误码，检查服务用量与余额；限流时稍后重试。';}
 else if(/overloaded|server is busy|capacity exceeded/i.test(raw)){reason='模型服务报告当前繁忙或处理容量不足。';advice='等待一会再点击「重试并继续」，或切换可用模型。';}
 else if(/context[_ ](?:length[_ ]exceeded|window[_ ]exceeded|full)|maximum context length|context.{0,40}(?:full|exceed)|上下文.{0,15}(?:满|超|不足)/i.test(raw)){reason='本次请求的输入与生成所需空间超过模型上下文容量。';advice='缩短正文、角色档案或提示词，减少预留输出额度，或扩大模型实际加载的上下文；每段已独立请求，重新开会话通常不能解决单次请求过长。';}
 else if(/HTTP 5\d\d\b|internal_server_error/i.test(raw)){reason='模型服务或中间网关返回服务端错误。';advice='稍后重试；持续失败时检查服务状态或换模型。';}
 else if(/HTTP (400|404|422)\b/.test(raw)){reason='服务无法接受当前地址、模型或请求参数。';advice='核对服务地址、模型名称，并参考下方原始说明。';}
 else if(/模型在生成过程中返回错误/.test(raw)){reason='服务在生成过程中报告了错误。具体原因以它返回的错误码和说明为准。';advice='查看下方原始说明；服务未说明原因时可稍后重试。';}
 else return raw;
 return `${reason}\n处理建议：${advice}\n原始错误：${raw}`;
}
module.exports={redact,providerError,httpError,explain};
