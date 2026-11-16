// Text-to-image protocol and estimate adapted from the local Dapeng AI Studio project.
// No package download: ZIP decoding uses Node's bounded in-memory inflater.
const { inflateRawSync } = require('node:zlib');
const { randomInt, createHash, randomUUID } = require('node:crypto');
const { endpoint } = require('./core.cjs');
const models = ['nai-diffusion-5-full','nai-diffusion-5-curated','nai-diffusion-4-5-full','nai-diffusion-4-5-curated','nai-diffusion-4-full','nai-diffusion-4-curated','nai-diffusion-3','nai-diffusion-furry-3'];
const defaults = {baseUrl:'https://image.novelai.net',apiKey:'',model:models[0],width:1216,height:832,steps:28,scale:6,seed:-1};
function parameters(input={}) {
  const p={...defaults,...input};
  if(!models.includes(p.model))throw Error('不支持的 NovelAI 模型');
  for(const k of ['width','height']){p[k]=Number(p[k]);if(!Number.isInteger(p[k])||p[k]<64||p[k]>2048||p[k]%64)throw Error('宽高需为 64–2048 之间的 64 倍数');}
  if(p.width*p.height>3145728)throw Error('图片总像素不能超过 3,145,728');
  p.steps=Number(p.steps);p.scale=Number(p.scale);p.seed=Number(p.seed);
  if(!Number.isInteger(p.steps)||p.steps<1||p.steps>50)throw Error('步数需为 1–50 的整数');
  if(!Number.isFinite(p.scale)||p.scale<0||p.scale>10)throw Error('提示词引导强度需为 0–10');
  if(!Number.isInteger(p.seed)||p.seed< -1||p.seed>4294967295)throw Error('种子需为 -1（随机）或 0–4294967295');
  return p;
}
function parseAccount(raw) {
  const result={balance:null,tier:null,usage:null,checkedAt:Date.now()};
  const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
  function visit(o,depth=0){
    if(!o||typeof o!=='object'||depth>6)return;
    const credits=o.trainingStepsLeft;if(result.balance===null&&num(credits)!==null)result.balance=num(credits);
    if(credits&&typeof credits==='object'){
      const a=num(credits.fixedTrainingStepsLeft),b=num(credits.purchasedTrainingSteps);
      if(a!==null||b!==null)result.balance=(a||0)+(b||0);
    }
    for(const k of ['anlas','anlasBalance','activeAnlas','credits','kudos'])if(result.balance===null&&num(o[k])!==null)result.balance=num(o[k]);
    for(const k of ['tier','subscriptionTier','tierLevel','level','plan'])if(result.tier===null&&num(o[k])!==null)result.tier=num(o[k]);
    if(o.usage&&num(o.usage.percent)!==null)result.usage={percent:Math.max(0,num(o.usage.percent)),isNegative:o.usage.isNegative===true};
    for(const k of ['subscription','information','settings','userData','data','account','user','result'])visit(o[k],depth+1);
  }
  visit(raw);return result;
}
function estimate(input,account=null){
  const p=parameters(input),v5=p.model.startsWith('nai-diffusion-5-');
  const pixels=Math.max(p.width*p.height,65536);
  const referenceCount=input.preciseReferences?.length||0,referenceCost=referenceCount*5;
  const paid=Math.max(2,Math.ceil(Math.ceil(2.951823174884865e-6*pixels+5.753298233447344e-7*pixels*p.steps)*(v5?1.5:1)))+referenceCost;
  const eligible=!referenceCount&&account?.tier>=3&&p.width*p.height<=1048576&&p.steps<=28;
  const quota=account?.usage ? !account.usage.isNegative&&account.usage.percent>0 : null;
  const free=eligible&&(!v5||quota===true);
  return {paid,estimated:free?0:paid,conditionalFree:eligible&&v5&&quota===null,free,accountKnown:account?.tier!=null,referenceCount,referenceCost};
}
function payload(input){
  const p=parameters(input),characters=input.characterPrompts||[];let prompt=String(input.prompt||'').trim(),negative=String(input.negativePrompt||'');
  if(!Array.isArray(characters)||characters.length>(p.model.startsWith('nai-diffusion-5-')?22:p.model.startsWith('nai-diffusion-4-')?6:1)||characters.some(c=>typeof c.prompt!=='string'||!c.prompt.trim()||c.prompt.length>4000||String(c.negativePrompt||'').length>2000))throw Error('角色提示词格式或数量无效');
  if(!/nai-diffusion-[45]-/.test(p.model)&&characters.length){prompt+='\n'+characters.map(c=>c.prompt).join('\n');negative+='\n'+characters.map(c=>c.negativePrompt||'').join('\n');}
  if(!prompt||prompt.length>16000||negative.length>16000)throw Error('请填写画面提示词（正负提示词各不超过 16000 字）');
  const seed=p.seed===-1?randomInt(4294967296):p.seed,v5=p.model.startsWith('nai-diffusion-5-'),v4=/nai-diffusion-[45]-/.test(p.model);
  const params={params_version:4,width:p.width,height:p.height,scale:p.scale,steps:p.steps,sampler:'k_euler_ancestral',n_samples:1,seed,noise_schedule:'karras',uc:negative,negative_prompt:negative,ucPreset:3,uc_preset:3,cfg_rescale:0,legacy:false,legacy_v3_extend:false,dynamic_thresholding:false,skip_cfg_above_sigma:null,qualityPresetId:'none',qualityToggle:false,quality_toggle:false,tag_hint_qt:0,deliberate_euler_ancestral_bug:false,prefer_brownian:true};
  if(v4){params.use_coords=false;params.v4_prompt={caption:{base_caption:prompt,char_captions:[]},use_coords:false,use_order:true};params.v4_negative_prompt={caption:{base_caption:negative,char_captions:[]},use_coords:false,use_order:false,legacy_uc:false};}
  else {params.sm=false;params.sm_dyn=false;}
  if(v5){params.tag_hint_transparent_background=false;params.straight_alpha=false;}
  if(v4&&characters.length){
    const caption=key=>characters.map(c=>({char_caption:c[key]||'',centers:[{x:.5,y:.5}]}));
    params.v4_prompt.caption.char_captions=caption('prompt');params.v4_negative_prompt.caption.char_captions=caption('negativePrompt');
  }
  const refs=input.preciseReferences||[];
  if(refs.length){
    if(!p.model.startsWith('nai-diffusion-4-5-')||refs.length!==1)throw Error('角色参考目前仅支持 V4.5 的单张主要角色参考图');
    const ref=refs[0],match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(ref.dataUrl||'');
    if(!match||Buffer.from(match[2],'base64').length>15*1024*1024||[ref.strength,ref.fidelity].some(n=>!Number.isFinite(n)||n<0||n>1))throw Error('角色参考图或强度参数无效');
    params.director_reference_images=[ref.dataUrl];
    params.director_reference_images_cached=[{cache_secret_key:createHash('sha256').update(Buffer.from(match[2],'base64')).digest('hex'),data:'director_ref_0'}];
    params.normalize_reference_strength_multiple=true;
    params.director_reference_descriptions=[{caption:{base_caption:'character',char_captions:[]},legacy_uc:false}];
    params.director_reference_strength_values=[ref.strength];params.director_reference_secondary_strength_values=[Math.round((1-ref.fidelity)*100)/100];params.director_reference_information_extracted=[1];
  }
  return {input:prompt,model:p.model,action:'generate',parameters:params};
}
function httpBody(payload){
 if(!payload.parameters.director_reference_images?.length)return {body:JSON.stringify(payload),contentType:'application/json'};
 const params={...payload.parameters},refs=params.director_reference_images;delete params.director_reference_images;
 const boundary='hanama-'+randomUUID(),chunks=[],part=(name,value,type,filename)=>{chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),Buffer.isBuffer(value)?value:Buffer.from(value),Buffer.from('\r\n'));};
 part('request',JSON.stringify({...payload,parameters:params}),'application/json','blob');
 refs.forEach((ref,i)=>{const [,mime,data]=/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(ref);part('director_ref_'+i,Buffer.from(data,'base64'),mime,'blob');});
 chunks.push(Buffer.from(`--${boundary}--\r\n`));return {body:Buffer.concat(chunks),contentType:'multipart/form-data; boundary='+boundary};
}
async function limitedBody(response,max){
  if(Number(response.headers.get('content-length'))>max)throw Error('服务返回内容过大');
  const chunks=[];let bytes=0;
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>max)throw Error('服务返回内容过大');chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks);
}
async function call(config,route,body,fetcher=fetch){
  if(!config.apiKey)throw Error('请先配置 NovelAI API Token');
  let response;
  const encoded=body?httpBody(body):null;
  try {response=await fetcher(endpoint(config.baseUrl||defaults.baseUrl,route),{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(body?180000:30000),headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':encoded?.contentType||'application/json'},...(encoded?{body:encoded.body}:{})});}
  catch {throw Error(body?'绘图请求中断或超时，结果和扣费未知，请检查账户后再重试；未自动重试。':'NovelAI 连接失败，请检查网络或系统代理');}
  if(!response.ok){const reasons={401:'Token 无效或已过期',402:'余额或订阅不足',403:'账户无权使用此服务',429:'请求频率过高，请稍候'};throw Error(`NovelAI HTTP ${response.status}：${reasons[response.status]||'服务暂不可用或参数不被支持'}${body?'；未自动重试，失败不代表一定未扣费':''}`);}
  return response;
}
async function account(config,fetcher){const res=await call(config,'user/data',null,fetcher);return parseAccount(JSON.parse((await limitedBody(res,2*1024*1024)).toString('utf8')));}
function png(buffer){return buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));}
function extractImage(raw){
  if(png(raw))return raw;
  let end=-1;
  for(let i=raw.length-22;i>=Math.max(0,raw.length-65557);i--)if(raw.readUInt32LE(i)===0x06054b50&&i+22+raw.readUInt16LE(i+20)===raw.length){end=i;break;}
  if(end<0)throw Error('绘图服务没有返回有效 PNG / ZIP 图片');
  const count=raw.readUInt16LE(end+10);let cursor=raw.readUInt32LE(end+16);
  if(count>64)throw Error('图片压缩包条目过多');
  for(let n=0;n<count;n++){
    if(cursor+46>raw.length||raw.readUInt32LE(cursor)!==0x02014b50)throw Error('图片压缩包已损坏');
    const flags=raw.readUInt16LE(cursor+8),method=raw.readUInt16LE(cursor+10),size=raw.readUInt32LE(cursor+20),unpacked=raw.readUInt32LE(cursor+24),nameLen=raw.readUInt16LE(cursor+28),offset=raw.readUInt32LE(cursor+42);
    const name=raw.toString('utf8',cursor+46,cursor+46+nameLen);
    cursor+=46+nameLen+raw.readUInt16LE(cursor+30)+raw.readUInt16LE(cursor+32);
    if(!/\.png$/i.test(name))continue;
    if(flags&1||unpacked>32*1024*1024||offset+30>raw.length||raw.readUInt32LE(offset)!==0x04034b50)throw Error('图片压缩包格式或大小不受支持');
    const start=offset+30+raw.readUInt16LE(offset+26)+raw.readUInt16LE(offset+28);
    if(start+size>raw.length)throw Error('图片数据不完整');
    const data=raw.subarray(start,start+size),image=method===0?data:method===8?inflateRawSync(data,{maxOutputLength:32*1024*1024}):null;
    if(!image||image.length!==unpacked||!png(image))throw Error('压缩包中的 PNG 图片无效');
    return image;
  }
  throw Error('压缩包中没有 PNG 图片');
}
async function generate(config,input,fetcher){
  const body=payload(input),res=await call(config,'ai/generate-image',body,fetcher);
  const image=extractImage(await limitedBody(res,48*1024*1024));
  return {dataUrl:'data:image/png;base64,'+image.toString('base64'),seed:body.parameters.seed};
}
module.exports={defaults,models,parameters,parseAccount,estimate,payload,httpBody,account,generate,extractImage};
