// Restore independent settings even if one credential cannot be decrypted.
function restore(saved,defaults,drawingDefaults,decrypt,validateDrawing){
 const issues=[];const config={...defaults},drawing={...drawingDefaults};
 for(const key of ['baseUrl','model','globalPrompt'])if(typeof saved[key]==='string')config[key]=saved[key];
 config.provider=saved.provider==='local'?'local':'cloud';
 config.tagLibraryEnabled=saved.tagLibraryEnabled!==false;
 try{config.local=require('./local-model.cjs').settings(saved.local);}catch{config.local={...require('./local-model.cjs').defaults};issues.push('本地模型参数无效，已恢复默认值，请重新选择模型');}
 for(const key of ['baseUrl','model','width','height','steps','scale','seed'])if(saved.drawing?.[key]!==undefined)drawing[key]=saved.drawing[key];
 let validatedDrawing;try{validatedDrawing=validateDrawing(drawing);}catch{validatedDrawing={...drawingDefaults};issues.push('绘图参数读取失败，已使用默认参数；原配置文件未改动');}
 const unreadable={language:false,drawing:false};
 for(const [name,encrypted,target,label] of [['language',saved.encryptedKey,config,'大模型'],['drawing',saved.drawing?.encryptedKey,validatedDrawing,'NovelAI']]){
  target.apiKey='';if(!encrypted)continue;
  try{target.apiKey=decrypt(Buffer.from(encrypted,'base64'));}catch{unreadable[name]=true;issues.push(label+'密钥暂时无法解密，请重启软件后重试；地址和模型已保留，原密钥不会被覆盖');}
 }
 return {config,drawing:validatedDrawing,root:typeof saved.root==='string'?saved.root:'',issues,unreadable};
}
module.exports={restore};
