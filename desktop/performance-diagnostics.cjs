// Opt-in local diagnostics. Only fixed event names and numeric measurements are accepted.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const EVENTS=new Set(['exclude-input','exclude-toggle','exclude-frame','long-task','long-frame','renderer-delay','reader-render']);
const NUMBERS=['id','start','duration','characters','chunks','messages','open','scriptMs','layoutMs','blockingMs','renderMs'];
function sanitize(value){
 if(!value||!EVENTS.has(value.event))return null;
 const result={event:value.event};for(const key of NUMBERS)if(typeof value[key]==='number'&&Number.isFinite(value[key]))result[key]=Math.max(0,Math.min(1e10,value[key]));return result;
}
function start({app,ipcMain,authorized,directory}){
 const file=path.join(directory,'reader-performance.jsonl'),previous=file+'.previous';
 let queued=[],writing=false,size=0,stopped=false,last=performance.now(),rate=new Map();
 const ready=fs.mkdir(directory,{recursive:true}).then(async()=>{size=(await fs.stat(file).catch(()=>({size:0}))).size;});
 function record(value){if(stopped)return;queued.push({time:new Date().toISOString(),...value});if(queued.length>200)queued.shift();}
 async function flush(){if(writing||!queued.length)return;writing=true;const batch=queued.splice(0);try{await ready;const text=batch.map(v=>JSON.stringify(v)).join('\n')+'\n';if(size+Buffer.byteLength(text)>2*1024*1024){await fs.rm(previous,{force:true});await fs.rename(file,previous).catch(e=>{if(e.code!=='ENOENT')throw e;});size=0;}await fs.appendFile(file,text);size+=Buffer.byteLength(text);}catch{}finally{writing=false;}}
 function metrics(){return app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,cpu:p.cpu.percentCPUUsage,cpuSeconds:p.cpu.cumulativeCPUUsage,memoryMB:Math.round(p.memory.workingSetSize/1024)}));}
 const profiler=process.argv.includes('--profile-main')?require('./main-profiler.cjs').start({app,contentTracing:require('electron').contentTracing,directory,record}).catch(e=>{record({type:'profile-error',message:e.message});return null;}):Promise.resolve(null);
 const listener=(event,value)=>{if(!authorized.has(event.sender))return;const clean=sanitize(value);if(!clean)return;const now=Date.now(),window=rate.get(event.sender.id);if(window&&now-window.start<1000&&window.count>=30)return;if(!window||now-window.start>=1000)rate.set(event.sender.id,{start:now,count:1});else window.count++;record({type:'renderer',pid:event.sender.getOSProcessId(),...clean});};
 ipcMain.on('hanama:performance',listener);
 let ticks=0;const sample=()=>{const now=performance.now(),delay=Math.max(0,now-last-1000);try{record({type:'sample',mainDelayMs:delay,accessibility:app.isAccessibilitySupportEnabled(),freeMemoryMB:Math.round(os.freemem()/1048576),processes:metrics()});if(delay>10000)void profiler.then(p=>p?.stop()).catch(e=>record({type:'profile-error',message:e.message}));if(++ticks%30===0)record({type:'gpu-status',features:app.getGPUFeatureStatus()});}catch{}last=now;void flush();};
 const timer=setInterval(sample,1000);timer.unref();
 const gone=(_event,d)=>record({type:'child-gone',processType:d.type,reason:d.reason,exitCode:d.exitCode});app.on('child-process-gone',gone);
 record({type:'start',pid:process.pid,electron:process.versions.electron,accessibilityWorkaround:app.commandLine.hasSwitch('disable-renderer-accessibility'),logicalCPUs:os.cpus().length,totalMemoryMB:Math.round(os.totalmem()/1048576),gpu:app.getGPUFeatureStatus()});sample();
 return {file,attach(window){const pid=()=>window.webContents.isDestroyed()?0:window.webContents.getOSProcessId();window.on('unresponsive',()=>record({type:'unresponsive',pid:pid()}));window.on('responsive',()=>record({type:'responsive',pid:pid()}));window.webContents.on('render-process-gone',(_e,d)=>record({type:'renderer-gone',reason:d.reason,exitCode:d.exitCode}));},async stop(){clearInterval(timer);try{await (await profiler)?.stop();}catch(e){record({type:'profile-error',message:e.message});}ipcMain.removeListener('hanama:performance',listener);app.removeListener('child-process-gone',gone);record({type:'stop'});while(writing)await new Promise(r=>setTimeout(r,10));await flush();stopped=true;},flush};
}
module.exports={start,sanitize};
