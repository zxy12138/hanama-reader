const {test}=require('node:test'),assert=require('node:assert/strict'),jobs=require('../desktop/book-jobs.cjs');
test('任务累计只统计可核对的非负差额；未知与充值不能误算免费',()=>{
 const j={units:[{imageId:'a',billing:{delta:45}},{imageId:'b',billing:{delta:0}},{imageId:'c',billing:{delta:null}},{imageId:'d',billing:{delta:-100}},{imageId:'e'},{phase:'uncertain'}]};
 assert.deepEqual(jobs.billing(j),{known:2,unknown:3,total:45});
 assert.deepEqual(jobs.billing(JSON.parse(JSON.stringify(j))),jobs.billing(j));
 assert.deepEqual(jobs.drawingOptions({width:1024,apiKey:'secret',baseUrl:'https://invalid',referenceCharacterId:'x'}),{width:1024});
});
