import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const dataModule=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const configURL=dataModule(compile(await readFile(new URL('../lib/i18n/config.ts',import.meta.url),'utf8')));
const source=compile(await readFile(new URL('../lib/site-metadata.ts',import.meta.url),'utf8')).replaceAll("'@/lib/i18n/config'",JSON.stringify(configURL));
const {siteOrigin,isSiteIndexable,pageMetadata,languageAlternates,applicationSchema,jsonLd}=await import(dataModule(source));
function withEnv(values,fn){const keys=['SITE_URL','NEXT_PUBLIC_SITE_URL','SITE_INDEXABLE','NEXT_PUBLIC_SITE_INDEXABLE'],previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));for(const k of keys)delete process.env[k];Object.assign(process.env,values);try{return fn();}finally{for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}}
test('unconfigured and local installations are not indexable',()=>withEnv({},()=>{assert.equal(siteOrigin(),'http://localhost:3000');assert.equal(isSiteIndexable(),false);assert.equal(pageMetadata('fr').robots.index,false);}));
test('indexing requires explicit opt-in and an HTTPS public origin',()=>{
 withEnv({SITE_URL:'https://stickers.example.com',SITE_INDEXABLE:'true'},()=>assert.equal(isSiteIndexable(),true));
 for(const SITE_URL of ['http://stickers.example.com','https://localhost','https://127.0.0.1','https://test.local'])withEnv({SITE_URL,SITE_INDEXABLE:'true'},()=>assert.equal(isSiteIndexable(),false));
 withEnv({SITE_URL:'https://stickers.example.com'},()=>assert.equal(isSiteIndexable(),false));
});
test('canonical and alternate URLs use one origin and localized legal paths',()=>withEnv({SITE_URL:'https://stickers.example.com/ignored?query=1'},()=>{
 const m=pageMetadata('pt-BR','privacy');assert.equal(m.alternates.canonical,'https://stickers.example.com/pt-BR/privacy');
 assert.equal(Object.keys(m.alternates.languages).length,9);assert.equal(m.alternates.languages['zh-CN'],'https://stickers.example.com/zh-CN/privacy');assert.equal(m.alternates.languages['x-default'],'https://stickers.example.com/fr/privacy');
 assert.equal(m.openGraph.images[0].width,1200);assert.equal(m.openGraph.images[0].height,630);assert.equal(m.twitter.card,'summary_large_image');
 assert.equal(languageAlternates('legal').ru,'https://stickers.example.com/ru/legal');
}));
test('origin configuration refuses embedded credentials and non-HTTP protocols',()=>{
 for(const SITE_URL of ['javascript:alert(1)','https://user:secret@bad.example','not a URL'])withEnv({SITE_URL},()=>assert.equal(siteOrigin(),'http://localhost:3000'));
});
test('structured data describes actual app capabilities and escapes script boundaries',()=>withEnv({SITE_URL:'https://stickers.example.com'},()=>{
 const schema=applicationSchema('ja');assert.equal(schema['@type'],'WebApplication');assert.equal(schema.url,'https://stickers.example.com/ja');assert.equal(schema.inLanguage.length,8);assert.equal(schema.aggregateRating,undefined);
 assert.equal(jsonLd({value:'</script>'}),'{"value":"\\u003c/script>"}');
}));
test('social preview is a real 1200 by 630 PNG',async()=>{const png=await readFile(new URL('../public/social-card.png',import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);});
