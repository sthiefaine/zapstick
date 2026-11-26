#!/usr/bin/env node
/** Zapstick V5: 35 seconds, 26 fast shots, eight languages, shaped local type. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Isolate font discovery from machine-specific defaults. The bundled subsets
// must be used, rather than silently falling back to a system sans face.
const FONT_CONFIG=path.join(ROOT,'outputs/intro-v5/fonts.conf');
await fs.mkdir(path.dirname(FONT_CONFIG),{recursive:true});
await fs.writeFile(FONT_CONFIG,`<?xml version="1.0"?><fontconfig><dir>${path.join(ROOT,'scripts/intro/fonts')}</dir><cachedir>${path.join(ROOT,'outputs/intro-v5/font-cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE=FONT_CONFIG;
const {default:sharp}=await import('sharp');
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const story=JSON.parse(await fs.readFile(new URL('./storyboard.json',import.meta.url),'utf8'));
const copy=JSON.parse(await fs.readFile(new URL('./copy.json',import.meta.url),'utf8'));
if(story.duration!==35||story.shots[0].start!==0||story.shots.at(-1).end!==story.duration||story.shots.some((s,i)=>s.end<=s.start||(i&&s.start!==story.shots[i-1].end)))throw new Error('The shot list must cover exactly 35 seconds.');
const requested=option('--locale','all'),locales=requested==='all'?story.locales:[requested];
if(locales.some(locale=>!story.locales.includes(locale)))throw new Error('Unknown locale.');
const FPS=Number(option('--fps','30')),FROM=Number(option('--from','0')),DURATION=Number(option('--duration',args.includes('--preview')?'11.2':String(story.duration-FROM)));
if(!Number.isInteger(FPS)||FPS<12||FPS>60||!Number.isFinite(FROM)||!Number.isFinite(DURATION)||FROM<0||DURATION<=0||FROM+DURATION>story.duration)throw new Error('Invalid render interval.');
const OUT=path.join(ROOT,'public/videos'),QA=path.join(ROOT,'outputs/intro-v5'),AUDIO=option('--audio','/tmp/zapstick-intro-v5-music.wav');
await fs.mkdir(OUT,{recursive:true});await fs.mkdir(QA,{recursive:true});
const C={ink:'#181818',white:'#FAFAFA',green:'#BFE8B0',blue:'#B8DBFF',coral:'#FFB59D',yellow:'#FFE58F',gold:'#F5C74E',whatsapp:'#25D366'};
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),ease=n=>1-(1-clamp(n))**3,mix=(a,b,u)=>a+(b-a)*u;
const xml=t=>String(t).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[s]));
const rr=(x,y,w,h,r=28,fill=C.white,stroke=C.ink,sw=5)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const line=(x1,y1,x2,y2,color=C.ink,w=6)=>`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
const circle=(x,y,r,fill=C.green,stroke=C.ink,sw=5)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const check=(x,y,color=C.ink)=>`<path d="M${x-24} ${y}l17 18 34-40" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
const speaker=(x,y,size=1,color=C.ink)=>`<g transform="translate(${x} ${y}) scale(${size})"><path d="M-25-14h14L10-32v64L-11 14h-14Z M25-18q18 18 0 36M38-30q28 30 0 60" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const pointer=(x,y,click=0)=>`<g transform="translate(${x} ${y})">${click>0?`<circle r="${24+click*35}" fill="none" stroke="${C.coral}" stroke-width="${8*(1-click)}" opacity="${1-click}"/>`:''}<path d="M0 0L9 47l11-14 17 24 12-9-18-24 21-3Z" fill="${C.white}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/></g>`;
const loop=(x,y,r=65,angle=0,color=C.ink)=>`<g transform="translate(${x} ${y}) rotate(${angle})"><path d="M${-r*.7} ${-r*.7}a${r} ${r} 0 0 1 ${r*1.5} ${r*.2}m0 ${-r*.55}v${r*.6}h${-r*.6}M${r*.7} ${r*.7}a${r} ${r} 0 0 1 ${-r*1.5} ${-r*.2}m0 ${r*.55}v${-r*.6}h${r*.6}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const media=new Map(),sound=new Map();let currentLocale='fr',serial=0;
const shaped=JSON.parse(await fs.readFile(new URL('./typography.json',import.meta.url),'utf8'));
for(const font of Object.values(shaped))for(const a of Object.values(font.layouts))a.svg=a.paths.map(([name,x,y])=>`<path d="${font.glyphs[name]}" transform="translate(${x} ${y}) scale(1 -1)"/>`).join('');
function text(value,{x=640,y=110,w=1110,h=145,color=C.ink,rotate=0,scale=1,locale=currentLocale}={}){
 const font=Object.values(shaped).find(f=>f.locales.includes(locale)),a=font.layouts[value];if(!a)throw new Error(`Unprepared text: ${locale}: ${value}`);
 const k=Math.min(w/a.w,h/a.h)*scale;
 return `<g fill="${color}" transform="translate(${x} ${y}) rotate(${rotate}) scale(${k}) translate(${-a.x-a.w/2} ${-a.y-a.h/2})">${a.svg}</g>`;
}
function title(value,q,options={}){return text(value,{scale:1+.045*Math.exp(-q*12)*Math.sin(q*38),rotate:Math.sin(q*12)*Math.exp(-q*9)*1.8,...options});}
async function loadGif(name){
 const input=path.join(ROOT,`public/memes/${name}.gif`),meta=await sharp(input,{animated:true}).metadata();
 const image=await sharp(input,{animated:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const h=meta.pageHeight??meta.height,stride=image.info.width*h*4,count=Math.min(meta.pages??1,80),frames=[];
 for(let i=0;i<count;i++)frames.push(`data:image/jpeg;base64,${(await sharp(image.data.subarray(i*stride,(i+1)*stride),{raw:{width:image.info.width,height:h,channels:4}}).flatten({background:C.ink}).resize(420,315,{fit:'contain',background:C.ink}).jpeg({quality:92}).toBuffer()).toString('base64')}`);
 const timing=Array.from({length:count},(_,i)=>Math.max(.04,(meta.delay?.[i]??100)/1000));media.set(name,{frames,timing,duration:timing.reduce((a,b)=>a+b,0)});
}
function source(name,t){const a=media.get(name);let pos=((t%a.duration)+a.duration)%a.duration;for(let i=0;i<a.frames.length;i++){if(pos<a.timing[i])return a.frames[i];pos-=a.timing[i];}return a.frames[0];}
function card(name,t,{x=640,y=390,w=570,angle=0,scale=1}={}){
 const h=w*.75,id=`c${serial++}`;return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">${rr(-w/2+9,-h/2+12,w,h,34,C.ink,'none',0)}${rr(-w/2-5,-h/2-5,w+10,h+10,35,C.white)}<defs><clipPath id="${id}"><rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="29"/></clipPath></defs><image href="${source(name,t)}" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" clip-path="url(#${id})"/></g>`;
}
async function loadSound(name){
 const child=spawn('ffmpeg',['-v','error','-i',path.join(ROOT,`public/memes/sound/${name}.mp4`),'-vn','-ar','8000','-ac','1','-f','f32le','pipe:1'],{stdio:['ignore','pipe','pipe']}),chunks=[];let error='';
 child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>error+=c);const[status]=await once(child,'close');if(status)throw new Error(error);
 const bytes=Buffer.concat(chunks),samples=Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4)),peak=Math.max(.01,...samples.map(Math.abs)),peaks=Array.from({length:96},(_,i)=>{
  const a=Math.floor(i*samples.length/96),b=Math.floor((i+1)*samples.length/96);let value=0;for(let j=a;j<b;j++)value=Math.max(value,Math.abs(samples[j]));return value/peak;
 });sound.set(name,{samples,peak,peaks,duration:samples.length/8000});
}
function level(name,at){const a=sound.get(name),start=Math.max(0,Math.floor(at*8000));let peak=0;for(let i=start;i<Math.min(a.samples.length,start+320);i++)peak=Math.max(peak,Math.abs(a.samples[i]));return peak/a.peak;}
function wave(name,x,y,w,h,{color=C.ink,from=0,to=1}={}){
 const a=sound.get(name),slice=a.peaks.slice(Math.floor(from*96),Math.max(Math.floor(from*96)+1,Math.ceil(to*96)));let out='';
 slice.forEach((v,i)=>{const height=Math.max(6,h*v);out+=rr(x+i*w/slice.length,y-height/2,Math.max(2,w/slice.length-3),height,3,color,'none',0);});return out;
}
const BRAND=`data:image/png;base64,${(await sharp(path.join(ROOT,'public/brand/zapstick-mark.svg')).resize(320,320).png().toBuffer()).toString('base64')}`;
function mark(x,y,size=160,angle=0){return `<image href="${BRAND}" x="${-size/2}" y="${-size/2}" width="${size}" height="${size}" transform="translate(${x} ${y}) rotate(${angle})"/>`;}
function chip(label,x,y,w=300,color=C.white){return rr(x-w/2,y-45,w,90,22,color)+text(label,{x,y,w:w-36,h:50});}
function filmRail(y,play=0,{animated=true,shift=0,tall=false}={}){
 const left=115,w=1050,first=w*1.2/4.4,h=tall?174:96,r=tall?42:27;
 return rr(left-5,y-h/2-5,w+10,h+10,24,C.white)+rr(left,y-h/2,first,h,17,C.blue)+wave('working-cat',left+10,y,first-20,tall?112:52,{from:0,to:1.2/2.85})+rr(left+first,y-h/2+shift,w-first,h,17,C.coral)+wave('side-eye-dog',left+first+10,y+shift,w-first-20,tall?112:52,{from:.7/4.4,to:3.9/4.4})+circle(left+first/2,y,r,C.white)+text('1',{x:left+first/2,y,w:r,h:r*1.3})+circle(left+first+(w-first)/2,y+shift,r,C.white)+text('2',{x:left+first+(w-first)/2,y:y+shift,w:r,h:r*1.3})+(animated?line(left+w*clamp(play/4.4),y-h/2-18,left+w*clamp(play/4.4),y+h/2+18,C.ink,6)+circle(left+w*clamp(play/4.4),y-h/2-24,8,C.ink):'');
}
function clock(value){return new Intl.NumberFormat(currentLocale,{maximumFractionDigits:1}).format(value)+' s';}
function listen(t,q,punch=false){
 const elapsed=clamp(t-16.4,0,4.4),second=elapsed>=1.2,colour=second?C.coral:C.blue;
 const energy=second?level('side-eye-dog',.7+elapsed-1.2):level('working-cat',elapsed);
 return (punch?'':title(copy[currentLocale].listen,q,{y:78,h:115}))+card('working-cat',t,{y:350,w:punch?650:530,scale:1+energy*.045,angle:second?Math.sin(q*8)*1.2:-1})+circle(1070,330,76,colour)+text(second?'2':'1',{x:1070,y:330,w:65,h:88})+speaker(1070,470,1.1+energy*.12)+filmRail(635,elapsed);
}
function draw(t,locale){
 currentLocale=locale;serial=0;const shot=story.shots.find(s=>t<s.end)??story.shots.at(-1),q=t-shot.start,u=clamp(q/(shot.end-shot.start)),d=copy[locale];
 const backgrounds={hook:C.green,paste:C.yellow,fetch:C.white,result:C.green,animated:C.ink,trim:C.green,loop:C.blue,'animated-result':C.coral,original:C.white,sources:C.green,'audio-import':C.white,excerpt:C.coral,sequence:C.white,'listen-first':C.blue,'listen-second':C.coral,'listen-punch':C.coral,done:C.green,download:C.yellow,saved:C.white,'memes-a':C.coral,'memes-b':C.blue,'whatsapp-cta':C.white,'whatsapp-send':C.blue,'whatsapp-received':C.green,create:C.green,signature:C.ink};
 const bg=backgrounds[shot.id],ink=bg===C.ink?C.white:C.ink;let out='';
 if(shot.id==='hook')out+=title(d.hook,q,{y:156,h:235})+rr(150,367,205,205,45,C.ink)+text('X',{x:252,y:469,w:120,h:145,color:C.white})+line(414,468,590,468,C.ink,15)+`<path d="M550 426l44 42-44 42" fill="none" stroke="${C.ink}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`+card('working-cat',t,{x:890,y:475,w:435,angle:-4+u*9});
 if(shot.id==='paste')out+=title(d.paste,q,{h:180})+rr(120,280,1040,180,40)+text('x.com/…',{y:369,w:865,h:112})+pointer(mix(1140,990,ease(u*2)),mix(560,410,ease(u*2)),clamp((q-.4)/.4));
 if(shot.id==='fetch')out+=title(d.fetch,q,{y:104,h:155})+card('working-cat',t,{y:430,w:610,angle:mix(-16,2,ease(q*5)),scale:.88+.12*ease(q*7)})+circle(990,568,58,C.green)+check(990,568);
 if(shot.id==='result')out+=card('working-cat',t,{w:u<.5?780:880,y:365,angle:u<.5?-4+u*10:2-u*3,scale:1+.035*Math.sin(q*13)})+mark(1080,560,130,-6)+loop(210,160,60,u*160);
 if(shot.id==='animated')out+=title(d.animate,q,{color:ink,y:95,h:150})+card('working-cat',t,{y:386,w:520,angle:Math.sin(q*10)*2})+loop(1050,370,72,u*290,C.green)+chip(d.gif,640,650,470,C.green);
 if(shot.id==='trim'){
  out+=title(d.trim,q,{y:100,h:140});const left=85,w=1110;
  for(let i=0;i<6;i++)out+=card('working-cat',i*.21,{x:left+(i+.5)*w/6,y:362,w:172,angle:0});
  const p=ease(u*1.5),a=left+w*mix(.03,.15,p),b=left+w*mix(.95,.7,p);
  out+=rr(a,277,b-a,171,8,'#BFE8B033',C.ink,5)+rr(a-14,268,28,190,11,C.green)+rr(b-14,268,28,190,11,C.green)+pointer(b+6,412,clamp((q-.45)/.4));
 }
 if(shot.id==='loop')out+=title(d.loop,q,{y:92,h:148})+card('working-cat',t,{w:600,y:412,angle:-2+Math.sin(q*9)*2})+loop(1080,410,70,u*350);
 if(shot.id==='animated-result')out+=card('working-cat',t,{w:780,angle:mix(-6,5,u)})+loop(1070,145,70,q*320)+mark(183,575,130,9);
 if(shot.id==='original')out+=title(d.original,q,{y:95,h:145})+card('working-cat',t,{w:540,y:398,scale:1+level('working-cat',q)*.04})+speaker(1060,360,1.5+level('working-cat',q)*.4)+wave('working-cat',160,643,960,68,{color:C.ink})+line(160+960*clamp(q/2.85),597,160+960*clamp(q/2.85),688,C.blue,9);
 if(shot.id==='sources'){
  out+=title(d.add,q,{y:100,h:150});const choices=[[d.originalShort,370,310,C.white],[d.file,910,310,C.blue],[d.link,370,535,C.coral],[d.mic,910,535,C.yellow]];
  choices.forEach(([label,x,y,color],i)=>{out+=rr(x-220,y-85,440,170,35,color)+text(label,{x,y,w:390,h:75});});out+=pointer(mix(1120,510,ease(u*2)),mix(640,580,ease(u*2)),clamp((q-.6)/.3));
 }
 if(shot.id==='audio-import')out+=rr(170,160,940,155,32)+text('audio.mp3',{y:237,w:750,h:102})+rr(170,395,940,155,32,C.coral)+wave('side-eye-dog',210,472,860,88)+line(640,330,640,376,C.ink,9)+pointer(1035,280,clamp((q-.2)/.35));
 if(shot.id==='excerpt'){
  out+=title(d.excerpt,q,{y:100,h:145});const left=95,w=1090,p=ease(u*1.7),a=left+w*mix(0,.7/4.4,p),b=a+w*3.2/4.4;
  out+=rr(left,292,w,180,25,C.white)+wave('side-eye-dog',left+15,382,w-30,123)+rr(left,293,Math.max(1,a-left),178,0,'#FAFAFACC','none',0)+rr(b,293,Math.max(1,left+w-b),178,0,'#FAFAFACC','none',0)+rr(a,282,b-a,200,18,'#FFB59D66',C.ink,5)+rr(a-12,275,24,214,8,C.coral)+rr(b-12,275,24,214,8,C.coral)+pointer(a+75,446,clamp((q-.8)/.3))+text('0 s',{x:left+40,y:540,w:85,h:45})+text(clock(4.4),{x:left+w-65,y:540,w:130,h:45});
 }
 if(shot.id==='sequence')out+=title(d.sequence,q,{y:100,h:145})+filmRail(365,0,{animated:false,tall:true,shift:180*(1-ease(u*1.7))})+pointer(mix(840,980,ease(u*1.7)),mix(570,407,ease(u*1.7)),clamp((q-.7)/.3));
 if(shot.id==='listen-first'||shot.id==='listen-second'||shot.id==='listen-punch')out+=listen(t,q,shot.id==='listen-punch');
 if(shot.id==='done')out+=title(d.done,q,{y:165,h:240})+card('working-cat',t,{y:490,w:455,angle:Math.sin(q*8)*2})+speaker(1010,490,2)+circle(300,470,64,C.white)+check(300,470);
 if(shot.id==='download')out+=title(d.download,q,{y:100,h:160})+card('working-cat',t,{x:355,y:395,w:415,angle:-5})+rr(640,330,520,155,35,C.white)+text(d.download,{x:900,y:404,w:460,h:75})+pointer(mix(1160,1030,ease(u*2)),mix(570,451,ease(u*2)),clamp((q-.4)/.4));
 if(shot.id==='saved')out+=card('working-cat',t,{x:640,y:345,w:625,angle:-2+u*3})+chip(d.sound,640,642,500,C.white)+circle(1060,345,67,C.green)+check(1060,345);
 if(shot.id==='memes-a'||shot.id==='memes-b'){
  const names=shot.id==='memes-a'?['dancing-cat','working-cat','happy-dog']:['jumping-cat','cooking-monkey','side-eye-dog'];
  names.forEach((name,i)=>{out+=card(name,t,{x:230+i*410,y:360+Math.sin(q*9+i)*70,w:i===1?455:360,angle:(i-1)*10+Math.sin(q*8+i)*3,scale:1+.05*Math.sin(q*7+i)});});
 }
 if(shot.id==='whatsapp-cta'){
  out+=title(d.direct,q,{y:125,h:192})+card('working-cat',t,{x:345,y:455,w:420,angle:-3+Math.sin(q*9)})+rr(630,352,540,155,32,C.gold)+text(d.whatsapp,{x:900,y:430,w:470,h:95})+pointer(mix(1180,1070,ease(u*2)),mix(640,472,ease(u*2)),clamp((q-.65)/.45));
 }
 if(shot.id==='whatsapp-send'){
  out+=title(d.send,q,{y:100,h:150})+rr(125,220,1030,410,34,C.white)+rr(125,220,1030,95,30,C.ink)+text(d.chat,{x:380,y:267,w:360,h:52,color:C.white})+rr(205,373,745,146,30,C.green)+text(d.message,{x:577,y:445,w:640,h:77})+circle(1050,445,63,C.whatsapp)+`<path d="M1023 414l64 31-64 31 12-31Z" fill="${C.ink}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`+pointer(mix(1180,1080,ease(u*1.8)),mix(650,473,ease(u*1.8)),clamp((q-.5)/.4));
 }
 if(shot.id==='whatsapp-received'){
  const elapsed=q,second=elapsed>=.6,energy=second?level('side-eye-dog',.7+elapsed-.6):level('working-cat',elapsed);
  out+=title(d.received,q,{y:90,h:145})+rr(170,192,940,485,32,C.white)+rr(170,192,940,79,28,C.ink)+text(d.chat,{x:395,y:230,w:350,h:45,color:C.white})+card('working-cat',q,{x:587,y:465,w:440,angle:0,scale:1+energy*.02})+circle(965,460,69,C.gold)+speaker(965,460,1+energy*.3)+check(1048,620,C.whatsapp);
 }
 if(shot.id==='create')out+=title(d.create,q,{y:210,h:225})+mark(640,500,260,Math.sin(q*9)*3)+loop(1000,525,58,q*180)+speaker(280,525,1.45);
 if(shot.id==='signature')out+=mark(220,360,205,-5+Math.sin(q*8)*2)+text('zapstick',{x:790,y:360,w:790,h:208,color:C.green,locale:'fr',scale:1+.025*Math.sin(q*12)*Math.exp(-q*2)})+loop(530,565,50,q*75,C.green)+speaker(780,565,1.25,C.green);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${bg}"/>${out}</svg>`;
}
await Promise.all(['working-cat','dancing-cat','side-eye-dog','happy-dog','cooking-monkey','jumping-cat'].map(loadGif));
await Promise.all([loadSound('working-cat'),loadSound('side-eye-dog')]);
const frame=(t,locale)=>sharp(Buffer.from(draw(t,locale))).jpeg({quality:94,chromaSubsampling:'4:4:4'}).toBuffer();
async function poster(locale){await sharp(Buffer.from(draw(26.95,locale))).jpeg({quality:92}).toFile(path.join(OUT,`zapstick-intro-${locale.toLowerCase()}.jpg`));}
if(args.includes('--stills')){
 for(const locale of locales){for(const shot of story.shots.filter(s=>s.start>=FROM&&s.start<FROM+DURATION))await sharp(Buffer.from(draw(Math.min(shot.end-.05,shot.start+.55),locale))).png().toFile(path.join(QA,`${locale.toLowerCase()}-${String(shot.start).padStart(4,'0')}.png`));if(!args.includes('--preview'))await poster(locale);}
 console.log(`V5 stills ready: ${QA}`);process.exit(0);
}
await fs.access(AUDIO);
for(const locale of locales){
 const ranged=args.includes('--preview')||FROM!==0||DURATION!==story.duration,file=path.join(ranged?QA:OUT,ranged?`preview-${locale.toLowerCase()}.mp4`:`zapstick-intro-${locale.toLowerCase()}.mp4`),total=Math.round(DURATION*FPS);
 console.log(`${locale}: rendering ${total} frames, ${DURATION}s`);
 const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS),'-vcodec','mjpeg','-i','pipe:0','-ss',String(FROM),'-i',AUDIO,'-map','0:v:0','-map','1:a:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-t',String(DURATION),'-frames:v',String(total),'-c:v','libx264','-threads','2','-preset','medium','-b:v','800k','-maxrate','1100k','-bufsize','2200k','-c:a','aac','-b:a','96k','-ar','44100','-movflags','+faststart',file],{stdio:['pipe','ignore','pipe']});
 let error='';ff.stderr.on('data',d=>error+=d);ff.stdin.on('error',()=>{});const completed=once(ff,'close');
 for(let i=0;i<total;i++){if(ff.exitCode!==null)throw new Error(error);const jpeg=await frame(FROM+i/FPS,locale);if(!ff.stdin.write(jpeg))await once(ff.stdin,'drain');if(i%(FPS*6)===0)console.log(`${locale}: ${i/FPS}s`);}
 ff.stdin.end();const [code]=await completed;if(code)throw new Error(error);if(!ranged)await poster(locale);console.log(`${locale}: done, ${(await fs.stat(file)).size} bytes`);
}
