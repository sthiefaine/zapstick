import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixtureData,writeFixtures} from '../src/fixtures.mjs';
import {validateMedia} from '../src/media.mjs';

test('private proof fixtures validate, decode and contain two timed audio excerpts',async t=>{
 const files=fixtureData();
 assert.equal(validateMedia({visual:files['static.webp']}).kind,'static');
 assert.equal(validateMedia({visual:files['animated.webp'],sound:files['sound.wav']}).duration,2);
 const dir=await mkdtemp(path.join(tmpdir(),'zapstick-proof-fixtures-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFixtures(dir);await writeFixtures(dir);
 assert.deepEqual(await readFile(path.join(dir,'animated.webp')),files['animated.webp']);
 const pcm=files['sound.wav'].subarray(44),sample=time=>pcm.readInt16LE(Math.round(time*48000)*2);
 assert.equal(sample(.9),0);assert.equal(sample(1.9),0);assert.notEqual(sample(.1001),sample(1.1001));
 if(spawnSync('ffmpeg',['-hide_banner','-version'],{stdio:'ignore'}).status===0){
  // The local decoder cannot always demux animated WebP; decode both genuine still bitstreams.
  for(const file of ['static.webp']){
   const decoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:files[file],maxBuffer:2*1024*1024});
   assert.equal(decoded.status,0);assert.equal(decoded.stdout.length,512*512*4);
  }
 }
});
