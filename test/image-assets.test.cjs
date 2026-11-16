const test=require('node:test'),assert=require('node:assert/strict'),assets=require('../desktop/image-assets.cjs');
test('界面状态仅传本地图片地址，原图仍在后台供保存和导出',()=>{
 const image={id:'test /中文',dataUrl:'data:image/png;base64,'+'A'.repeat(3000000),prompt:'画面',offset:10},story={id:'book',messages:[],images:[image]};
 const state=assets.view(story,[image]);assert.ok(JSON.stringify(state).length<1000);assert.match(state.story.images[0].dataUrl,/^hanama-image:\/\/asset\//);assert.equal(state.story.images[0].dataUrl,state.gallery[0].dataUrl);assert.equal(image.dataUrl.length,3000022);assert.equal(state.story.images[0].offset,10);
});
test('图片协议仅按已知 ID 读取图库图片，拒绝任意路径及已删除图片',async()=>{
 const store={gallery:[{id:'a',dataUrl:'data:image/png;base64,aGVsbG8='},{id:'deleted',deletedAt:1,dataUrl:'data:image/png;base64,aGVsbG8='}]},handler=assets.handler(()=>store);
 const response=await handler(new Request('hanama-image://asset/a'));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(await response.text(),'hello');
 for(const url of ['hanama-image://asset/deleted','hanama-image://asset/%2e%2e%2fsettings.json','hanama-image://other/a','file:///a'])assert.equal((await handler(new Request(url))).status,404);
});
