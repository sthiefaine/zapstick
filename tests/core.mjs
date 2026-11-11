import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function moduleFromTS(path){const code=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);}
const {allowedMedia,limitedBody}=await moduleFromTS('../lib/stickers/remote.ts');
test('media proxy accepts supported HTTPS origins and rejects local addresses and lookalikes',()=>{
 for(const input of ['https://video.twimg.com/tweet_video/a.mp4','https://pbs.twimg.com/media/a.jpg','https://media2.giphy.com/a.gif','https://media.tenor.com/a.gif'])assert.ok(allowedMedia(input));
 for(const input of ['http://video.twimg.com/a','https://127.0.0.1/a','https://[::1]/a','https://169.254.169.254/a','https://video.twimg.com.evil.example/a','https://evil.example/?u=video.twimg.com','https://user:pass@video.twimg.com/a','https://video.twimg.com:444/a','file:///etc/passwd'])assert.equal(allowedMedia(input),null);
});
test('streaming limit rejects oversized bodies even without Content-Length',async()=>{
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(6));c.enqueue(new Uint8Array(6));c.close();}});
 await assert.rejects(limitedBody(new Response(body),10),/20 Mo/);
 const result=await limitedBody(new Response('hello',{headers:{'content-type':'image/gif'}}),10);
 assert.equal(result.size,5);assert.equal(result.type,'image/gif');
});
test('announced oversized files are refused before buffering',async()=>{
 await assert.rejects(limitedBody(new Response('x',{headers:{'content-length':'21'}}),20),/20 Mo/);
});
