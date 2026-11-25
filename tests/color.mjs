import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const mod={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(new URL('../lib/stickers/color.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const{hexToHsv,hsvToHex,wheelColor}=mod.exports;
test('color conversion preserves every channel including gray, black and saturated colors',()=>{
 for(const hex of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#bfe8b0','#B8DBFF','#ffb59d','#ffe58f','#808080','#010203'])assert.equal(hsvToHex(hexToHsv(hex)),hex.toLowerCase());
 assert.equal(hexToHsv('transparent'),null);assert.equal(hexToHsv('#zzz000'),null);
 assert.equal(hsvToHex({h:-120,s:2,v:2}),'#0000ff');
});
test('wheel coordinates match CSS hue and constrain drags outside the circle',()=>{
 assert.deepEqual(wheelColor(50,50,100),{h:90,s:0});
 assert.deepEqual(wheelColor(50,0,100),{h:0,s:1});
 assert.deepEqual(wheelColor(100,50,100),{h:90,s:1});
 assert.deepEqual(wheelColor(50,100,100),{h:180,s:1});
 assert.deepEqual(wheelColor(0,50,100),{h:270,s:1});
 assert.equal(wheelColor(300,-100,100).s,1);
});
