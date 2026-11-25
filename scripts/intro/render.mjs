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
const W=1280,H=720,FPS=Number(option('--fps','30')),AUDIO=option('--audio','/tmp/zapstick-intro-v2-music.wav');
const storyboard=JSON.parse(await fs.readFile(path.join(ROOT,'scripts/intro/storyboard.json'),'utf8'));
if(storyboard.duration!==120||storyboard.scenes[0].start!==0||storyboard.scenes.at(-1).end!==120||storyboard.scenes.some((s,i)=>s.end<=s.start||(i&&s.start!==storyboard.scenes[i-1].end)))throw new Error('Storyboard must be contiguous and exactly 120 seconds.');
const requested=option('--locale','all'),locales=requested==='all'?storyboard.locales:[requested];
if(locales.some(locale=>!storyboard.locales.includes(locale)))throw new Error('Unknown locale.');
const OUT=path.join(ROOT,'public/videos'),QA=path.join(ROOT,'outputs/intro-v2');
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
const speaker=(x,y,color=C.black)=>`<path d="M${x-20} ${y-10}h11l15-12v44L${x-9} ${y+10}h-11Z" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/><path d="M${x+16} ${y-15}q18 15 0 30M${x+26} ${y-25}q28 25 0 50" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
const cursor=(x,y,pulse=0)=>`<g transform="translate(${x} ${y})">${pulse?`<circle r="${26+pulse*26}" fill="none" stroke="${C.coral}" stroke-width="${7*(1-pulse)}" opacity="${1-pulse}"/>`:''}<path d="M0 0L8 39l10-11 14 20 10-7-14-20 16-3Z" fill="${C.white}" stroke="${C.black}" stroke-width="4" stroke-linejoin="round"/></g>`;
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
function laugh(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})">${circle(0,0,38,C.yellow)}<path d="M-25-8q8-12 17 0M8-8q8-12 17 0" fill="none" stroke="${C.black}" stroke-width="5" stroke-linecap="round"/><path d="M-22 8q22 39 44 0Z" fill="${C.black}"/><path d="M-14 25q15-7 28 0q-14 12-28 0" fill="${C.coral}"/><path d="M-30-2q-23 20-10 25q16 4 10-25M30-2q23 20 10 25q-16 4-10-25" fill="${C.blue}" stroke="${C.black}" stroke-width="2"/></g>`;}
// The film is a deterministic stage, not a stack of slides. The camera and every
// card are evaluated from the absolute timestamp, so cuts, scrubbing and export
// all produce the same pose. Projection is an affine tangent to a 3D card plane.
const spring=(t,f=2.7,d=.43)=>{if(t<=0)return 0;const w=2*Math.PI*f,wd=w*Math.sqrt(1-d*d);return 1-Math.exp(-d*w*t)*(Math.cos(wd*t)+d*w/wd*Math.sin(wd*t));};
const impact=t=>t<0?0:Math.exp(-8*t)*Math.sin(t*32);
const phase=(t,a,b)=>clamp((t-a)/(b-a));
const mix=(a,b,p)=>a+(b-a)*p;
const COLORS=[C.green,C.blue,C.coral,C.yellow];
let seq=0;
function imageLocal(name,t,w,h){const id=`clip-${seq++}`;return `<defs><clipPath id="${id}"><rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="25"/></clipPath></defs><image href="${source(name,t)}" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;}
function project(x,y,z,cam){const cr=Math.cos(cam.roll),sr=Math.sin(cam.roll),dx=x-cam.x,dy=y-cam.y,xx=dx*cr-dy*sr,yy=dx*sr+dy*cr,cy=Math.cos(cam.pitch),sy=Math.sin(cam.pitch),vertical=yy*cy-z*sy,depth=yy*sy+z*cy,k=1050/Math.max(240,1050-depth)*cam.zoom;return[640+xx*k,360+vertical*k,depth];}
function place(content,{x=0,y=0,z=0,rx=0,ry=0,rz=0,s=1,w=400,h=300,back=C.green,opacity=1,shadow=false}={},cam){
 const a=Math.cos(ry),b=Math.sin(ry),c=Math.cos(rx),d=Math.sin(rx),cz=Math.cos(rz),sz=Math.sin(rz);
 const point=(u,v)=>{let xx=u*a,zz=-u*b,yy=v*c-zz*d;zz=v*d+zz*c;return project(x+(xx*cz-yy*sz)*s,y+(xx*sz+yy*cz)*s,z+zz*s,cam);};
 const p=point(0,0),u=point(1,0),v=point(0,1);let aa=u[0]-p[0],bb=u[1]-p[1],cc=v[0]-p[0],dd=v[1]-p[1];const reverse=aa*dd-bb*cc<0;
 if(reverse){aa=-aa;bb=-bb;content=rr(-w/2,-h/2,w,h,30,back,C.black,5)+plus(0,0,42,C.black);}
 const m=[aa,bb,cc,dd,p[0],p[1]].map(n=>n.toFixed(5)).join(' ');
 const shade=shadow?`<g transform="matrix(${m})" opacity=".12">${rr(-w/2+11,-h/2+17,w,h,30,C.black,'none',0)}</g>`:'';
 return shade+`<g opacity="${opacity}" transform="matrix(${m})">${content}</g>`;
}
function card(name,t,pose,cam){const w=pose.w??420,h=pose.h??w*.75;return place(rr(-w/2-9,-h/2-9,w+18,h+18,34,C.white,C.black,5)+imageLocal(name,t,w,h),{...pose,w,h,shadow:true},cam);}
function plate(label,color,w=500,h=145,size=80){return rr(-w/2,-h/2,w,h,25,color,C.black,5)+txt(0,size*.34,label,size,C.black,900,'middle');}
function burst(x,y,t,color=C.yellow,scale=1){const p=phase(t,0,.55);if(p<=0||p>=1)return'';let out=`<circle cx="${x}" cy="${y}" r="${(25+170*ease(p))*scale}" stroke="${color}" stroke-width="${9*(1-p)}" fill="none"/>`;for(let i=0;i<12;i++){const a=i*Math.PI/6,r=(60+150*ease(p))*scale,l=35*(1-p)*scale;out+=line(x+Math.cos(a)*r,y+Math.sin(a)*r,x+Math.cos(a)*(r+l),y+Math.sin(a)*(r+l),i%2?color:C.white,6*(1-p));}return out;}
const WIDTHS=new Map();
for(const char of new Set([...storyboard.scenes.flatMap(s=>Object.values(s.text).map(v=>v.title)).join(''),...'ZAPSTICKPHOTO GIFVIDÉOYESNOGOBOOMMORESTICKERSREACTTYPEMOVE5sMP4+1&2♥'].join(''))){const meta=await sharp({text:{text:char===' '?'i':xml(char),font:'Arial Bold 100'}}).metadata();WIDTHS.set(char,char===' '?28:meta.width+5);}
function kinetic(text,t,{x=0,y=-210,size=140,fill=C.black,tilt=0,max=1120,stagger=.025}={},cam){
 let widths=[...text].map(ch=>(WIDTHS.get(ch)??62)*size/100),total=widths.reduce((a,b)=>a+b,0);if(total>max){const k=max/total;widths=widths.map(n=>n*k);size*=k;total=max;}
 let at=-total/2,out='';[...text].forEach((ch,i)=>{const pop=spring(t-i*stagger-.05,3,.46),offset=(1-pop)*130,rz=tilt+(1-pop)*(i%2?.35:-.35),scale=Math.max(.02,1+.13*impact(t-i*stagger-.12));out+=place(txt(0,size*.34,ch,size,fill,900,'middle'),{x:x+at+widths[i]/2,y:y-offset,z:20+90*(1-pop),rz,s:scale,w:widths[i],h:size,opacity:clamp(pop*2)},cam);at+=widths[i];});return out;
}
function hand(x,y,t,cam){return place(cursor(0,0,phase(t,0,.45)),{x,y,z:130,w:65,h:65},cam);}
function mark(pose,cam){return place(`<image href="${BRAND}" x="-150" y="-150" width="300" height="300"/>`,{w:300,h:300,...pose},cam);}
function spectrum(x,y,w,h,t,color=C.black){let out='';for(let i=0;i<36;i++){const v=(.18+.82*Math.abs(Math.sin(i*1.7+t*6)*Math.cos(i*.42-t*3)))*h;out+=rr(x+i*w/36,y-v/2,w/36-5,v,5,color,'none',0);}return out;}
function clipBlock(x,y,w,color,label,t,cam,extra={}){return place(rr(-w/2,-42,w,84,16,color,C.black,4)+spectrum(-w/2+12,0,w-24,44,t,C.black)+rr(-30,-28,60,56,10,C.white,C.black,2)+txt(0,12,label,34,C.black,900,'middle'),{x,y,w,h:84,...extra},cam);}
function folder(label,color,pose,cam){return place(`<path d="M-200-95v-35q0-20 20-20h100l35 35h220q25 0 25 25V120q0 25-25 25h-350q-25 0-25-25Z" fill="${color}" stroke="${C.black}" stroke-width="5"/>`+txt(0,43,label,58,C.black,900,'middle'),{w:400,h:280,...pose},cam);}
function heart(x,y,s=1,color=C.coral){return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 42C-135-40-69-131 0-62C69-131 135-40 0 42Z" fill="${color}" stroke="${C.black}" stroke-width="6" stroke-linejoin="round"/></g>`;}
function cutout(t,pose,cam){const id=`cut-${seq++}`,w=pose.w??430,h=w*.75;const p=`M94 6 101 14 110 13 116 7 120 18 125 27 123 36Q147 46 145 73L139 86Q120 99 97 86L88 66 71 51 70 43 82 44 89 40 86 28 90 21Z`;return place(`<defs><clipPath id="${id}"><path transform="translate(${-w/2} ${-h/2}) scale(${w/160} ${h/120})" d="${p}"/></clipPath></defs><image href="${source('working-cat',t)}" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" clip-path="url(#${id})"/>`,{...pose,w,h},cam);}
function ruler(y,{join=3,shift=0,labels=true,head=0}={},cam){const w=940,x=-470,first=w*join/6,second=w*.5;let out=place(rr(x,-60,w,120,22,C.white,C.black,4),{x:0,y,w,h:120},cam);out+=clipBlock(x+first/2,y,first,C.blue,'1',head,cam);out+=clipBlock(x+first+second/2,y+shift,Math.min(second,w-first),C.coral,'2',head+.3,cam);if(labels)out+=place(txt(x,117,'0',52)+txt(x+first,117,`${join} s`,52,C.black,900,'middle')+txt(470,117,'6 s',52,C.black,900,'end'),{y,w,h:240},cam);return out;}
const WORDS={
 fr:{react:'TES RÉACTIONS',big:'EN GRAND',go:'ÇA PART !',import:'IMPORTE',photo:'PHOTO',gif:'GIF',video:'VIDÉO',moves:'ÇA BOUGE',yours:'À TOI',link:'UN LIEN',paste:'COLLE',pop:'ET HOP !',words:'TES MOTS',type:'ÉCRIS',drag:'GLISSE',style:'TON STYLE',caption:'AU BOULOT !',emoji:'RÉAGIS',bam:'BOUM !',more:'ENCORE !',background:'SANS FOND',color:'EN COULEUR',moment:'LE MOMENT',cut:'COUPE',loop:'EN BOUCLE',original:'SON ORIGINAL',ready:'DÉJÀ LÀ',second:'DEUX SONS',after:'À LA SUITE',follow:'ÇA SUIT',excerpt:'À 5 S',same:'MÊME PLACE',listen:'ÉCOUTE',sorted:'BIEN RANGÉ',reactions:'RÉACTIONS',animals:'ANIMAUX',favorites:'TES FAVORIS',keep:'GARDE-LE',export:'C’EST PRÊT',sound:'MP4 + SON',create:'CRÉE',yes:'OUI !',no:'NON !'},
 en:{react:'YOUR REACTIONS',big:'GO BIG',go:'LET’S GO!',import:'IMPORT',photo:'PHOTO',gif:'GIF',video:'VIDEO',moves:'IT MOVES',yours:'YOUR TURN',link:'ONE LINK',paste:'PASTE',pop:'THERE IT IS!',words:'YOUR WORDS',type:'TYPE',drag:'DRAG',style:'YOUR STYLE',caption:'BACK TO WORK!',emoji:'REACT',bam:'BOOM!',more:'AGAIN!',background:'NO BACKGROUND',color:'ADD COLOR',moment:'THE MOMENT',cut:'TRIM',loop:'ON REPEAT',original:'ORIGINAL SOUND',ready:'ALREADY HERE',second:'TWO SOUNDS',after:'IN SEQUENCE',follow:'IT FOLLOWS',excerpt:'AT 5 S',same:'SAME PLACE',listen:'LISTEN',sorted:'ALL SORTED',reactions:'REACTIONS',animals:'ANIMALS',favorites:'YOUR FAVORITES',keep:'KEEP IT',export:'READY TO GO',sound:'MP4 + SOUND',create:'CREATE',yes:'YES!',no:'NO!'},
 'pt-BR':{react:'SUAS REAÇÕES',big:'EM GRANDE',go:'BORA!',import:'IMPORTE',photo:'FOTO',gif:'GIF',video:'VÍDEO',moves:'TEM MOVIMENTO',yours:'SUA VEZ',link:'UM LINK',paste:'COLE',pop:'PRONTINHO!',words:'SUAS PALAVRAS',type:'ESCREVA',drag:'ARRASTE',style:'SEU ESTILO',caption:'BORA TRABALHAR!',emoji:'REAJA',bam:'BUM!',more:'MAIS!',background:'SEM FUNDO',color:'COM COR',moment:'O MOMENTO',cut:'CORTE',loop:'EM LOOP',original:'SOM ORIGINAL',ready:'JÁ ESTÁ AQUI',second:'DOIS SONS',after:'EM SEQUÊNCIA',follow:'ELE ACOMPANHA',excerpt:'AOS 5 S',same:'MESMA POSIÇÃO',listen:'OUÇA',sorted:'TUDO EM ORDEM',reactions:'REAÇÕES',animals:'ANIMAIS',favorites:'SEUS FAVORITOS',keep:'GUARDE',export:'PRONTINHO',sound:'MP4 + SOM',create:'CRIE',yes:'SIM!',no:'NÃO!'}
};
function kineticArt(t,locale){
 seq=0;const chapter=Math.min(14,Math.floor(t/8)),shot=Math.floor(t%8/2),q=t%2,s=phase(q,0,1.75),e=spring(q-.12),d=WORDS[locale],dark=(chapter+shot)%4===0;
 const bg=[C.black,C.green,C.white,C.blue,C.coral,C.yellow][(chapter*2+shot)%6],ink=bg===C.black?C.white:C.black;
 const cam={x:Math.sin(t*.37)*12,y:Math.cos(t*.43)*8,zoom:1+.07*s,roll:Math.sin(q*1.1+chapter)*.035,pitch:(shot===1?.32:shot===3?-.12:.04)*(1-.6*s)};
 const shake=impact(q-.12)*(chapter%3===0?10:6),roll=impact(q-.12)*.004;
 let out='',title='',titleY=-225;
 const hero=(name='working-cat',pose={})=>card(name,t,{x:0,y:65,w:470,rx:.05*Math.sin(q*2),ry:.15*Math.sin(q*1.8),rz:.03*Math.sin(t),...pose},cam);
 const closeups={2:[3],3:[2,3],4:[1,2],5:[1,2,3],6:[1,2],7:[1,2],8:[1,2],9:[1,2,3],10:[1,2],11:[1,2],12:[1,3],13:[1,2]};
 const closeup=closeups[chapter]?.includes(shot);if(closeup){cam.zoom=1.18+.1*s;cam.y=65;cam.roll=Math.sin(q*1.3+chapter)*.055;}
 const label=(word,opts={})=>closeup?'':kinetic(word,q,{fill:ink,...opts},cam);
 const ring=()=>burst(640,360,q-.12,COLORS[(chapter+shot)%4],1.2);
 if(chapter===0){
  if(shot===0){const fly=ease(phase(q,0,.14));out+=line(-200,360,640*fly,360,C.green,24);out+=mark({x:0,y:0,z:mix(-450,80,e),rx:mix(1.6,0,e),ry:mix(-1,0,e),rz:mix(-.5,.03,e),s:1.3+.04*Math.sin(q*6)},cam)+ring();}
  if(shot===1){out+=label(d.react,{y:-185,size:150});out+=hero('working-cat',{x:-225,y:125,w:440,rz:-.2+q*.07,ry:.3*Math.sin(q)});out+=card('side-eye-dog',t,{x:275,y:115,w:340,ry:-.4,rz:.2,z:80*Math.sin(q)},cam);}
  if(shot===2){out+=label(d.big,{y:-190,size:190});for(let i=0;i<3;i++)out+=card(['dancing-cat','cooking-monkey','happy-dog'][i],t,{x:(i-1)*355,y:90+Math.sin(q*3+i)*45,z:(i===1?130:0)+35*Math.sin(q+i),w:315,rx:.3,ry:(i-1)*-.5+q*.12,rz:(i-1)*.11},cam);}
  if(shot===3){out+=label(d.go,{y:-200,size:180});out+=place(rr(-220,-150,440,300,40,C.green,C.black,6)+plus(0,0,75),{x:0,y:65,z:70,ry:mix(-Math.PI,0,e),rz:mix(.6,-.1,e),s:1+.08*Math.sin(q*4)},cam);out+=hand(100,130,q-.9,cam)+ring();}
 }
 if(chapter===1){
  if(shot===0){out+=label(d.import,{size:180});out+=place(rr(-220,-150,440,300,40,C.green,C.black,6)+plus(0,0,70),{y:80,z:80,rx:mix(1.4,.1,e),rz:mix(-.5,.05,e)},cam);out+=hand(60,130,q-.5,cam);}
  if(shot===1){out+=label(`${d.photo} / GIF`,{y:-225,size:145});for(let i=0;i<3;i++)out+=card(['happy-dog','working-cat','jumping-cat'][i],t,{x:(i-1)*340,y:95+50*Math.sin(q*2+i),z:i===1?100:0,w:330,rx:.35,ry:(i-1)*-.55,rz:(i-1)*.13+impact(q-.12)*.07},cam);}
  if(shot===2){out+=label(d.moves,{y:-235,size:150});out+=hero('jumping-cat',{w:520,y:90,ry:mix(1.25,0,e),rz:-.09+q*.07,z:30+q*35});out+=ring();}
  if(shot===3){out+=label(d.yours,{y:-220,size:170});out+=hero('working-cat',{y:80,w:520,rx:.24*Math.sin(q*2),ry:.5*Math.sin(q*2)});out+=place(circle(0,0,66,C.yellow)+check(0,0),{x:270,y:170,z:170,s:.5+.5*e,w:140,h:140},cam);}
 }
 if(chapter===2){
  title=[d.link,d.paste,d.pop,d.go][shot];out+=label(title,{size:170});
  if(shot<2){const href=shot===0?'x.com/…':'https://…';out+=place(plate(href,C.white,920,155,95),{y:70,ry:mix(.85,0,e),rz:shot===0?-.08:.05,z:60},cam);if(shot===1)out+=hand(280,105,q-.55,cam);}
  else{out+=hero('working-cat',{x:shot===3?200*Math.sin(q):0,y:70,w:550,ry:shot===2?mix(Math.PI,0,e):.1,rz:shot===2?-.07:.12});out+=ring();}
 }
 if(chapter===3){
  const words=[d.words,d.type,d.drag,d.style];out+=label(words[shot],{size:170});
  if(shot===0){out+=place(plate('Aa',C.coral,480,300,200),{y:80,ry:mix(-Math.PI,0,e),rz:-.1+q*.07},cam);}
  else{out+=hero('working-cat',{y:65,w:530,rz:-.05});const p=ease(phase(q,.2,1.45)),x=shot===2?mix(-170,155,p):0,y=shot===2?mix(-30,205,p):shot===3?180:30;out+=place(plate(d.caption,shot===3?C.blue:C.coral,Math.min(650,d.caption.length*34+65),100,54),{x,y,z:135,rz:shot===3?Math.sin(q*2)*.1:0},cam);if(shot===2)out+=hand(x+120,y+40,q-.5,cam);if(shot===3)for(let i=0;i<3;i++)out+=place(circle(0,0,30,COLORS[i]),{x:(i-1)*140,y:290,z:150,s:.8+.2*Math.sin(q*4+i),w:60,h:60},cam);}
 }
 if(chapter===4){
  out+=label([d.emoji,d.bam,d.yours,d.more][shot],{size:180});
  if(shot===0)out+=place(laugh(0,0,3.3),{y:95,z:80,ry:mix(2,0,e),rz:impact(q-.12)*.3,w:370,h:370},cam);
  else{out+=hero('happy-dog',{w:500,y:85,ry:.12*Math.sin(q*2)});const p=ease(phase(q,.2,1.5)),x=shot===1?mix(0,200,p):shot===2?-205:190,y=shot===1?mix(85,-40,p):shot===2?160:180;out+=place(laugh(0,0,shot===3?2.1:1.8),{x,y,z:200,rz:.2*Math.sin(q*3),w:190,h:190},cam);if(shot<3)out+=hand(x+38,y+43,q-.7,cam);out+=ring();}
 }
 if(chapter===5){
  out+=label([d.background,d.color,d.yours,d.pop][shot],{size:155});
  if(shot===0){out+=hero('working-cat',{w:580,y:80,ry:mix(-1,0,e)});const wipe=phase(q,.5,1.4);out+=place(rr(-310,-230,620*wipe,460,0,C.yellow,'none',0),{x:-310*(1-wipe),y:80,z:60,w:620,h:460},cam);out+=cutout(t,{x:0,y:80,w:580,z:100},cam);}
  else{out+=place(rr(-315,-215,630,430,36,COLORS[(shot+1)%4],C.black,5),{y:80,rx:mix(.8,0,e),rz:.04*Math.sin(q),w:630,h:430},cam);out+=cutout(t,{x:shot===2?80*Math.sin(q*2):0,y:80,w:580,z:60,ry:shot===3?Math.sin(q)*.5:0},cam);for(let i=0;i<3;i++)out+=place(circle(0,0,31,COLORS[i]),{x:(i-1)*135,y:290,z:170,w:65,h:65},cam);if(shot===1)out+=hand(135,275,q-.6,cam);}
 }
 if(chapter===6){
  out+=label([d.moment,d.cut,d.loop,d.go][shot],{size:170});
  if(shot===0){for(let i=0;i<6;i++)out+=card('jumping-cat',t+i*.17,{x:(i-2.5)*208,y:70,w:205,z:30,rx:.45,ry:.22,rz:-.13},cam);}
  if(shot===1){const a=ease(phase(q,.2,1.2));for(let i=0;i<6;i++)out+=card('jumping-cat',i*.15,{x:(i-2.5)*170,y:50,w:168,opacity:i<1||i>4?.3:1},cam);for(const x of[-500+170*a,500-170*a])out+=place(rr(-15,-100,30,200,10,C.green,C.black,5),{x,y:50,z:100,w:40,h:200},cam);out+=hand(500-170*a,100,q-.5,cam);}
  if(shot===2){out+=hero('jumping-cat',{w:520,y:65,rz:.1*Math.sin(q*2)});out+=place(txt(0,55,'↻',170,C.green,900,'middle'),{x:360,y:80,z:70,rz:q*.7,w:200,h:200},cam);}
  if(shot===3){out+=hero('jumping-cat',{w:520,y:65,ry:mix(Math.PI,0,e)});out+=place(plate('6 s',C.yellow,220,130,84),{x:325,y:220,z:160,rz:.15},cam);}
 }
 if(chapter===7){
  out+=label([d.original,d.ready,d.listen,d.go][shot],{size:140});
  if(shot===0)out+=hero('working-cat',{x:-200,y:80,w:500,ry:.3});
  if(shot===0)out+=place(speaker(0,0),{x:330,y:100,z:80,s:3+.2*Math.sin(q*12),w:170,h:170},cam);
  if(shot===1){out+=place(speaker(0,0),{x:-350,y:50,z:100,s:3,w:170,h:170},cam);out+=clipBlock(110,65,650,C.blue,'1',q,cam,{ry:mix(-1,0,e)});out+=place(circle(0,0,45,C.green)+check(0,0),{x:400,y:145,z:160,w:90,h:90},cam);}
  if(shot===2){out+=place(spectrum(-470,0,940,240,q,COLORS[shot]),{y:80,w:960,h:260,ry:.12*Math.sin(q*2)},cam);}
  if(shot===3){out+=hero('working-cat',{w:520,y:40,rz:.04});out+=clipBlock(0,250,760,C.blue,'1',q,cam);}
 }
 if(chapter===8){
  out+=label([d.second,d.after,d.follow,d.pop][shot],{size:165});
  const join=shot===2?mix(3,2,ease(phase(q,.3,1.1))):shot===3?mix(2,3,ease(phase(q,.2,1))):3;
  out+=ruler(65,{join,shift:shot===0?mix(-420,0,e):0,head:q},cam);if(shot===2)out+=hand(-470+940*join/6,110,q-.6,cam);out+=ring();
 }
 if(chapter===9){
  out+=label([d.excerpt,d.listen,d.same,d.go][shot],{size:180});
  if(shot===0){out+=place(plate('5 s',C.coral,600,330,225),{y:70,ry:mix(Math.PI,0,e),rz:-.08},cam);}
  if(shot===1){out+=place(rr(-490,-70,980,140,25,C.white,C.black,4)+spectrum(-460,0,920,80,q,C.black),{y:0,w:980,h:140,rz:-.05},cam);out+=place(rr(-120,-90,240,180,18,'#FFB59D99',C.black,5),{x:mix(-300,180,ease(phase(q,.2,1.3))),y:0,z:100,w:240,h:180},cam);out+=place(txt(-430,190,'0',65)+txt(170,190,'5 s',75)+txt(420,190,'8 s',65),{y:0,w:980,h:400},cam);}
  if(shot>1){out+=ruler(85,{join:3,head:q},cam);out+=place(plate('5 s',C.coral,280,125,84),{x:260,y:-50,z:130,rz:.08*Math.sin(q*3)},cam);if(shot===3)out+=hand(280,-15,q-.5,cam);}
 }
 if(chapter===10){
  out+=label([d.sorted,d.reactions,d.animals,d.pop][shot],{size:155});
  if(shot===0){for(let i=0;i<3;i++)out+=folder(i===0?d.reactions:i===1?d.animals:'♥',COLORS[i],{x:(i-1)*385,y:100,z:i===1?60:0,s:.8,ry:(i-1)*-.45,rz:(i-1)*.1},cam);}
  if(shot===1){out+=folder(d.reactions,C.blue,{y:110,rx:-.15,ry:.15},cam);const p=ease(phase(q,.15,1.2));out+=card('working-cat',t,{x:mix(-420,0,p),y:mix(-100,65,p),z:160,w:mix(300,155,p),rz:mix(-.5,.02,p)},cam);out+=hand(mix(-390,60,p),mix(-40,100,p),q-.5,cam);}
  if(shot===2){for(let i=0;i<4;i++)out+=card(['working-cat','happy-dog','jumping-cat','side-eye-dog'][i],t,{x:(i%2-.5)*390,y:(Math.floor(i/2)-.5)*210+95,w:285,rx:.28,ry:.1,rz:.05*Math.sin(q+i)},cam);}
  if(shot===3){out+=folder(d.reactions,C.blue,{y:110,s:1.35,ry:mix(Math.PI,0,e)},cam);out+=place(circle(0,0,58,C.green)+check(0,0),{x:250,y:220,z:200,w:130,h:130},cam);}
 }
 if(chapter===11){
  out+=label([d.favorites,d.keep,d.yes,d.more][shot],{size:155});
  if(shot===0)out+=place(heart(0,50,2.3),{y:120,ry:mix(-Math.PI,0,e),rz:.08*Math.sin(q*3),w:500,h:420},cam);
  else{out+=hero(shot===2?'side-eye-dog':'happy-dog',{w:520,y:80,rz:.09*Math.sin(q*2)});out+=place(heart(0,15,1.05),{x:215,y:190,z:180,rz:.2,s:Math.max(.01,e),w:200,h:180},cam);if(shot===1)out+=hand(210,180,q-.5,cam);out+=ring();}
 }
 if(chapter===12){
  out+=label([d.export,'GIF',d.sound,d.pop][shot],{size:170});
  if(shot===0){out+=card('working-cat',t,{x:-300,y:90,w:390,ry:.3,rz:-.12},cam)+card('happy-dog',t,{x:300,y:90,w:390,ry:-.3,rz:.12},cam);}
  if(shot===1){out+=hero('working-cat',{w:560,y:65,ry:mix(Math.PI,0,e)});out+=place(plate('GIF',C.yellow,220,105,65),{x:250,y:220,z:180,rz:.13},cam);}
  if(shot===2){out+=hero('side-eye-dog',{w:500,y:65,rz:.05});out+=place(speaker(0,0),{x:310,y:170,s:2.3,z:160,w:140,h:140},cam);}
  if(shot===3){out+=place(rr(-150,-170,300,340,30,C.green,C.black,6)+line(0,-100,0,70,C.black,14)+`<path d="M-55 20l55 60 55-60" fill="none" stroke="${C.black}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`,{y:85,z:70,rx:mix(1.5,0,e),rz:impact(q-.12)*.1},cam);out+=ring();}
 }
 if(chapter===13){
  out+=label([d.more,d.yes,d.no,d.react][shot],{size:180});
  const names=['dancing-cat','jumping-cat','cooking-monkey','working-cat','side-eye-dog','happy-dog'];
  for(let i=0;i<5;i++){const a=i*2.399+q*.5,r=i===0?0:370;out+=card(names[(i+shot)%6],t,{x:Math.cos(a)*r,y:95+Math.sin(a)*130,z:i===0?110:0,w:i===0?450:240,ry:.5*Math.sin(q*2+i),rz:Math.sin(i+q)*.18},cam);}
 }
 if(chapter===14){
  if(shot===0){out+=mark({y:0,z:50,s:1.7,ry:mix(-Math.PI,0,e),rz:impact(q-.12)*.15},cam)+ring();}
  if(shot===1){out+=label('zapstick',{y:0,size:205,fill:ink,max:1100,stagger:.06});for(let i=0;i<4;i++)out+=card(['dancing-cat','working-cat','happy-dog','cooking-monkey'][i],t,{x:(i<2?-1:1)*465,y:(i%2?1:-1)*230,w:210,ry:.4*Math.sin(q+i),rz:(i%2?1:-1)*.16},cam);}
  if(shot===2){out+=label(d.create,{y:-175,size:210});out+=mark({y:115,z:40,s:.9,ry:Math.sin(q*2)*.2},cam);}
  if(shot===3){out+=mark({x:-470,y:0,z:50,s:.6,ry:.06*Math.sin(q)},cam);out+=label('zapstick',{x:145,y:5,size:165,fill:ink,max:820,stagger:.04});out+=burst(640,360,q-.12,C.yellow,1.6);}
 }
 // Continuous camera drift plus short decaying impact shake. No fixed panels,
 // progress bars, narration column or hard-coded body text are drawn.
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${bg}"/><g transform="translate(${shake} ${-shake*.55}) rotate(${roll*180/Math.PI} 640 360)">${out}</g></svg>`;
}
function svgFrame(t,locale){return Buffer.from(kineticArt(t,locale));}

