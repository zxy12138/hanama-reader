const encodings=['auto','utf-8','gb18030','big5','utf-16le','utf-16be'];
function decode(bytes,encoding='auto'){
 if(!encodings.includes(encoding))throw Error('不支持的文本编码');
 const read=e=>{try{return new TextDecoder(e,{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch{throw Error('文件不符合 '+e+' 编码，请切换其他编码并检查预览');}};
 if(encoding!=='auto')return {text:read(encoding),encoding,encodingDetected:false};
 let bom=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf?'utf-8':null;
 if(bom)return {text:read(bom),encoding:bom,encodingDetected:true};
 // Detect BOM-less UTF-16 ASCII lanes before UTF-8 (NUL is legal UTF-8).
 const n=Math.min(bytes.length,32768);let even=0,odd=0;
 for(let i=0;i<n;i++)if(bytes[i]===0){if(i%2)odd++;else even++;}
 if(n>=4&&(odd>n*.12&&even<odd*.2||even>n*.12&&odd<even*.2)){
  const e=odd>even?'utf-16le':'utf-16be';return {text:read(e),encoding:e,encodingDetected:true};
 }
 try{return {text:read('utf-8'),encoding:'utf-8',encodingDetected:true};}catch{}
 // GB18030 covers GBK/GB2312. Legacy encodings are inherently ambiguous: show a preview.
 try{return {text:read('gb18030'),encoding:'gb18030',encodingDetected:true,encodingWarning:'按 GB18030 / GBK 识别，请检查预览；乱码时可切换 UTF-16 或 Big5'};}catch{}
 throw Error('无法自动识别编码，请手动选择 GB18030 / GBK、UTF-16 或 Big5');
}
module.exports={decode,encodings};
