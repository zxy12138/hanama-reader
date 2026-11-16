const defaults={enabled:true,prompt:'anime style, clean lineart, soft cel shading, visual novel',negativePrompt:'photorealistic, 3d, oil painting, watercolor, sketch'};
function settings(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('画风设置无效');
 const result={...defaults,...value};
 if(typeof result.enabled!=='boolean')throw Error('画风开关无效');
 for(const key of ['prompt','negativePrompt']){if(typeof result[key]!=='string'||result[key].length>2000)throw Error('画风提示词最多 2000 字');result[key]=result[key].trim();}
 if(result.enabled&&!result.prompt)throw Error('启用统一画风时，请填写画风标签');
 return {enabled:result.enabled,prompt:result.prompt,negativePrompt:result.negativePrompt};
}
// Only remove whole, recognized style tags. Preserve story objects, lighting and actions.
const styles=/^(?:anime(?: style)?|manga(?: style)?|visual novel(?: style)?|photorealistic|photo realism|realistic|3d(?: render)?|cgi|oil painting|watercolou?r(?: \(medium\))?|sketch|pencil sketch|pixel art|(?:soft )?cel shading|clean lineart|lineart|artist:.+)$/i;
function join(...values){return [...new Set(values.flatMap(v=>String(v||'').split(/[,\n]/)).map(v=>v.trim()).filter(Boolean))].join(', ');}
function strip(value){return String(value||'').split(/[,\n]/).map(v=>v.trim()).filter(v=>v&&!styles.test(v.replace(/^[\d.]+::|::$/g,'').replace(/^[{\[]+|[}\]]+$/g,'').replaceAll('_',' '))).join(', ');}
function apply(input,value){const style=settings(value);if(!style.enabled)return {prompt:String(input.prompt||''),negativePrompt:String(input.negativePrompt||''),style};
 return {prompt:join(strip(input.prompt),style.prompt),negativePrompt:join(strip(input.negativePrompt),style.negativePrompt),style};
}
function policy(value){const s=settings(value);return s.enabled?'本书画风已固定为 '+s.prompt+'。画面 prompt 仅描述内容、动作、环境、构图和光照；不要加入其他画风、画师、媒介或渲染风格。软件会统一追加画风。':'';}
module.exports={defaults,settings,apply,policy,strip};
