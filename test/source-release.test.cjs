const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {audit,seal,verify,pngMetadata}=require('../scripts/verify-source.cjs');
test('release audit blocks secrets, private files and broken documentation without printing values',()=>{
 const key=['s','k','-','x'.repeat(40)].join('');
 const entries=new Map([['file.js',Buffer.from('const token='+JSON.stringify(key))],['settings.json',Buffer.from('{}')],['docs/a.md',Buffer.from('[missing](missing.md)')]]);
 const findings=audit(entries);assert.ok(findings.some(f=>f.type==='possible-credential'));assert.ok(findings.some(f=>f.type==='private-or-unapproved-file'));assert.ok(findings.some(f=>f.type.startsWith('broken-local-link')));assert.ok(!JSON.stringify(findings).includes(key));
});
test('release audit detects PNG metadata',()=>{
 const header=Buffer.from('89504e470d0a1a0a','hex'),chunk=Buffer.alloc(12);chunk.write('tEXt',4);assert.deepEqual(pngMetadata(Buffer.concat([header,chunk])),['tEXt']);
});
test('release manifest includes documentation and rejects modified or extra files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hanama-release-'));
 try{fs.mkdirSync(path.join(root,'docs'));for(const file of ['LICENSE','README.md','docs/USER_GUIDE.zh-CN.md','docs/GITHUB_GUIDE.zh-CN.md'])fs.writeFileSync(path.join(root,file),'example');seal(root);assert.equal(verify(root).ok,true);fs.appendFileSync(path.join(root,'README.md'),'changed');assert.ok(verify(root).findings.some(f=>f.type==='hash-mismatch'));fs.writeFileSync(path.join(root,'unexpected.txt'),'extra');assert.ok(verify(root).findings.some(f=>f.type==='unmanifested-file'));}finally{fs.rmSync(root,{recursive:true,force:true});}
});
