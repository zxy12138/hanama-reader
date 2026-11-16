const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {decode}=require('../desktop/text-encoding.cjs'),{readBooks,combine}=require('../desktop/book-files.cjs');
test('严格识别 UTF-8、BOM UTF-16 与无 BOM ASCII UTF-16，GBK 不产生替代符',()=>{
 const text='第一章\n你好，世界！';const le=Buffer.from(text,'utf16le'),be=Buffer.from(le).swap16();
 for(const bytes of [Buffer.from(text),Buffer.concat([Buffer.from([239,187,191]),Buffer.from(text)]),Buffer.concat([Buffer.from([255,254]),le]),Buffer.concat([Buffer.from([254,255]),be])])assert.equal(decode(bytes).text,text);
 for(const [bytes,e] of [[le,'utf-16le'],[be,'utf-16be']])assert.equal(decode(bytes,e).text,text);
 for(const bytes of [Buffer.from('chapter 1\n你好','utf16le'),Buffer.from('chapter 1\n你好','utf16le').swap16()])assert.equal(decode(bytes).text,'chapter 1\n你好');
 const gbk=Buffer.from('c4e3bac3a3accac0bde7a3a1','hex');assert.equal(decode(gbk).text,'你好，世界！');assert.equal(decode(gbk).encoding,'gb18030');assert.throws(()=>decode(gbk,'utf-8'));
 assert.equal(decode(Buffer.from('a7daa66e','hex'),'big5').text,'我好');assert.throws(()=>decode(gbk,'unknown'));
});
test('多文件编码独立，JSONL 可解码；失败文件只预览，不允许合并，源字节不变',async()=>{
 const dir=await fs.mkdtemp(path.resolve(__dirname,'../.reader-test/encoding-'));const a=path.join(dir,'a.txt'),b=path.join(dir,'b.jsonl');const bytes=Buffer.from('c4e3bac3','hex');await fs.writeFile(a,bytes);await fs.writeFile(b,Buffer.concat([Buffer.from([255,254]),Buffer.from(JSON.stringify({name:'旁白',mes:'正常内容'}),'utf16le')]));
 const books=await readBooks([a,b]);assert.equal(books[0].messages[0].text,'你好');assert.equal(books[1].messages[0].text,'正常内容');assert.equal(books[0].sources[0].encoding,'gb18030');assert.equal(books[1].sources[0].encoding,'utf-16le');assert.equal(combine(books).added,2);
 const [invalid]=await readBooks([a],{encoding:'utf-8',allowInvalid:true});assert.ok(invalid.importError);assert.throws(()=>combine([invalid]),/正确解码/);assert.deepEqual(await fs.readFile(a),bytes);
});
