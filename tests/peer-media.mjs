import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const loaded={exports:{}};
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/stickers/peer-media.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports',code)(loaded,loaded.exports);
const {registerPeerMedia,claimPeerMedia}=loaded.exports;

test('intro and meme playback take turns repeatedly without erasing registered peers',()=>{
 const intro=Symbol('intro'),memes=Symbol('memes'),calls=[];
 const removeIntro=registerPeerMedia(intro,()=>calls.push('intro stopped'));
 const removeMemes=registerPeerMedia(memes,()=>calls.push('memes muted'));
 claimPeerMedia(intro);claimPeerMedia(memes);claimPeerMedia(intro);
 assert.deepEqual(calls,['memes muted','intro stopped','memes muted']);
 removeIntro();claimPeerMedia(memes);assert.equal(calls.length,3);
 removeMemes();
});

test('a detached or failing peer cannot clear or block another registration',()=>{
 const first=Symbol(),second=Symbol(),calls=[];
 const old=registerPeerMedia(first,()=>calls.push('old'));
 const latest=registerPeerMedia(first,()=>{calls.push('latest');throw new Error('detached');});
 const other=registerPeerMedia(second,()=>calls.push('other'));
 old();claimPeerMedia(second);claimPeerMedia(first);
 assert.deepEqual(calls,['latest','other']);
 latest();other();
});
