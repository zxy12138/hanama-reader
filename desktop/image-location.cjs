function find(current,workspace,imageId){
 if(typeof imageId!=='string'||!imageId)throw Error('请选择图片');
 const asset=workspace.gallery.find(i=>i.id===imageId);
 if(asset?.deletedAt)throw Error('图片已在回收站，请先恢复');
 const stories=[current,...Object.values(workspace.archives||{}).map(a=>a.story).filter(s=>s&&s.id!==current.id)];
 const placements=stories.filter(s=>s.images?.some(i=>i.id===imageId&&!i.pending&&!i.deletedAt&&s.messages.some(m=>m.id===i.afterId)));
 const story=placements.find(s=>s.id===current.id)||placements.find(s=>s.id===asset?.sourceStoryId)||placements[0];
 if(!story)throw Error('这张图片尚未插入可阅读的书籍，或已从正文移除；请先插入正文');
 return {story};
}
module.exports={find};
