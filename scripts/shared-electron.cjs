// Resolve existing binaries only. Never import the electron npm installer.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..'),version='44.4.5';
function resolveRuntime(){
 const candidates=[process.env.HANAMA_ELECTRON_PATH,path.resolve(project,'../_shared/runtimes/electron',version,'win32-x64/electron.exe'),path.join(project,'node_modules/electron/dist/electron.exe')].filter(Boolean);
 for(const exe of candidates){const dir=path.dirname(exe);if(['electron.exe','version','icudtl.dat','resources.pak','resources/default_app.asar'].every(f=>fs.existsSync(path.join(dir,f)))&&fs.readFileSync(path.join(dir,'version'),'utf8').trim()===version)return exe;}
 throw Error('未找到 Electron '+version+'。请将 HANAMA_ELECTRON_PATH 指向已有完整运行时的 electron.exe；未下载任何文件。');
}
if(require.main===module){try{const args=process.argv.slice(2);if(args[0]==='--attach'){console.log('使用外部 Electron 运行时，不复制、不下载。运行 npm run runtime:check 检查。');}else{const exe=resolveRuntime();if(args[0]==='--check')console.log(JSON.stringify({project,version,exe},null,2));else{const env={...process.env,ELECTRON_SKIP_BINARY_DOWNLOAD:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;const child=spawn(exe,args.length?args:[project],{cwd:project,env,stdio:'inherit',windowsHide:true});child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>process.exitCode=code??1);}}}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={resolveRuntime,version};
