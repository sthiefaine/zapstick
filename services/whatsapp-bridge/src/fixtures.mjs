import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateMedia} from './media.mjs';

// Synthetic calibration frames: solid pale green, once opaque and once translucent.
// Actual VP8/VP8L bitstreams, 512px, shared with the media decoder's test fixtures.
const TRANSLUCENT = 'UklGRi4AAABXRUJQVlA4TCIAAAAv/8F/EAdQ7pKVsWYBgUCyv/cMRfQ/4z//+c9//vOf//wf';
const OPAQUE = 'UklGRhoCAABXRUJQVlA4IA4CAACQOgCdASoAAgACPm02mUmkIyKhIAgAgA2JaW7hd2Ee3AAAE9gHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPWAAA/v+yiP/+IXextv//82B+3n289RAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
function chunk(name,data){const header=Buffer.alloc(8);header.write(name);header.writeUInt32LE(data.length,4);return Buffer.concat([header,data,...(data.length&1?[Buffer.alloc(1)]:[])]);}
function riff(type,entries){const payload=Buffer.concat([Buffer.from(type),...entries]),header=Buffer.alloc(8);header.write('RIFF');header.writeUInt32LE(payload.length,4);return Buffer.concat([header,payload]);}
function imageChunks(bytes){const entries=[];for(let at=12;at<bytes.length;){const size=bytes.readUInt32LE(at+4),end=at+8+size+(size&1);entries.push(bytes.subarray(at,end));at=end;}return Buffer.concat(entries);}

export function fixtureData(){
  const staticWebp=Buffer.from(TRANSLUCENT,'base64'),opaque=Buffer.from(OPAQUE,'base64');
  const extension=Buffer.alloc(10);extension[0]=0x12;extension.writeUIntLE(511,4,3);extension.writeUIntLE(511,7,3);
  const frames=[opaque,staticWebp,opaque,staticWebp].map(image=>{const header=Buffer.alloc(16);header.writeUIntLE(511,6,3);header.writeUIntLE(511,9,3);header.writeUIntLE(500,12,3);header[15]=2;return chunk('ANMF',Buffer.concat([header,imageChunks(image)]));});
  const animated=riff('WEBP',[chunk('VP8X',extension),chunk('ANIM',Buffer.alloc(6)),...frames]);
  const rate=48000,pcm=Buffer.alloc(rate*2*2),format=Buffer.alloc(16);
  format.writeUInt16LE(1);format.writeUInt16LE(1,2);format.writeUInt32LE(rate,4);format.writeUInt32LE(rate*2,8);format.writeUInt16LE(2,12);format.writeUInt16LE(16,14);
  for(let index=0;index<rate*2;index++){
    const time=index/rate,start=time<1?0:1,local=time-start;
    if(local>=.8)continue;
    const fade=Math.min(1,local/.003,(.8-local)/.003),frequency=time<1?440:880;
    pcm.writeInt16LE(Math.round(Math.sin(2*Math.PI*frequency*local)*.18*fade*32767),index*2);
  }
  const sound=riff('WAVE',[chunk('fmt ',format),chunk('data',pcm)]);
  validateMedia({visual:staticWebp});validateMedia({visual:animated,sound});
  return {'static.webp':staticWebp,'animated.webp':animated,'sound.wav':sound};
}

export async function writeFixtures(output){
  if(typeof output!=='string'||!path.isAbsolute(output))throw new Error('An absolute output directory is required.');
  await mkdir(output,{recursive:true,mode:0o700});
  for(const [name,data]of Object.entries(fixtureData())){
    const filename=path.join(output,name);
    try{await writeFile(filename,data,{flag:'wx',mode:0o600});}
    catch(error){if(error.code!=='EEXIST'||!data.equals(await readFile(filename)))throw error;}
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--output'){process.stderr.write('Usage: node src/fixtures.mjs --output /absolute/private/directory\n');process.exitCode=1;}
  else await writeFixtures(args[1]);
}
