window.GalleryUI={create({run,getState,onState,render,notify}){
 const root=document.createElement('div');root.id='galleryContent';root.innerHTML='<div class="gallery-toolbar"><input id="gallerySearch" class="text-field" placeholder="搜索图片标题、提示词…" aria-label="搜索图库"><select id="galleryFilter" class="text-field"><option value="all">全部图片</option><option value="current">当前故事</option><option value="pending">未插入当前故事</option><option value="trash">回收站</option></select></div><p id="gallerySummary" class="studio-note"></p><div id="galleryGrid" class="gallery-grid"></div><p class="studio-note">拖动缩略图到正文文字间即可插入。移除正文保留原图；删除进入回收站，可恢复。</p>';
 let signature='';const $=id=>root.querySelector('#'+id);async function action(name,args){try{onState(await run(name,args));render();}catch(e){notify(e.message);}}
 let clearing=false;const clearImages=document.createElement('button');clearImages.id='clearStoryImages';clearImages.className='btn';clearImages.textContent='清除本书全部配图';clearImages.title='一键移除当前书正文里的所有插图，图库原图保留，不受搜索和筛选影响';clearImages.disabled=true;
 root.querySelector('.gallery-toolbar').append(clearImages);
 clearImages.onclick=async()=>{
  const s=getState();if(clearing||!s?.story.id)return;clearing=true;clearImages.disabled=true;
  try{const result=await run('image.removeAll',{storyId:s.story.id});onState(result.state);render();notify(`已清除本书正文中的 ${result.removedCount} 张配图，原图保留在图库，可再次拖入正文。`);}
  catch(e){notify(e.message);}finally{clearing=false;update();}
 };
 const layoutKey='hanama.gallery.layout.v1';
 $('gallerySummary').before(Object.assign(document.createElement('div'),{className:'gallery-layout',innerHTML:'<label>排列方式<select id="galleryColumns" class="text-field"><option value="0">按大小自动排列</option>'+Array.from({length:10},(_,i)=>`<option value="${i+1}">每行 ${i+1} 张</option>`).join('')+'</select></label><label>缩略图大小 <output id="gallerySizeLabel"></output><input id="gallerySize" type="range" min="100" max="400" step="10" value="180"></label>'}));
 function applyLayout(value){const columns=Math.min(10,Math.max(0,Math.round(Number(value?.columns)||0))),size=Math.min(400,Math.max(100,Math.round((Number(value?.size)||180)/10)*10));$('galleryColumns').value=String(columns);$('gallerySize').value=size;$('gallerySizeLabel').textContent=size+' px'+(columns?' · 调整图片高度':'');root.style.setProperty('--gallery-size',size+'px');root.style.setProperty('--gallery-columns',columns?`repeat(${columns}, minmax(0, 1fr))`:`repeat(auto-fill, minmax(min(100%, ${size}px), 1fr))`);}
 function readLayout(){try{return JSON.parse(localStorage.getItem(layoutKey));}catch{return {};}}
 function saveLayout(){const v={columns:Number($('galleryColumns').value),size:Number($('gallerySize').value)};applyLayout(v);try{localStorage.setItem(layoutKey,JSON.stringify(v));}catch{notify('图库显示设置暂时无法保存');}}
 applyLayout(readLayout());$('galleryColumns').onchange=saveLayout;$('gallerySize').oninput=saveLayout;window.addEventListener('storage',e=>{if(e.key===layoutKey)applyLayout(readLayout());});
 function update(){const s=getState();if(!s)return;const pictures=s.gallery||s.story.images||[],filter=$('galleryFilter').value,query=$('gallerySearch').value.trim().toLowerCase();const placed=new Map(s.story.images.filter(i=>!i.pending).map(i=>[i.id,i]));
 clearImages.disabled=clearing||placed.size===0;clearImages.textContent=clearing?'正在清除…':`清除本书全部配图${placed.size?'（'+placed.size+'）':''}`;
 const key=JSON.stringify([s.story.id,pictures.map(i=>[i.id,i.deletedAt,i.missing]),[...placed.keys()],filter,query]);if(key===signature)return;signature=key;
 const items=pictures.filter(i=>(filter==='trash'?!!i.deletedAt:!i.deletedAt)&&(filter!=='current'||i.sourceStoryId===s.story.id||s.story.images.some(p=>p.id===i.id))&&(filter!=='pending'||!placed.has(i.id))&&(!query||(i.caption+' '+i.prompt+' '+i.sourceTitle).toLowerCase().includes(query))).slice().reverse();
 $('gallerySummary').textContent=`${items.length} 张图片 · ${placed.size} 张已插入当前故事`;$('galleryGrid').replaceChildren();
 for(const p of items){const card=document.createElement('article');card.className='gallery-card';card.dataset.galleryId=p.id;const img=document.createElement('img');img.src=p.dataUrl||'';img.alt=p.caption||'故事插图';img.loading='lazy';img.draggable=!p.deletedAt&&!p.missing;img.dataset.previewImage=p.id;if(!p.deletedAt&&!p.missing){img.tabIndex=0;img.setAttribute('role','button');img.title='点击编辑提示词 / 重绘';const edit=()=>document.dispatchEvent(new CustomEvent('hanama:edit-image',{detail:{imageId:p.id}}));img.onclick=edit;img.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();edit();}};}const body=document.createElement('div');body.className='gallery-card-body';const title=document.createElement('b');title.textContent=p.caption||'故事插图';const note=document.createElement('small');note.textContent=p.missing?'原图文件缺失':p.deletedAt?'已移入回收站':placed.has(p.id)?'已插入当前故事 · 拖动可移动':'拖到文字间插入';const buttons=document.createElement('div');buttons.className='gallery-actions';const button=(text,fn)=>{const b=document.createElement('button');b.className='btn';b.textContent=text;b.onclick=fn;buttons.append(b);};
 if(p.deletedAt)button('恢复到图库',()=>action('image.restore',{imageId:p.id}));else{
 button('放大',()=>{const d=document.createElement('dialog');d.className='gallery-lightbox';const full=document.createElement('img');full.src=p.dataUrl;full.alt=p.caption||'插图';const close=document.createElement('button');close.className='btn';close.textContent='关闭';close.onclick=()=>d.close();d.append(close,full);d.addEventListener('close',()=>d.remove());d.onclick=e=>{if(e.target===d)d.close();};document.body.append(d);d.showModal();});
 button('定位正文',async()=>{try{await run('image.locate',{imageId:p.id});}catch(e){notify(e.message);}});buttons.lastElementChild.dataset.locateImage=p.id;buttons.lastElementChild.title='跳到图片在正文中的位置；优先定位当前书，未插入的图片会提示';
 button('点选插入',()=>document.dispatchEvent(new CustomEvent('hanama:pick-image-position',{detail:{storyId:s.story.id,imageId:p.id}})));
 if(!p.missing){button('重绘',()=>document.dispatchEvent(new CustomEvent('hanama:quick-redraw',{detail:{imageId:p.id}})));buttons.lastElementChild.dataset.quickRedraw=p.id;buttons.lastElementChild.title='沿用这张图的人设、衣服与画风，随机种子重绘；会调用 NovelAI，可能扣费。';}
 if(!p.missing)button('调整提示词',()=>document.dispatchEvent(new CustomEvent('hanama:edit-image',{detail:{imageId:p.id}})));
 if(!p.missing)button('设为角色定稿',()=>document.dispatchEvent(new CustomEvent('hanama:reference-image',{detail:{imageId:p.id}})));
 if(placed.has(p.id))button('移除正文',()=>action('image.remove',{storyId:s.story.id,imageId:p.id}));
 button('删除',()=>{if(window.confirm('将这张图片移入回收站？所有故事中的插入都会移除，原图可从回收站恢复。'))action('image.delete',{imageId:p.id});});
 }
 body.append(title,note,buttons);card.append(img,body);$('galleryGrid').append(card);}
 if(!items.length){const empty=document.createElement('div');empty.className='gallery-empty';empty.textContent=filter==='trash'?'回收站为空':'还没有匹配的图片。生成后会自动出现在这里。';$('galleryGrid').append(empty);}
 }
 $('galleryFilter').onchange=update;$('gallerySearch').oninput=update;return {root,update};
}};
