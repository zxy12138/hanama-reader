const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto'),core=require('./core.cjs');
const FILE_LIMIT=64*1024*1024,BOOK_LIMIT=128*1024*1024;
async function readBooks(files,options={}){
 if(!Array.isArray(files)||!files.length||files.length>100)throw Error('一次请选择 1–100 个文件');
 const checked=[];let total=0;
 for(const file of files){const real=await fs.realpath(file),stat=await fs.stat(real);if(!stat.isFile()||! /\.(txt|json|jsonl)$/i.test(real))throw Error('请选择 TXT、JSON 或 JSONL 文件');if(stat.size>FILE_LIMIT)throw Error(path.basename(real)+' 超过单文件 64 MB 上限');total+=stat.size;if(total>BOOK_LIMIT)throw Error('本次选择的文件合计超过 128 MB，请分批追加');checked.push({real,stat});}
 const books=[];for(const {real,stat} of checked){let book,decoded;try{decoded=require('./text-encoding.cjs').decode(await fs.readFile(real),options.encoding||'auto');book=core.parseStory(decoded.text,real);}catch(e){if(!options.allowInvalid)throw Error('无法导入「'+path.basename(real)+'」：'+e.message);book={title:path.basename(real,path.extname(real)),messages:[],images:[],importError:e.message};}book.sources=[{path:real,name:path.basename(real),size:stat.size,modifiedAt:stat.mtimeMs,importedAt:Date.now(),contentId:book.id,messageCount:book.messages.length,encoding:decoded?.encoding||options.encoding||'auto',encodingWarning:decoded?.encodingWarning||'',encodingDetected:decoded?.encodingDetected??false}];books.push(book);}return books;
}
function combine(parts,base=null,title=''){
 if(parts.some(p=>p.importError))throw Error('部分文件未正确解码，请先选择编码并检查预览');
 const result=base?structuredClone(base):{title:'',messages:[],images:[],sources:[],useGlobalRules:true};result.sources||=[];
 const seen=new Set(result.sources.map(s=>s.contentId));if(base)seen.add(base.id);
 let added=0,skipped=0,total=result.sources.reduce((n,s)=>n+(s.size||0),0);const included=[];
 for(const part of parts){if(seen.has(part.id)){skipped++;if(!result.sources.some(s=>s.contentId===part.id))result.sources.unshift(...structuredClone(part.sources||[]));continue;}seen.add(part.id);total+=(part.sources||[]).reduce((n,s)=>n+s.size,0);if(total>BOOK_LIMIT)throw Error('合并后的源文件总大小超过 128 MB');
  included.push(part);const prefix=base||included.length>1?randomUUID()+'-':'';result.messages.push(...part.messages.map(m=>({...m,id:prefix+m.id})));result.sources.push(...structuredClone(part.sources||[]));added++;
 }
 if(!result.messages.length)throw Error('没有可以导入的正文');
 if(!base){result.id=core.storyId(result.messages);result.title=(String(title||'').trim()||included[0]?.title||'合并的故事').slice(0,200);}
 if(added)result.contentRevision=(result.contentRevision||0)+1;
 return {story:result,added,skipped};
}
function validateRules(rules){if(!Array.isArray(rules)||rules.length>30||rules.some(r=>!r||typeof r.start!=='string'||typeof r.end!=='string'||!r.start||!r.end||r.start.length>20000||r.end.length>20000||typeof r.enabled!=='boolean'||typeof r.includeBounds!=='boolean'))throw Error('规则格式无效（最多 30 条）');return rules.map(({start,end,enabled,includeBounds})=>({start,end,enabled,includeBounds}));}
function effectiveRules(story,local,global){return [...local,...(story.useGlobalRules?global:[])];}
module.exports={readBooks,combine,validateRules,effectiveRules,FILE_LIMIT,BOOK_LIMIT};
