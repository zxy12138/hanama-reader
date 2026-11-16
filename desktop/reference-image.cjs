// Match the existing Dapeng reference workflow: contain on a supported canvas,
// preserving the whole character instead of cropping it.
function prepareReference(dataUrl,nativeImage){
 const match=/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl||'');
 if(!match)throw Error('角色参考图格式无效');
 const image=nativeImage.createFromBuffer(Buffer.from(match[1],'base64'));
 if(image.isEmpty())throw Error('角色参考图无法解码，请重新导入');
 const {width,height}=image.getSize(),sizes=[[1024,1536],[1472,1472],[1536,1024]];
 const [cw,ch]=sizes.sort((a,b)=>Math.abs(a[0]/a[1]-width/height)-Math.abs(b[0]/b[1]-width/height))[0];
 const scale=Math.min(cw/width,ch/height),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
 const resized=image.resize({width:w,height:h,quality:'best'});let output=resized;
 if(w!==cw||h!==ch){
  const src=resized.toBitmap(),dst=Buffer.alloc(cw*ch*4),x=Math.floor((cw-w)/2),y=Math.floor((ch-h)/2);
  for(let row=0;row<h;row++)src.copy(dst,((y+row)*cw+x)*4,row*w*4,(row+1)*w*4);
  for(let i=3;i<dst.length;i+=4)if(!dst[i])dst[i]=255;
  output=nativeImage.createFromBitmap(dst,{width:cw,height:ch});
 }
 return 'data:image/png;base64,'+output.toPNG().toString('base64');
}
module.exports={prepareReference};
