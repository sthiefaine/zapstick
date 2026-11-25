import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const loaded={exports:{}};
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/stickers/audio-timeline.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports',code)(loaded,loaded.exports);
const {normalizeAudioExcerpt:normalize,moveAudioExcerptHandle:handle,moveAudioExcerpt:move}=loaded.exports;
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);

test('source selection respects the composition limit and preserves a passage starting at five seconds',()=>{
 assert.deepEqual(normalize(30,{start:5,duration:3},3),{start:5,duration:3});
 assert.deepEqual(normalize(30,{start:5,duration:12},3),{start:5,duration:3});
 assert.deepEqual(normalize(30,{start:29,duration:3},6),{start:29,duration:1});
 assert.deepEqual(normalize(1.2,{start:0,duration:6},6),{start:0,duration:1.2});
 assert.deepEqual(normalize(30,{start:4,duration:3},1.5),{start:4,duration:1.5});
 assert.deepEqual(normalize(0,{start:4,duration:3},6),{start:0,duration:0});
 assert.deepEqual(normalize(3,{start:0,duration:3},0),{start:0,duration:0});
});

test('both handles can travel along the complete source while maintaining valid end points',()=>{
 assert.deepEqual(handle(30,{start:5,duration:3},'start',4,6),{start:4,duration:4});
 assert.deepEqual(handle(30,{start:5,duration:3},'end',10,6),{start:5,duration:5});
 assert.deepEqual(handle(30,{start:0,duration:3},'end',8,3),{start:5,duration:3});
 const nearEnd=handle(30,{start:5,duration:3},'start',40,3);close(nearEnd.start,29.95);close(nearEnd.duration,.05);
 const before=handle(30,{start:5,duration:3},'end',0,3);close(before.start,0);close(before.duration,.05);
 const tiny=handle(.02,{start:0,duration:.02},'start',.01,6);close(tiny.start,0);close(tiny.duration,.02);
});

test('dragging the region preserves its length, clamps to source ends and does not add montage positions',()=>{
 assert.deepEqual(move(10,{start:0,duration:3},5,3),{start:5,duration:3});
 assert.deepEqual(move(10,{start:5,duration:3},15,3),{start:7,duration:3});
 assert.deepEqual(move(10,{start:5,duration:3},-4,3),{start:0,duration:3});
 assert.deepEqual(Object.keys(move(10,{start:5,duration:3},6,3)).sort(),['duration','start']);
});

test('remaining source, short files and invalid numeric input always produce bounded selections',()=>{
 for(const total of [.001,.02,.04,.1,1,5,30])for(const maximum of [.01,.04,.1,1,3,6])for(const start of [-5,0,.03,total/2,total,Infinity,NaN]){
  const current=normalize(total,{start,duration:10},maximum);
  const choices=[current,move(total,current,start,maximum),handle(total,current,'start',start,maximum),handle(total,current,'end',start,maximum)];
  for(const result of choices){assert.ok(Number.isFinite(result.start)&&Number.isFinite(result.duration));assert.ok(result.start>=0&&result.duration>0);assert.ok(result.duration<=Math.min(total,maximum)+1e-8);assert.ok(result.start+result.duration<=total+1e-8);}
 }
 assert.deepEqual(normalize(NaN,{start:2,duration:3},6),{start:0,duration:0});
 assert.deepEqual(normalize(30,{start:2,duration:3},NaN),{start:0,duration:0});
});
