const {parentPort,workerData}=require('node:worker_threads');
const store=require('./tag-store.cjs').create(workerData.file);
parentPort.on('message',({id,action,args})=>{try{if(!['info','importCsv','importRecipes','importFile','search','context'].includes(action))throw Error('未知词库操作');parentPort.postMessage({id,result:store[action](args)});}catch(e){parentPort.postMessage({id,error:e.message});}});
