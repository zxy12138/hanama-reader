const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { analyzeMessages } = require('../reader-model.js');
const layout=require('../story-layout.js');
let fetchRequest=(...args)=>fetch(...args);
function setFetch(fn){fetchRequest=fn;}

function endpoint(base, route) {
  if(typeof base!=='string'||!base.trim())throw Error('接口地址未加载或尚未配置，请打开「模型与设置」检查 Base URL');
  let url;try{url=new URL(base.trim());}catch{throw Error('接口地址格式无效，请使用完整地址，例如 https://ollama.com/v1');}
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw Error('接口需使用 HTTPS；本地服务可使用 HTTP');
  if (url.username || url.password || url.search || url.hash) throw Error('Base URL 不应包含账号、参数或片段');
  return url.href.replace(/\/$/, '') + '/' + route;
}
async function request(config, route, body) {
  const response = await fetchRequest(endpoint(config.baseUrl, route), {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(90000),
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw Error(`模型服务返回 HTTP ${response.status}，请检查地址、密钥和模型权限`);
  return response.json();
}
async function streamChat(config,body,onUpdate,signal){
  // Bound model output as well as local memory. Respect callers using either token field.
  if(body.max_tokens===undefined&&body.max_completion_tokens===undefined)body={...body,max_tokens:32768};
  const timeout=Number.isFinite(config.timeoutSeconds)?Math.min(3600000,Math.max(30000,config.timeoutSeconds*1000)):240000;
  const messages=body.messages||[],native=config.engine==='lmstudio'&&config.taskReasoning==='off'&&!body.tools?.length&&messages.filter(m=>m.role==='user').length===1&&messages.every(m=>['system','user'].includes(m.role));
  if(native){const url=new URL(endpoint(config.baseUrl,'chat/completions'));url.pathname='/api/v1/chat';const response=await fetchRequest(url.href,{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),headers:{'Content-Type':'application/json'},body:JSON.stringify({model:body.model,system_prompt:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),input:messages.find(m=>m.role==='user').content,reasoning:'off',store:false,integrations:[],stream:true,max_output_tokens:body.max_tokens,temperature:Math.min(1,body.temperature??0.6),top_p:body.top_p??0.9})});if(!response.ok)throw await require('./service-errors.cjs').httpError(response,[]);return require('./model-stream.cjs').readResponse(response,onUpdate,[],{maxTokens:body.max_tokens});}
  const response=await fetchRequest(endpoint(config.baseUrl,'chat/completions'),{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:`Bearer ${config.apiKey}`}:{})},body:JSON.stringify({...body,stream:true})});
  if(!response.ok)throw await require('./service-errors.cjs').httpError(response,[config.apiKey]);
  return require('./model-stream.cjs').readResponse(response,onUpdate,[config.apiKey]);
}
function exclude(text, rules) {
  return analyzeMessages([{text}], rules).messages[0].text;
}
function storyId(messages) { return createHash('sha256').update(JSON.stringify(messages.map(m=>[m.name,m.text]))).digest('hex'); }
function parseStory(content, filename) {
  let rows;
  if (/\.txt$/i.test(filename)) rows = [{ name: '正文', mes: content }];
  else if (/\.jsonl$/i.test(filename)) rows = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(s => s.trim()).map((s, i) => { try { return JSON.parse(s); } catch { throw Error(`第 ${i + 1} 行 JSON 无效`); } });
  else { const json = JSON.parse(content.replace(/^\uFEFF/, '')); rows = Array.isArray(json) ? json : json.messages || json.chat; }
  if (!Array.isArray(rows)) throw Error('未识别的对话格式，需要消息数组或 SillyTavern JSONL');
  const messages = rows.filter(r => r && (typeof r.mes === 'string' || typeof r.content === 'string')).map((r, i) => ({ id: String(i), name: String(r.name || r.role || '旁白'), text: r.mes ?? r.content, isUser: !!r.is_user || r.role === 'user' }));
  if (!messages.length) throw Error('文件中未找到对话内容');
  return { id: storyId(messages), title: path.basename(filename, path.extname(filename)), messages, images: [] };
}
async function withinRoot(root, target) {
  if (!root) throw Error('请先选择并授权工作文件夹');
  const realRoot = await fs.realpath(root), realTarget = await fs.realpath(path.resolve(root, target || '.'));
  const relative = path.relative(realRoot, realTarget);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('路径超出授权文件夹');
  return realTarget;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function exportHtml(story, rules) {
  const cleaned = analyzeMessages(story.messages, rules);
  const paragraphs=story.messages.map((m,index)=>`<section><h3>${escapeHtml(m.name)}</h3><div class="prose">${layout.flow(m,cleaned.messages[index],story.images||[]).map(item=>item.type==='image'?(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.image.dataUrl)?`<img src="${item.image.dataUrl}" alt="${escapeHtml(item.image.caption||'')}">`:''):item.hidden?'':escapeHtml(item.text)).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${escapeHtml(story.title)}</title><style>body{max-width:780px;margin:50px auto;padding:25px;background:#fffafb;color:#584550;font:17px/2 serif}h1{text-align:center}h3{font:13px sans-serif;color:#b77391}.prose{white-space:pre-wrap}section{margin:30px 0}img{display:block;max-width:100%;border-radius:12px;margin:16px auto}</style><h1>${escapeHtml(story.title)}</h1>${paragraphs}</html>`;
}
async function listModels(config){
  if(new URL(config.baseUrl).hostname==='ollama.com'){
    const response=await request({...config,baseUrl:'https://ollama.com/api'},'tags');
    if(!Array.isArray(response.models))throw Error('Ollama 未返回模型列表');
    return response.models.map(m=>m.name).filter(id=>typeof id==='string').sort();
  }
  const response=await request(config,'models');
  if(!Array.isArray(response.data))throw Error('接口未返回 data 模型列表');
  return response.data.map(m=>m.id).filter(id=>typeof id==='string').sort();
}
module.exports = { endpoint, request, streamChat, exclude, parseStory, withinRoot, exportHtml, storyId, analyzeMessages, setFetch, listModels };
