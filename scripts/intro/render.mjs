#!/usr/bin/env node
/** Deterministic 120-second Zapstick film. SVG scenes → Sharp JPEG frames → H.264.
 * No browser capture, remote request, private collection or generated voice.
 * Run: node scripts/intro/render.mjs --audio /tmp/zapstick-intro-music.wav
 * Inspect representative frames: node scripts/intro/render.mjs --stills
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import sharp from 'sharp';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1];};
const W=1280,H=720,FPS=Number(option('--fps','24')),AUDIO=option('--audio','/tmp/zapstick-intro-music.wav');
const storyboard=JSON.parse(await fs.readFile(path.join(ROOT,'scripts/intro/storyboard.json'),'utf8'));
if(storyboard.duration!==120||storyboard.scenes[0].start!==0||storyboard.scenes.at(-1).end!==120||storyboard.scenes.some((s,i)=>s.end<=s.start||(i&&s.start!==storyboard.scenes[i-1].end)))throw new Error('Storyboard must be contiguous and exactly 120 seconds.');
const requested=option('--locale','all'),locales=requested==='all'?storyboard.locales:[requested];
if(locales.some(locale=>!storyboard.locales.includes(locale)))throw new Error('Unknown locale.');
const OUT=path.join(ROOT,'public/videos'),QA=path.join(ROOT,'outputs/intro');
await fs.mkdir(OUT,{recursive:true});await fs.mkdir(QA,{recursive:true});
const C={green:'#BFE8B0',blue:'#B8DBFF',coral:'#FFB59D',yellow:'#FFE58F',black:'#171717',white:'#FAFAFA',gray:'#D9D9D9'};
const ACCENTS=[C.green,C.blue,C.coral,C.yellow];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),ease=t=>1-(1-clamp(t))**3,lerp=(a,b,p)=>a+(b-a)*p;
const xml=t=>String(t).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[s]));
const rr=(x,y,w,h,r=24,fill=C.white,stroke=C.black,sw=3)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const txt=(x,y,text,size=36,fill=C.black,weight=700,anchor='start')=>`<text x="${x}" y="${y}" fill="${fill}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${xml(text)}</text>`;
const line=(x1,y1,x2,y2,color=C.black,width=4,dash='')=>`<path d="M${x1},${y1} L${x2},${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const circle=(x,y,r,fill=C.green,stroke=C.black,sw=3)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const plus=(x,y,size=24,color=C.black)=>line(x-size,y,x+size,y,color,7)+line(x,y-size,x,y+size,color,7);
const check=(x,y,color=C.black)=>`<path d="M${x-14} ${y}l10 11 22-26" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
const iconPlay=(x,y,size=18,color=C.black)=>`<path d="M${x-size*.55},${y-size} L${x+size},${y} L${x-size*.55},${y+size}Z" fill="${color}"/>`;
const speaker=(x,y,color=C.black)=>`<path d="M${x-20} ${y-10}h11l15-12v44L${x-9} ${y+10}h-11Z" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/><path d="M${x+16} ${y-15}q18 15 0 30M${x+26} ${y-25}q28 25 0 50" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
const cursor=(x,y,pulse=0)=>`<g transform="translate(${x} ${y})">${pulse?`<circle r="${26+pulse*26}" fill="none" stroke="${C.coral}" stroke-width="${7*(1-pulse)}" opacity="${1-pulse}"/>`:''}<path d="M0 0L8 39l10-11 14 20 10-7-14-20 16-3Z" fill="${C.white}" stroke="${C.black}" stroke-width="4" stroke-linejoin="round"/></g>`;
const pill=(x,y,w,label,fill=C.green,size=30)=>rr(x,y,w,64,18,fill)+txt(x+w/2,y+43,label,size,C.black,700,'middle');
const dict={
 fr:{photo:'Photo',video:'Vidéo',import:'Importer',paste:'Coller',caption:'Au boulot !',text:'Texte',emoji:'Émojis',remove:'Retirer le fond',animation:'Animation',sound:'Son',sound1:'Son 1',sound2:'Son 2',original:'Original',file:'Audio',after:'À la suite',from:'À partir de',source:'Dans le son',sticker:'Dans le sticker',listen:'Écouter',reactions:'Réactions',animals:'Animaux',favorites:'Favoris',download:'Télécharger',gif:'GIF animé',withSound:'Vidéo + son',create:'À toi de créer',clip:'Extrait'},
 en:{photo:'Photo',video:'Video',import:'Import',paste:'Paste',caption:'Back to work!',text:'Text',emoji:'Emoji',remove:'Remove background',animation:'Animation',sound:'Sound',sound1:'Sound 1',sound2:'Sound 2',original:'Original',file:'Audio',after:'In sequence',from:'Start at',source:'In the sound',sticker:'In the sticker',listen:'Listen',reactions:'Reactions',animals:'Animals',favorites:'Favorites',download:'Download',gif:'Animated GIF',withSound:'Video + sound',create:'Make it yours',clip:'Excerpt'},
 'pt-BR':{photo:'Foto',video:'Vídeo',import:'Importar',paste:'Colar',caption:'Bora trabalhar!',text:'Texto',emoji:'Emojis',remove:'Remover fundo',animation:'Animação',sound:'Som',sound1:'Som 1',sound2:'Som 2',original:'Original',file:'Áudio',after:'Em sequência',from:'A partir de',source:'No áudio',sticker:'Na figurinha',listen:'Ouvir',reactions:'Reações',animals:'Animais',favorites:'Favoritos',download:'Baixar',gif:'GIF animado',withSound:'Vídeo + som',create:'Agora é sua vez',clip:'Trecho'}
};

const ASSETS=new Map();
async function loadGif(name){
 const input=path.join(ROOT,`public/memes/${name}.gif`),metadata=await sharp(input,{animated:true}).metadata();
 const pages=Math.min(metadata.pages??1,60),height=metadata.pageHeight??metadata.height,frames=[],durations=metadata.delay??[];
 const buffer=await sharp(input,{animated:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const stride=buffer.info.width*4*height;
 for(let page=0;page<pages;page++){
  const frame=await sharp(buffer.data.subarray(page*stride,(page+1)*stride),{raw:{width:buffer.info.width,height,channels:4}}).flatten({background:'#171717'}).resize(320,240,{fit:'contain',background:'#171717'}).jpeg({quality:90}).toBuffer();
  frames.push(`data:image/jpeg;base64,${frame.toString('base64')}`);
 }
 const timing=Array.from({length:pages},(_,i)=>Math.max(.04,(durations[i]??100)/1000));
 ASSETS.set(name,{frames,timing,total:timing.reduce((a,b)=>a+b,0)});
}
await Promise.all(['working-cat','dancing-cat','side-eye-dog','happy-dog','cooking-monkey','jumping-cat'].map(loadGif));
const BRAND=`data:image/png;base64,${(await sharp(path.join(ROOT,'public/brand/zapstick-mark.svg')).resize(256,256).png().toBuffer()).toString('base64')}`;
function source(name,t){const a=ASSETS.get(name);let time=((t%a.total)+a.total)%a.total;for(let i=0;i<a.frames.length;i++){if(time<a.timing[i])return a.frames[i];time-=a.timing[i];}return a.frames[0];}
function media(name,t,x,y,w,h,r=20){const id=`m${Math.round(x)}x${Math.round(y)}x${Math.round(w)}x${Math.round(h)}`;return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath></defs><image href="${source(name,t)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;}
function sticker(name,t,x,y,w=175,angle=0){return `<g transform="rotate(${angle} ${x+w/2} ${y+w*.4})">${rr(x-7,y-7,w+14,w*.75+14,24,C.white,C.black,3)}${media(name,t,x,y,w,w*.75,18)}</g>`;}
function logo(x,y,scale=1,ink=C.black){return `<g transform="translate(${x} ${y}) scale(${scale})"><image href="${BRAND}" x="-3" y="-3" width="54" height="54"/>${txt(64,38,'zapstick',43,ink,800)}</g>`;}
function laugh(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})">${circle(0,0,38,C.yellow)}<path d="M-25-8q8-12 17 0M8-8q8-12 17 0" fill="none" stroke="${C.black}" stroke-width="5" stroke-linecap="round"/><path d="M-22 8q22 39 44 0Z" fill="${C.black}"/><path d="M-14 25q15-7 28 0q-14 12-28 0" fill="${C.coral}"/><path d="M-30-2q-23 20-10 25q16 4 10-25M30-2q23 20 10 25q-16 4-10-25" fill="${C.blue}" stroke="${C.black}" stroke-width="2"/></g>`;}
function checker(x,y,w,h){let s='';for(let row=0;row<Math.ceil(h/22);row++)for(let col=0;col<Math.ceil(w/22);col++)s+=`<rect x="${x+col*22}" y="${y+row*22}" width="22" height="22" fill="${(row+col)%2?'#E9E9E9':'#FFFFFF'}"/>`;return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${s}</svg>`;}
function wrap(text,max){const words=text.split(' '),rows=[''];for(const word of words){const last=rows.length-1;if((rows[last]+' '+word).trim().length>max&&rows[last])rows.push(word);else rows[last]=(rows[last]+' '+word).trim();}return rows;}
const COPY=new Map();
async function measuredWrap(text,font,width){const rows=[''];for(const word of text.split(' ')){const at=rows.length-1,next=(rows[at]+' '+word).trim(),measure=await sharp({text:{text:next,font}}).metadata();if(rows[at]&&measure.width>width)rows.push(word);else rows[at]=next;}return rows;}
for(const locale of storyboard.locales)for(const scene of storyboard.scenes){const {title,body}=scene.text[locale];COPY.set(`${locale}:${scene.id}`,{title:await measuredWrap(title,'Arial Bold 66',445),body:await measuredWrap(body,'Arial 31',445)});}
function copy(scene,locale,ink){const rows=COPY.get(`${locale}:${scene.id}`);let s='';rows.title.forEach((row,i)=>s+=txt(66,265+i*76,row,66,ink,800));rows.body.forEach((row,i)=>s+=txt(69,295+rows.title.length*76+i*42,row,31,ink,400));return s;}
function panel(accent=C.white){return rr(570,145,640,480,30,accent);}
function wave(x,y,w,h,t,color=C.black){return Array.from({length:42},(_,i)=>{const value=(.22+.78*Math.abs(Math.sin(i*1.81)*Math.cos(i*.56+t*3)))*h;return `<rect x="${x+i*w/42}" y="${y+(h-value)/2}" width="${Math.max(2,w/42-4)}" height="${value}" rx="3" fill="${color}"/>`;}).join('');}
function audioTimeline(d,local,{second=true,junction=3,sourceStart=0,play=true}={}){
 const x=615,w=540,y=280,firstWidth=w*junction/6,secondWidth=w*.5;
 let s=txt(x,233,'0 s',27)+txt(x+w,233,'6 s',27,C.black,700,'end');
 s+=txt(x,y-12,d.sound1,29)+rr(x,y,w,80,15,'#EEEEEE',C.black,2)+rr(x,y,firstWidth,80,15,C.blue,C.black,2)+wave(x+12,y+18,Math.max(15,firstWidth-24),44,local);
 if(second)s+=txt(x,y+130,d.sound2,29)+rr(x,y+145,w,80,15,'#EEEEEE',C.black,2)+rr(x+firstWidth,y+145,Math.min(secondWidth,w-firstWidth),80,15,C.coral,C.black,2)+wave(x+firstWidth+12,y+164,Math.max(15,Math.min(secondWidth,w-firstWidth)-24),42,local+.7);
 if(play){const head=x+((local*1.3)%6)/6*w;s+=line(head,y-5,head,y+(second?235:90),C.black,4);}
 return s;
}
function sceneArt(scene,t,locale){
 const d=dict[locale],u=t-scene.start,dur=scene.end-scene.start,p=clamp(u/dur),pulse=clamp((u%2)/.7),meme=source('working-cat',t);
 let s='';
 switch(scene.id){
 case'intro':{
  const pop=ease(u/.9);s+=`<g transform="translate(640 280) scale(${.6+.4*pop}) translate(-640 -280)">${logo(405,225,1.8,C.black)}</g>`;
  s+=txt(640,430,scene.text[locale].body,46,C.black,700,'middle');
  const slots=[['dancing-cat',130,130,-12],['working-cat',925,120,11],['cooking-monkey',90,440,9],['side-eye-dog',970,440,-10]];
  slots.forEach(([name,x,y,a],i)=>{const e=ease((u-i*.3)/.7);s+=`<g opacity="${e}" transform="translate(0 ${60*(1-e)+Math.sin(t*2+i)*8})">${sticker(name,t,x,y,170,a)}</g>`;});break;
 }
 case'import-media':{
  s+=panel();const grow=ease((u-2)/1.3);s+=rr(758,225,270,240,26,'#F2F2F2',C.black,2)+circle(893,340,48,C.green)+plus(893,340,22);
  const names=['happy-dog','working-cat','cooking-monkey'],labels=[d.photo,'GIF',d.video];
  names.forEach((name,i)=>{const x=605+i*195,y=420-(i===1?grow*100:0),size=i===1?lerp(170,265,grow):170;s+=`<g opacity="${i===1?1:1-grow*.65}">${sticker(name,t,x-(i===1?grow*46:0),y,size,(i-1)*5)}${txt(x+82,y+size*.75+45,labels[i],29,C.black,700,'middle')}</g>`;});
  if(u<2.8)s+=cursor(885,330,clamp((u-1.3)*2));break;
 }
 case'import-link':{
  s+=panel(C.blue);const text='https://x.com/…',n=Math.floor(clamp((u-.6)/2)*text.length);
  s+=rr(615,215,545,80,18,C.white)+txt(637,266,text.slice(0,n),38);
  s+=pill(790,320,190,d.paste,C.green,36);
  if(u<4.6)s+=cursor(870,350,clamp((u-3.1)*1.3));
  if(u>3.7){const a=ease((u-3.7)/.7);s+=`<g opacity="${a}" transform="translate(0 ${40*(1-a)})">${sticker('working-cat',t,790,425,210,-5)}${circle(1042,512,29,C.green)}${check(1042,512)}</g>`;}break;
 }
 case'place-text':{
  s+=panel();s+=media('working-cat',t,665,195,440,330,22);
  const move=ease((u-2.3)/2.5),x=lerp(850,892,move),y=lerp(280,475,move),caption=d.caption.slice(0,Math.floor(clamp((u-.3)/1.2)*d.caption.length));
  const w=Math.max(120,caption.length*19+28);s+=rr(x-w/2,y-36,w,65,15,u>5?C.coral:C.white,C.black,2)+txt(x,y+9,caption,34,C.black,800,'middle');
  if(u>1.8&&u<5.3)s+=cursor(x+w/2-15,y+10,.1);
  [C.white,C.coral,C.blue].forEach((color,i)=>s+=circle(805+i*77,575,24,color));s+=txt(650,586,d.text,30);break;
 }
 case'place-emoji':{
  s+=panel();s+=media('working-cat',t,665,195,440,330,22);
  const a=ease((u-1.6)/3),x=lerp(880,1046,a),y=lerp(375,232,a),scale=1+Math.sin(clamp((u-5)/2)*Math.PI)*.3;
  s+=rr(745,460,285,52,13,C.coral,C.black,2)+txt(887,496,d.caption,29,C.black,800,'middle')+laugh(x,y,scale);
  if(u<5.1)s+=cursor(x+10,y+17,clamp((u-.8)*2));s+=txt(655,591,d.emoji,31);[0,1,2].forEach(i=>s+=laugh(875+i*100,577,.58));break;
 }
 case'background':{
  s+=panel();const x=665,y=195,w=440,h=330,wipe=clamp((u-1.5)/2),bg=u>6.7?C.coral:u>4.8?C.yellow:null;
  s+=bg?rr(x,y,w,h,22,bg,C.black,2):checker(x,y,w,h);
  const clip='cat-cut';s+=`<defs><clipPath id="${clip}"><path transform="translate(${x} ${y}) scale(${w/160} ${h/120})" d="M94 6 101 14 110 13 116 7 120 18 125 27 123 36Q147 46 145 73L139 86Q120 99 97 86L88 66 71 51 70 43 82 44 89 40 86 28 90 21Z"/></clipPath><clipPath id="wipe-original"><rect x="${x+w*wipe}" y="${y}" width="${w*(1-wipe)}" height="${h}"/></clipPath></defs><image href="${meme}" x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#${clip})"/><image href="${meme}" x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#wipe-original)"/>`;
  if(wipe>0&&wipe<1)s+=line(x+w*wipe,y,x+w*wipe,y+h,C.blue,6);
  s+=pill(635,550,325,d.remove,C.green,27);[C.yellow,C.coral].forEach((color,i)=>s+=circle(1030+i*75,583,25,color));if(u>4.5&&u<7.8)s+=cursor(u>6.5?1106:1030,583,.3);break;
 }
 case'trim-animation':{
  s+=panel();s+=sticker('jumping-cat',t,795,190,205,-3);const x=615,y=430,w=540,a=ease((u-1.4)/2),start=lerp(0,1,a),end=lerp(6,5,a),left=x+start/6*w,right=x+end/6*w;
  for(let i=0;i<6;i++)s+=media('jumping-cat',i*.18, x+i*90,y,89,80,0);
  s+=`<rect x="${x}" y="${y}" width="${left-x}" height="80" fill="#17171799"/><rect x="${right}" y="${y}" width="${x+w-right}" height="80" fill="#17171799"/>`+rr(left,y-6,right-left,92,9,'none',C.green,5)+rr(left-10,y-6,20,92,7,C.green,C.black,2)+rr(right-10,y-6,20,92,7,C.green,C.black,2);
  const head=left+(u*80)%(right-left);s+=line(head,y-12,head,y+92,C.yellow,4)+txt(x,y+125,'0 s',29)+txt(x+w,y+125,'6 s',29,C.black,700,'end');
  if(u<4)s+=cursor(right,y+75,.1);break;
 }
 case'original-sound':{
  s+=panel();s+=sticker('working-cat',t,780,185,230,-3)+speaker(1094,275);s+=txt(618,435,d.sound1,35)+rr(615,460,540,92,18,C.blue)+wave(635,477,495,56,u);
  s+=circle(1138,420,27,C.green)+check(1138,420)+pill(670,555,415,d.original,C.green,31);break;
 }
 case'second-sound':{
  s+=panel();let junction=3;if(u>5&&u<9)junction=lerp(3,2,ease((u-5)/1));else if(u>=9)junction=lerp(2,3,ease((u-9)/1));
  s+=audioTimeline(d,u,{junction});s+=pill(710,557,360,d.after,C.green,33);
  if(u>4&&u<10)s+=cursor(615+junction/6*540,335,.1);break;
 }
 case'source-excerpt':{
  s+=panel();s+=txt(615,220,d.source,31);s+=rr(615,242,540,88,15,'#EEEEEE',C.black,2)+wave(630,262,510,45,u,C.black);
  const start=lerp(0,5,ease((u-.8)/2));s+=rr(615+start/10*540,237,162,98,12,'#FFB59D88',C.black,3)+txt(615,375,'0',27)+txt(1155,375,'10 s',27,C.black,700,'end');
  s+=txt(615,430,d.from,31)+pill(910,388,245,`${Math.round(start)} s`,C.coral,44);
  s+=txt(615,509,d.sticker,31)+rr(615,532,540,58,12,'#EEEEEE',C.black,2)+rr(615,532,270,58,12,C.blue,C.black,2)+rr(885,532,270,58,12,C.coral,C.black,2)+txt(750,572,'0–3 s',31,C.black,700,'middle')+txt(1020,572,'3–6 s',31,C.black,700,'middle');
  if(u<3.2)s+=cursor(1025,423,.1);else if(u>5&&u<8)s+=line(885+((u-5)%3)*90,525,885+((u-5)%3)*90,596,C.black,4);break;
 }
 case'collections':{
  s+=panel();const names=[d.reactions,d.animals,d.favorites],colors=[C.blue,C.green,C.yellow];
  names.forEach((label,i)=>{const x=605+i*195;s+=`<path d="M${x} 245v-36q0-12 12-12h56l23 24h74q14 0 14 14v112q0 14-14 14H${x+14}q-14 0-14-14Z" fill="${colors[i]}" stroke="${C.black}" stroke-width="3"/>`+txt(x+90,321,label,28,C.black,700,'middle');});
  const a=ease((u-1.5)/3),x=lerp(695,640,a),y=lerp(445,247,a),size=lerp(160,110,a);s+=sticker('working-cat',t,x,y,size,-5)+sticker('happy-dog',t,890,445,160,5);
  if(u<5)s+=cursor(x+size*.55,y+size*.45,.15);else s+=circle(736,340,25,C.green)+check(736,340);break;
 }
 case'export':{
  s+=panel();const a=ease((u-.2)/.7);s+=`<g opacity="${a}">${sticker('working-cat',t,640,220,210,-6)}${sticker('side-eye-dog',t,945,220,210,6)}</g>`;
  s+=pill(620,450,250,d.gif,C.yellow,31)+pill(910,450,265,d.withSound,C.blue,29)+speaker(1030,575);
  s+=line(735,548,735,596,C.black,6)+`<path d="M718 581l17 18 18-18" fill="none" stroke="${C.black}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  if(u<3.3)s+=cursor(740,483,clamp((u-1.7)*2));break;
 }
 }
 return s;
}
function svgFrame(t,locale){
 const scene=storyboard.scenes.find(s=>t>=s.start&&t<s.end)??storyboard.scenes.at(-1),index=storyboard.scenes.indexOf(scene),u=t-scene.start;
 const dark=[2,5,8].includes(index),bg=dark?C.black:C.white,ink=dark?C.white:C.black,enter=ease(u/.5),exit=ease((scene.end-t)/.3);
 let s=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="1280" height="720" fill="${bg}"/>`;
 if(scene.id!=='intro')s+=logo(65,40,.78,ink);
 for(let i=0;i<storyboard.scenes.length;i++)s+=`<rect x="${888+i*24}" y="57" width="${i===index?18:9}" height="9" rx="4" fill="${i===index?ACCENTS[index%4]:dark?'#555555':'#DDDDDD'}"/>`;
 s+=`<g opacity="${enter*exit}" transform="translate(${(1-enter)*35} 0)">${scene.id==='intro'?'':copy(scene,locale,ink)}${sceneArt(scene,t,locale)}</g>`;
 s+=`<rect x="65" y="678" width="1150" height="4" rx="2" fill="${dark?'#424242':'#E2E2E2'}"/><rect x="65" y="678" width="${1150*t/120}" height="4" rx="2" fill="${ACCENTS[index%4]}"/></svg>`;
 return Buffer.from(s);
}
async function frame(t,locale){return sharp(svgFrame(t,locale)).jpeg({quality:89,chromaSubsampling:'4:4:4'}).toBuffer();}
async function poster(locale){const file=path.join(OUT,`zapstick-intro-${locale.toLowerCase()}.jpg`);await sharp(svgFrame(5.3,locale)).jpeg({quality:92}).toFile(file);return file;}
const LIMITED='scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p';
if(args.includes('--normalize-only')){
 for(const locale of locales){
  const file=path.join(OUT,`zapstick-intro-${locale.toLowerCase()}.mp4`),temp=path.join(QA,`${locale}-limited.mp4`);
  const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',file,'-map','0:v:0','-map','0:a:0','-vf',LIMITED,'-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-t','120','-frames:v',String(FPS*120),'-c:v','libx264','-preset','medium','-b:v','380k','-maxrate','450k','-bufsize','900k','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',temp],{stdio:['ignore','ignore','inherit']});
  const [code]=await once(ff,'close');if(code!==0)throw new Error(`Normalization failed: ${locale}`);
  await fs.rename(temp,file);console.log(`${locale}: normalized to limited-range BT.709`);
 }
 process.exit(0);
}
if(args.includes('--stills')){
 for(const locale of locales){for(const scene of storyboard.scenes){await sharp(svgFrame(scene.start+(scene.end-scene.start)*.56,locale)).png().toFile(path.join(QA,`${locale}-${scene.id}.png`));}await poster(locale);}
 console.log(`Stills prepared in ${QA}`);process.exit(0);
}
await fs.access(AUDIO);
for(const locale of locales){
 const file=path.join(OUT,`zapstick-intro-${locale.toLowerCase()}.mp4`),total=120*FPS;
 console.log(`Rendering ${locale}: ${total} frames at ${FPS} fps → ${file}`);
 const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS),'-vcodec','mjpeg','-i','pipe:0','-i',AUDIO,'-map','0:v:0','-map','1:a:0','-vf',LIMITED,'-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-t','120','-frames:v',String(total),'-c:v','libx264','-preset','medium','-b:v','380k','-maxrate','450k','-bufsize','900k','-pix_fmt','yuv420p','-profile:v','high','-c:a','aac','-b:a','64k','-ar','44100','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
 let error='';ff.stderr.on('data',data=>{error+=data;});const finished=once(ff,'close');
 ff.stdin.on('error',()=>{});
 for(let i=0;i<total;i++){
  if(ff.exitCode!==null)throw new Error(error||'ffmpeg exited before receiving all frames');
  const jpeg=await frame(i/FPS,locale);
  if(!ff.stdin.write(jpeg))await once(ff.stdin,'drain');
  if(i%Math.round(FPS*15)===0)console.log(`${locale}: ${Math.round(i/FPS)} / 120 s`);
 }
 ff.stdin.end();const [code]=await finished;if(code!==0)throw new Error(error||`ffmpeg failed: ${code}`);
 await poster(locale);console.log(`${locale}: complete (${(await fs.stat(file)).size} bytes)`);
}
