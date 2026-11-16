const {randomUUID}=require('node:crypto');
function createActivity(send,secrets=()=>[]){
  let entries=[];
  const clean=value=>{let text=String(value||'');for(const key of secrets().filter(Boolean))text=text.split(key).join('[密钥已隐藏]');return text.length>80000?text.slice(0,80000)+'\n[控制台仅保留前 80,000 字]':text;};
  function update(id,patch){const row=entries.find(e=>e.id===id);if(!row)return;for(const [k,v] of Object.entries(patch))if(['title','status','detail','reasoning','answer'].includes(k))row[k]=clean(v);else if(k==='usage'||k==='retry')row[k]=v;row.updated=Date.now();send({...row});return row;}
  function start(title,detail=''){const row={id:randomUUID(),time:Date.now(),title:clean(title),detail:clean(detail),status:'运行中',reasoning:'',answer:''};entries.push(row);if(entries.length>60)entries.shift();send({...row});return row.id;}
  return {start,update,list:()=>entries.map(e=>({...e})),clear:()=>{entries=[];send({clear:true});}};
}
module.exports={createActivity};
