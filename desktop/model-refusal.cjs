function error(detail,usage){return Object.assign(new Error('模型拒绝生成本段内容：'+String(detail).slice(0,600)),{code:'MODEL_CONTENT_REFUSED',usage});}
function check(response){
 const choice=response.choices?.[0],m=choice?.message||{},text=String(m.content||'').trim();
 if(choice?.finish_reason==='content_filter'||m.refusal)throw error(m.refusal||'服务内容过滤',response.usage);
 // Only recognize an explicit refusal at the start of a plain-text answer, never quoted novel/JSON data.
 if(!/^[{\[`"“]/.test(text)&&/^(?:(?:sorry|i(?:’|')m sorry)[,，.!\s]*|(?:很)?抱歉[，,。！!\s]*)?(?:I\s+(?:cannot|can't|am unable to)\s+(?:help|assist|generate|create|provide)|(?:(?:这|该|此)段?内容)?我(?:无法|不能|没法)(?:帮助|协助|生成|提供|创作)|无法(?:为你|为您)?(?:生成|提供)(?:这|该|此))/i.test(text))throw error(text,response.usage);
 return response;
}
function fromProvider(data){const e=data?.error??data,code=e?.code??e?.type;return ['content_filter','content_policy_violation','safety_violation','moderation_blocked'].includes(code)?error(e.message||code):null;}
module.exports={error,check,fromProvider};
