import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cache=new Map();
function loadTS(file){
 const absolute=path.resolve(root,file);
 if(cache.has(absolute))return cache.get(absolute).exports;
 if(absolute.endsWith('.json'))return JSON.parse(fs.readFileSync(absolute,'utf8'));
 const module={exports:{}};cache.set(absolute,module);
 const source=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText;
 const require=specifier=>{let target=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(absolute),specifier);if(!path.extname(target))target+='.ts';return loadTS(target);};
 new Function('require','module','exports',source)(require,module,module.exports);return module.exports;
}
const config=loadTS('lib/i18n/config.ts'),messages=loadTS('lib/i18n/messages.ts');
const {privacyTranslations,privacyUiSources}=loadTS('lib/privacy/translations.ts');
const {privacySections,backgroundPrivacySection,legalSections}=loadTS('lib/privacy/content.ts');
test('all requested languages have complete UI dictionaries',()=>{
 assert.deepEqual(config.SUPPORTED_LOCALES,['fr','en','pt-BR','es','de','zh-CN','ja','ru']);
 const source=Object.keys(messages.UI_TRANSLATIONS.fr).sort();assert.ok(source.length>=250);
 for(const locale of config.SUPPORTED_LOCALES){assert.deepEqual(Object.keys(messages.UI_TRANSLATIONS[locale]).sort(),source,locale);for(const key of source)assert.ok(messages.UI_TRANSLATIONS[locale][key].trim(),`${locale}: ${key}`);}
});
test('translations preserve placeholders and interpolate names without changing user content',()=>{
 const params=value=>Array.from(value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g),m=>m[1]).sort();
 for(const locale of config.SUPPORTED_LOCALES)for(const [key,value] of Object.entries(messages.UI_TRANSLATIONS[locale]))assert.deepEqual(params(value),params(key),`${locale}: ${key}`);
 assert.equal(messages.translate('en','Créer'),'Create');
 assert.equal(messages.translate('zh-CN','Créer'),'创建');
 assert.equal(messages.translate('ja','Ouvrir {name}',{name:'photo <3'}),'photo <3 を開く');
 assert.equal(messages.translate('de','Sélection : {count}',{count:3}),'Ausgewählt: 3');
 assert.equal(messages.translate('en','unknown message'),'unknown message');
});
test('privacy and legal copy is available in all eight locales',()=>{
 const keys=[...privacyUiSources,...[...privacySections,backgroundPrivacySection].flatMap(s=>[s.title,s.body]),...legalSections.flatMap(s=>[s.title,s.body])];
 for(const locale of config.SUPPORTED_LOCALES.filter(v=>v!=='fr'))for(const key of keys)assert.ok((messages.UI_TRANSLATIONS[locale][key]??privacyTranslations[locale][key])?.trim(),`${locale}: ${key}`);
 assert.equal(messages.translate('en','Confidentialité'),'Privacy');
});
test('locale normalization and links use canonical language codes',()=>{
 for(const [input,expected] of [['pt_br','pt-BR'],['PT-br','pt-BR'],['ge','de'],['de-DE','de'],['mandarin','zh-CN'],['jap','ja'],['rus','ru'],['en-US','en']])assert.equal(config.normalizeLocale(input),expected);
 assert.equal(config.normalizeLocale('unknown'),undefined);
 assert.equal(config.localizedPath('/fr/privacy','ja'),'/ja/privacy');
 assert.equal(config.localizedPath('/','pt-BR'),'/pt-BR');
 assert.equal(config.localizedPath('/legal','de'),'/de/legal');
});
test('every literal translation call in the app has a translation source',()=>{
 const files=['app/page.tsx','components/zapstick/collections-board.tsx','components/zapstick/share-zapstick.tsx','components/zapstick/animated-downloads.tsx','components/zapstick/media-import-card.tsx','components/language-switcher.tsx','components/zapstick/text-style-controls.tsx','components/zapstick/overlay-stage.tsx','components/zapstick/studio.tsx','components/zapstick/animation-timeline.tsx','components/zapstick/privacy-settings.tsx','components/zapstick/privacy-document.tsx'];
 for(const file of files){const source=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function walk(node){if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='t'&&ts.isStringLiteral(node.arguments[0])){const key=node.arguments[0].text;assert.ok(Object.hasOwn(messages.UI_TRANSLATIONS.fr,key)||Object.hasOwn(privacyTranslations.en,key),`${file}: ${key}`);}ts.forEachChild(node,walk);}walk(source);}
});

test('theme bootstrap respects the manual theme and updates all theme-color tags',async()=>{
 const {runInNewContext}=await import('node:vm');
 for(const preference of ['light','dark','system']){
  const root={dataset:{},style:{}},metas=[{media:true},{media:true}];
  const metaElements=metas.map(item=>({removeAttribute(name){if(name==='media')item.media=false;},setAttribute(name,value){item[name]=value;}}));
  runInNewContext(config.PREFERENCES_INIT_SCRIPT,{localStorage:{getItem:()=>JSON.stringify({theme:preference,reduceMotion:true})},matchMedia:()=>({matches:true}),document:{documentElement:root,querySelectorAll:()=>metaElements}});
  const expected=preference==='light'?'light':'dark';
  assert.equal(root.dataset.theme,expected);assert.equal(root.style.colorScheme,expected);assert.equal(root.dataset.reducedMotion,'true');
  for(const item of metas){assert.equal(item.media,false);assert.equal(item.content,expected==='light'?'#fafafa':'#121212');}
 }
});
