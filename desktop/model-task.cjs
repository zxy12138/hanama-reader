const {parse}=require('./model-contracts.cjs');
async function run({body,contract,request,signal,onCorrection=()=>{},onFinish=()=>{}}){let next=body,attempts=0,normalized=false,usage={},lastError;
 try{for(let attempt=0;attempt<2;attempt++){
  signal?.throwIfAborted();attempts++;const response=await request(next,attempt);
  for(const k of ['prompt_tokens','completion_tokens','total_tokens'])if(Number.isFinite(response.usage?.[k]))usage[k]=(usage[k]||0)+response.usage[k];
  const raw=response.choices?.[0]?.message?.content||'';try{const value=contract.validate(parse(raw)),content=JSON.stringify(value);normalized=content!==raw.trim();await onFinish({kind:contract.kind,ok:true,attempts,normalized,usage});return {...response,usage:{...response.usage,...usage},choices:[{...response.choices[0],message:{...response.choices[0].message,content}}],validation:{kind:contract.kind,attempts,normalized}};}
  catch(e){if(e.code!=='MODEL_OUTPUT_INVALID')throw e;lastError=e;if(attempt===1)break;signal?.throwIfAborted();await onCorrection(e.message);
   const correction='\n\n上一轮结果未通过校验：'+e.message+'\n请重新完成原任务，只返回符合格式的完整 JSON。'+contract.hint;
   const messages=body.messages.map(m=>({...m}));if(messages[0]?.role==='system')messages[0].content+=correction;else messages.unshift({role:'system',content:correction});next={...body,messages};
  }
 }throw Error('已自动纠正 1 次，结果仍未通过校验：'+lastError.message+'；未应用这份结果，可缩小范围后重试。');
 }catch(e){await onFinish({kind:contract.kind,ok:false,attempts,normalized:false,usage,canceled:signal?.aborted===true});throw e;}
}
module.exports={run};
