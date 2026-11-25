import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),nodeRequire=createRequire(import.meta.url),cache=new Map();
let currentLocale='fr';
function load(file){
 const absolute=path.resolve(root,file);
 if(cache.has(absolute))return cache.get(absolute).exports;
 const loaded={exports:{}};cache.set(absolute,loaded);
 const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const require=specifier=>{
  if(specifier==='@/components/preferences-provider')return{usePreferences:()=>({locale:currentLocale,t:source=>source})};
  if(specifier.endsWith('.module.css'))return{};
  if(!specifier.startsWith('.')&&!specifier.startsWith('@/'))return nodeRequire(specifier);
  let target=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(absolute),specifier);
  if(!path.extname(target))target+='.ts';
  return load(target);
 };
 new Function('require','module','exports',code)(require,loaded,loaded.exports);
 return loaded.exports;
}
const {IntroVideo}=load('components/zapstick/intro-video.tsx');

test('the film loads no MP4 or captions before a click and uses the matching local poster',()=>{
 for(const [locale,film] of [['fr','fr'],['en','en'],['pt-BR','pt-br'],['es','en'],['de','en'],['zh-CN','en'],['ja','en'],['ru','en']]){
  currentLocale=locale;
  const html=renderToStaticMarkup(React.createElement(IntroVideo,{active:true}));
  const video=html.match(/<video\b[^>]*>/)?.[0];assert.ok(video);
  assert.equal(/\ssrc=/.test(video),false,`${locale}: no video source before play`);
  assert.match(video,/preload="none"/);assert.match(video,/controls=""/);assert.match(video,/playsInline=""/);
  assert.equal(/autoPlay|autoplay/.test(video),false);
  assert.equal(html.includes('<track'),false);
  assert.ok(html.includes(`/videos/zapstick-intro-${film}.jpg`));
  assert.ok(html.includes('Lire le film de présentation de Zapstick'));
  assert.equal((html.match(/Découvrir Zapstick/g)??[]).length,1);
 }
});

test('all three WebVTT tracks follow the localized storyboard continuously from zero to two minutes',()=>{
 const storyboard=JSON.parse(fs.readFileSync(path.join(root,'scripts/intro/storyboard.json'),'utf8'));
 assert.equal(storyboard.duration,120);
 const seconds=value=>{const [h,m,s]=value.split(':').map(Number);return h*3600+m*60+s;};
 for(const locale of ['fr','en','pt-BR']){
  const content=fs.readFileSync(path.join(root,`public/videos/zapstick-intro-${locale.toLowerCase()}.vtt`),'utf8');
  const blocks=content.trim().split(/\n\n+/);assert.equal(blocks.shift(),'WEBVTT');assert.equal(blocks.length,storyboard.scenes.length);
  let end=0;
  for(const [index,block] of blocks.entries()){
   const [id,timing,...text]=block.split('\n'),scene=storyboard.scenes[index];
   const [from,to]=timing.split(' --> ').map(seconds);
   assert.equal(id,scene.id);assert.equal(from,end);assert.equal(from,scene.start);assert.equal(to,scene.end);assert.ok(to>from);
   assert.ok(text.includes(scene.text[locale].title));assert.ok(text.includes(scene.text[locale].body));end=to;
  }
  assert.equal(end,120);
 }
});
