import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),loaded={exports:{}};
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/stickers/collection-drag.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','module','exports',code)(require,loaded,loaded.exports);
const {collectionCollisions}=loaded.exports;
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const container=(id,kind,entityId)=>({id,data:{current:{kind,entityId}},disabled:false});
const containers=[container('sticker:a','sticker','a'),container('sticker:b','sticker','b'),container('tail:all','tail','all'),container('folder:one','folder','one')];
const base={active:{id:'sticker:a',data:{current:{kind:'sticker',entityId:'a'}}},collisionRect:rect(0,0,80,80),droppableContainers:containers,droppableRects:new Map([['sticker:a',rect(0,0,80,80)],['sticker:b',rect(100,0,80,80)],['tail:all',rect(0,0,300,150)],['folder:one',rect(0,200,100,50)]])};
test('a long press released on its pickup tile targets itself instead of the end of the collection',()=>{
 for(const point of [{x:40,y:40},{x:60,y:45},{x:1,y:1}])assert.equal(collectionCollisions({...base,pointerCoordinates:point})[0]?.id,'sticker:a');
});
test('moving onto another sticker, the grid tail or a folder keeps each intended target',()=>{
 const detect=collectionCollisions;
 assert.equal(detect({...base,pointerCoordinates:{x:130,y:40}})[0]?.id,'sticker:b');
 assert.equal(detect({...base,pointerCoordinates:{x:250,y:40}})[0]?.id,'tail:all');
 assert.equal(detect({...base,pointerCoordinates:{x:40,y:220}})[0]?.id,'folder:one');
 assert.deepEqual(detect({...base,pointerCoordinates:{x:500,y:500}}),[]);
});
test('selected pickup tiles remain neutral pointer targets and keyboard navigation can reach the next tile',()=>{
 assert.equal(collectionCollisions({...base,pointerCoordinates:{x:130,y:40}})[0]?.id,'sticker:b');
 assert.equal(collectionCollisions({...base,pointerCoordinates:null})[0]?.id,'sticker:a');
 assert.equal(collectionCollisions({...base,pointerCoordinates:null,collisionRect:rect(100,0,80,80)})[0]?.id,'sticker:b');
});
