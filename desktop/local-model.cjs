const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),{createHash}=require('node:crypto');
const execute=promisify(execFile);
const defaults={engine:'lmstudio',baseUrl:'http://127.0.0.1:1234/v1',model:'',modelKey:'',contextLength:16384,gpu:'auto',parallel:1,ttl:1800,temperature:0.6,topP:0.9,maxTokens:4096,timeoutSeconds:600,taskReasoning:'auto'};
function settings(input={}){
 const v={...defaults,...input};
 if(!['auto','off'].includes(v.taskReasoning))throw Error('无效的任务思考模式');
 if(!['lmstudio','ollama'].includes(v.engine))throw Error('未知本地引擎');
 const url=new URL(v.baseUrl);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('本地模型地址必须是本机回环地址');
 v.baseUrl=url.href.replace(/\/$/,'');
 for(const [key,min,max] of [['contextLength',2048,262144],['parallel',1,4],['ttl',60,86400],['maxTokens',128,32768],['timeoutSeconds',30,3600],['temperature',0,2],['topP',0.01,1]]){v[key]=Number(v[key]);if(!Number.isFinite(v[key])||v[key]<min||v[key]>max||!['temperature','topP'].includes(key)&&!Number.isInteger(v[key]))throw Error('本地模型参数无效：'+key);}
 if(v.maxTokens>=v.contextLength)throw Error('最大输出长度必须小于上下文长度，给正文输入保留空间');
 if(!['auto','off','max'].includes(v.gpu)){const n=Number(v.gpu);if(!Number.isFinite(n)||n<0||n>1)throw Error('GPU 卸载比例需为 0–1');v.gpu=String(n);}
 for(const key of ['model','modelKey'])if(typeof v[key]!=='string'||v[key].length>1024||v[key].startsWith('-')||/[\r\n\0]/.test(v[key]))throw Error('本地模型标识无效');
 return Object.fromEntries(Object.keys(defaults).map(k=>[k,v[k]]));
}
function connection(config){return config.provider==='local'?{...settings(config.local),apiKey:''}:config;}
function requestBody(config,body){return config.provider==='local'?{temperature:settings(config.local).temperature,top_p:settings(config.local).topP,max_tokens:settings(config.local).maxTokens,...body,model:settings(config.local).model}:{...body,model:config.model};}
async function inspectPackage(file){
 if(typeof file!=='string'||!path.isAbsolute(file)||!file.toLowerCase().endsWith('.gguf'))throw Error('请选择本地 GGUF 文件');
 file=await fs.realpath(file);const dir=path.dirname(file),name=path.basename(file),split=name.match(/^(.*)-(\d{5})-of-(\d{5})\.gguf$/i);
 if(/mmproj/i.test(name))throw Error('这是视觉投影文件，请选择文字模型主文件');
 const count=split?Number(split[3]):1;if(count<1||count>256||split&&(Number(split[2])<1||Number(split[2])>count))throw Error('GGUF 分片编号无效');
 const files=split?Array.from({length:count},(_,i)=>path.join(dir,`${split[1]}-${String(i+1).padStart(5,'0')}-of-${split[3]}.gguf`)):[file];let sizeBytes=0;
 for(const part of files){let h;try{h=await fs.open(part,'r');const stat=await h.stat(),head=Buffer.alloc(8);await h.read(head,0,8,0);if(!stat.isFile()||stat.size<24||head.toString('ascii',0,4)!=='GGUF'||![2,3].includes(head.readUInt32LE(4)))throw Error('不是支持的 GGUF v2/v3 文件');sizeBytes+=stat.size;}catch(e){throw Error(`模型包检查失败：${path.basename(part)} · ${e.code==='ENOENT'?'缺少这个分片，请放到同一目录':e.message}`);}finally{await h?.close();}}
 return {file:files[0],files,sizeBytes,parts:count,name:path.basename(files[0]),repo:'hanama-local/'+createHash('sha256').update(files[0]).digest('hex').slice(0,16)};
}
async function cli(args,timeout=30000){
 const exe=path.join(os.homedir(),'.lmstudio','bin','lms.exe');
 try{const r=await execute(exe,args,{windowsHide:true,timeout,maxBuffer:2*1024*1024,env:{...process.env,NO_COLOR:'1'}});return (r.stdout.trim()||r.stderr.trim()).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');}
 catch(e){if(e.code==='ENOENT')throw Error('未找到 LM Studio 的 lms.exe，请先安装或启用 LM Studio CLI；软件不会自动下载');if(e.killed)throw Error('本地模型引擎响应超时。请检查 LM Studio 的加载状态、内存余量与模型架构；如果模型仍在加载，请等待或在 LM Studio 中停止后重试。');throw Error('本地模型引擎：'+String(e.stderr||e.stdout||e.message).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').slice(-2400));}
}
const json=async args=>JSON.parse(await cli(args));
async function inventory(){const [models,loaded,server]=await Promise.all([json(['ls','--json']),json(['ps','--json']),json(['server','status','--json'])]);return {models:models.filter(m=>m.type==='llm'&&m.format==='gguf'&&!m.deviceIdentifier),loaded,server};}
async function modelsFolder(){try{const s=JSON.parse(await fs.readFile(path.join(os.homedir(),'.lmstudio','settings.json'),'utf8'));if(typeof s.downloadsFolder==='string'&&path.isAbsolute(s.downloadsFolder))return s.downloadsFolder;}catch{}return path.join(os.homedir(),'.lmstudio','models');}
async function sameFile(a,b){try{const [sa,sb]=await Promise.all([fs.stat(a,{bigint:true}),fs.stat(b,{bigint:true})]);return sa.dev===sb.dev&&sa.ino===sb.ino&&sa.ino!==0n;}catch{return false;}}
async function register(file){
 const pack=await inspectPackage(file),key=pack.repo+'/'+pack.name;
 const before=await inventory(),folder=await modelsFolder();
 for(const m of before.models){const target=path.resolve(folder,m.path||m.indexedModelIdentifier||'');if(target.startsWith(path.resolve(folder)+path.sep)&&await sameFile(pack.file,target)&&!String(m.path).startsWith(pack.repo+'/'))return {pack,modelKey:m.indexedModelIdentifier||m.path};}
 // Never use import's default (move), or copy multi-GB weights. Links only.
 for(const part of pack.files){const target=path.join(folder,pack.repo,path.basename(part));if(await sameFile(part,target))continue;try{await cli(['import',part,'--user-repo',pack.repo,'--hard-link','--yes']);}catch(first){try{await cli(['import',part,'--user-repo',pack.repo,'--symbolic-link','--yes']);}catch{throw Error('无法原地关联模型（硬链接/符号链接均失败），没有复制或移动原文件。可在 LM Studio 设置中将模型目录设到同一磁盘后重试。'+first.message);}}}
 let model;for(let attempt=0;attempt<5;attempt++){const after=await inventory();model=after.models.find(m=>m.path===key||m.indexedModelIdentifier===key);if(model)break;await new Promise(r=>setTimeout(r,250));}
 if(!model)throw Error('文件已关联，但 LM Studio 未识别为文字模型，请检查架构支持和分片格式');
 return {pack,modelKey:model.indexedModelIdentifier||model.path};
}
function loadArgs(input,estimate=false){const v=settings(input);if(!v.modelKey)throw Error('请先选择模型包或已有模型');return ['load',v.modelKey,'--context-length',String(v.contextLength),'--parallel',String(v.parallel),'--ttl',String(v.ttl),...(v.gpu==='auto'?[]:['--gpu',v.gpu]),'--yes',...(estimate?['--estimate-only']:['--identifier','hanama-local'])];}
function resolveModel(info,v){const model=info.models.find(m=>m.indexedModelIdentifier===v.modelKey||m.path===v.modelKey||m.modelKey===v.modelKey);if(!model)throw Error('本地模型不在磁盘清单中，请重新选择；不会自动下载');if(info.models.filter(m=>m.modelKey===model.modelKey).length>1)throw Error('LM Studio 中这个模型名称对应多个文件，请在 LM Studio 加载准确版本后，通过「读取接口模型」选择它');if(model.maxContextLength&&v.contextLength>model.maxContextLength)throw Error(`上下文长度超过模型上限 ${model.maxContextLength}`);return {...v,modelKey:model.modelKey};}
async function estimate(input){const v=resolveModel(await inventory(),settings(input));return cli(loadArgs(v,true),90000);}
async function load(input){
 const info=await inventory(),v=resolveModel(info,settings(input));
 if(info.loaded.some(m=>m.identifier==='hanama-local'))throw Error('已有花间序模型在内存中，请先卸载，再以新参数加载');
 const output=await cli(loadArgs(v),600000),loaded=await json(['ps','--json']);if(!loaded.some(m=>m.identifier==='hanama-local'))throw Error('引擎尚未确认模型加载完成，请查看 LM Studio；没有切换当前模型');const server=await json(['server','status','--json']);
 if(!server.running)await cli(['server','start','--port',String(new URL(v.baseUrl).port||1234),'--bind','127.0.0.1']);
 const current=await json(['server','status','--json']);return {output,local:{...v,model:'hanama-local',baseUrl:`http://127.0.0.1:${current.port||1234}/v1`}};
}
async function unload(){const {loaded}=await inventory();if(loaded.some(m=>m.identifier==='hanama-local'))await cli(['unload','hanama-local'],90000);return true;}
async function hardware(){const report={cpu:os.cpus()[0]?.model,threads:os.cpus().length,memoryGB:os.totalmem()/1024**3,freeGB:os.freemem()/1024**3,gpus:[]};try{const {stdout}=await execute('nvidia-smi.exe',['--query-gpu=name,memory.total,memory.free','--format=csv,noheader,nounits'],{windowsHide:true,timeout:10000});report.gpus=stdout.trim().split(/\r?\n/).map(line=>{const [name,total,free]=line.split(',').map(s=>s.trim());return {name,totalMB:Number(total),freeMB:Number(free)};});}catch{report.gpuNote='未能读取 NVIDIA 显存，可用内存仍可检测。';}return report;}
module.exports={defaults,settings,connection,requestBody,inspectPackage,inventory,register,loadArgs,estimate,load,unload,hardware};
