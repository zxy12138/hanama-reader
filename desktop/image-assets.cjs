const fs=require('node:fs/promises'),path=require('node:path');
const scheme='hanama-image';
function url(image){return `${scheme}://asset/${encodeURIComponent(image.id)}`;}
function picture(image){const {dataUrl,...metadata}=image;return {...metadata,dataUrl:dataUrl&&!image.missing?url(image):''};}
function cover(value,gallery){if(!value)return null;const image=gallery.find(i=>i.id===value.imageId&&!i.deletedAt&&!i.missing);return {...value,dataUrl:image?url(image):'',missing:!!value.imageId&&!image};}
function view(story,gallery){return {story:{...story,cover:cover(story.cover,gallery),images:(story.images||[]).map(picture)},gallery:gallery.filter(i=>i.kind!=='cover').map(picture)};}
function handler(getStore){return async request=>{
 try{const u=new URL(request.url);if(u.protocol!==scheme+':'||u.hostname!=='asset'||request.method!=='GET')return new Response(null,{status:404});
  const id=decodeURIComponent(u.pathname.slice(1)),store=getStore(),image=store?.gallery.find(p=>p.id===id&&!p.deletedAt&&!p.missing);if(!image)return new Response(null,{status:404});
  let bytes,mime;
  if(/^[a-f0-9]{64}\.(png|jpeg|webp)$/.test(image.asset||'')){mime='image/'+path.extname(image.asset).slice(1);bytes=await fs.readFile(path.join(store.dir,'images',image.asset));}
  else {const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.dataUrl||'');if(!match)return new Response(null,{status:404});mime=match[1];bytes=Buffer.from(match[2],'base64');}
  return new Response(bytes,{headers:{'Content-Type':mime,'Content-Length':String(bytes.length),'Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response(null,{status:404});}
};}
module.exports={scheme,url,picture,cover,view,handler};
