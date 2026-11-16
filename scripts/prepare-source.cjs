// Export only reviewed source; never copy local data or Git history.
const fs=require('node:fs'),path=require('node:path');
const {audit,seal,verify}=require('./verify-source.cjs');
const root=path.resolve(__dirname,'..'),files=[];
for(const name of fs.readdirSync(root))if(/\.(js|css|html)$/.test(name)||['package.json','package-lock.json','.gitignore','LICENSE','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md'].includes(name))files.push(name);
for(const name of fs.readdirSync(path.join(root,'desktop')))if(name.endsWith('.cjs'))files.push('desktop/'+name);
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),tests=new Set();
for(const command of Object.values(pkg.scripts))for(const m of command.matchAll(/test\/([\w-]+\.cjs)/g))tests.add(m[1]);
for(const name of fs.readdirSync(path.join(root,'test')))if(name.endsWith('.test.cjs')||tests.has(name))files.push('test/'+name);
files.push('scripts/shared-electron.cjs','scripts/prepare-source.cjs','scripts/verify-source.cjs','scripts/public-readme.txt','scripts/release-notes.txt');
files.push('assets/hanama-icon.png','assets/hanama.ico','assets/startup-reader.png');
function collect(dir){if(!fs.existsSync(path.join(root,dir)))return;for(const ent of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+ent.name;if(ent.isSymbolicLink())throw Error('Symlink excluded: '+rel);if(ent.isDirectory())collect(rel);else if(/\.(md|png|yml|txt)$/.test(rel))files.push(rel);else throw Error('Unapproved documentation file: '+rel);}}
collect('docs');collect('.github');
const entries=new Map(files.sort().map(file=>{const p=path.join(root,file);if(fs.lstatSync(p).isSymbolicLink())throw Error('Symlink excluded: '+file);return [file,fs.readFileSync(p)];}));
entries.set('README.md',fs.readFileSync(path.join(root,'scripts/public-readme.txt')));
entries.set('RELEASE_CHECKLIST.md',fs.readFileSync(path.join(root,'scripts/release-notes.txt')));
const findings=audit(entries);if(findings.length){console.error(JSON.stringify({status:'BLOCKED',findings},null,2));process.exit(1);}
const destination=path.join(root,'dist','source-candidate-'+Date.now());fs.mkdirSync(destination,{recursive:true});
for(const [file,bytes] of entries){const out=path.join(destination,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,bytes);}
seal(destination);
const result=verify(destination);console.log(JSON.stringify({destination,...result},null,2));if(!result.ok)process.exitCode=1;
