const fs=require('node:fs/promises'),path=require('node:path');
function create(file){let rows=[],loaded=false;async function load(){if(loaded)return;try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(data))throw Error('统计文件格式无效');rows=data.slice(-200);}catch(e){if(e.code!=='ENOENT')throw e;}loaded=true;}
 const summarize=()=>{const completed=rows.filter(r=>!r.canceled),failed=completed.filter(r=>!r.ok).length;return {total:completed.length,failed,retried:completed.filter(r=>r.attempts>1).length,firstFailed:completed.filter(r=>r.attempts>1||!r.ok).length,canceled:rows.length-completed.length,rate:completed.length?failed/completed.length:null,scope:'最近 200 个结构化文字任务，取消不计入；不含生图效果评分'};};
 return {async info(){await load();return summarize();},async record(row){await load();rows.push({time:Date.now(),kind:row.kind,ok:row.ok,attempts:row.attempts,canceled:row.canceled===true,model:row.model,provider:row.provider});rows=rows.slice(-200);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(rows));await fs.rename(file+'.tmp',file);return summarize();}};
}
module.exports={create};