async function frame(t,locale){return sharp(svgFrame(t,locale)).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toBuffer();}
async function poster(locale){const file=path.join(OUT,`zapstick-intro-${locale.toLowerCase()}.jpg`);await sharp(svgFrame(118.7,locale)).jpeg({quality:92}).toFile(file);return file;}
const LIMITED='scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p';
const FROM=Number(option('--from','0')),DURATION=Number(option('--duration',args.includes('--preview')?'16':String(120-FROM)));
if(!Number.isInteger(FPS)||FPS<12||FPS>60||!Number.isFinite(FROM)||!Number.isFinite(DURATION)||FROM<0||DURATION<=0||FROM+DURATION>120)throw new Error('Invalid frame rate or time range.');
if(args.includes('--stills')){
 for(const locale of locales){for(let at=FROM;at<FROM+DURATION;at+=2){await sharp(svgFrame(Math.min(at+.7,FROM+DURATION-.01),locale)).png().toFile(path.join(QA,`${locale}-${String(Math.floor(at)).padStart(3,'0')}.png`));}if(!args.includes('--preview'))await poster(locale);}
 console.log(`V2 stills prepared in ${QA}`);process.exit(0);
}
await fs.access(AUDIO);
for(const locale of locales){
 const ranged=args.includes('--preview')||FROM!==0||DURATION!==120;
 const file=path.join(ranged?QA:OUT,ranged?`preview-${locale.toLowerCase()}.mp4`:`zapstick-intro-${locale.toLowerCase()}.mp4`),total=Math.round(DURATION*FPS);
 console.log(`Rendering v2 ${locale}: ${total} frames at ${FPS} fps, range ${FROM}–${FROM+DURATION}s → ${file}`);
 const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS),'-vcodec','mjpeg','-i','pipe:0','-ss',String(FROM),'-i',AUDIO,'-map','0:v:0','-map','1:a:0','-vf',LIMITED,'-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-t',String(DURATION),'-frames:v',String(total),'-c:v','libx264','-preset','medium','-b:v','650k','-maxrate','850k','-bufsize','1700k','-pix_fmt','yuv420p','-profile:v','high','-c:a','aac','-b:a','80k','-ar','44100','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
 let error='';ff.stderr.on('data',data=>{error+=data;});const finished=once(ff,'close');ff.stdin.on('error',()=>{});
 for(let i=0;i<total;i++){
  if(ff.exitCode!==null)throw new Error(error||'ffmpeg exited before receiving all frames');
  const jpeg=await frame(FROM+i/FPS,locale);if(!ff.stdin.write(jpeg))await once(ff.stdin,'drain');
  if(i%Math.round(FPS*8)===0)console.log(`${locale}: ${Math.round(i/FPS)} / ${DURATION}s`);
 }
 ff.stdin.end();const [code]=await finished;if(code!==0)throw new Error(error||`ffmpeg failed: ${code}`);
 if(!ranged)await poster(locale);console.log(`${locale}: complete (${(await fs.stat(file)).size} bytes)`);
}
