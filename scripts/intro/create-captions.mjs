import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const storyboard=JSON.parse(await readFile(new URL('./storyboard.json',import.meta.url),'utf8'));
const output=new URL('../../public/videos/',import.meta.url);
await mkdir(output,{recursive:true});
const timestamp=seconds=>{
 const ms=Math.round(seconds*1000),hours=Math.floor(ms/3600000),minutes=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;
 return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
};
const music={fr:'[Musique rythmée et exemples sonores]',en:'[Upbeat music and audio demos]','pt-BR':'[Música animada e exemplos de áudio]',es:'[Música rítmica y ejemplos de audio]',de:'[Rhythmische Musik und Hörbeispiele]','zh-CN':'[动感音乐与音效示例]',ja:'[アップテンポな音楽と音声デモ]',ru:'[Ритмичная музыка и звуковые примеры]'};
for(const locale of storyboard.locales){
 const cues=storyboard.scenes.map(scene=>{
  const text=scene.text[locale];
  return `${scene.id}\n${timestamp(scene.start)} --> ${timestamp(scene.end)}\n${scene.start===0?`${music[locale]}\n`:''}${text.title}\n${text.body}`;
 });
 const target=new URL(`zapstick-intro-${locale.toLowerCase()}.vtt`,output);
 await writeFile(target,`WEBVTT\n\n${cues.join('\n\n')}\n`);
 process.stdout.write(`${fileURLToPath(target)}\n`);
}
