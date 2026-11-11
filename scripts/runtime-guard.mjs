import http from 'node:http';
import {spawn} from 'node:child_process';
import {readdir,access} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createRuntimeGuard} from './runtime-guard-server.mjs';

async function freePort(){const server=http.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function staticPaths(directory){
 const paths=new Set();
 async function walk(root,prefix){let entries;try{entries=await readdir(root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries){if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;const file=join(root,entry.name);if(entry.isDirectory())await walk(file,`${prefix}${entry.name}/`);else if(entry.isFile()){const pathname=`${prefix}${entry.name}`,encoded=pathname.split('/').map(encodeURIComponent).join('/');for(const value of new Set([pathname,encoded])){if(paths.size>=20_000)throw new Error('Too many public assets.');paths.add(value);}}}
 }
 await walk(join(directory,'public'),'/');await walk(join(directory,'.next-coolify/static'),'/_next/static/');return paths;
}
function probe(port){return new Promise(resolve=>{const request=http.get({host:'127.0.0.1',port,path:'/api/health',agent:false,timeout:1000},response=>{response.resume();resolve(response.statusCode===200);});request.once('timeout',()=>{request.destroy();resolve(false);});request.once('error',()=>resolve(false));});}
export async function startGuardedRuntime({directory=dirname(fileURLToPath(import.meta.url)),port=Number(process.env.PORT??3000),hostname=process.env.HOSTNAME??'0.0.0.0',startupMs=30_000,shutdownMs=5000,env=process.env}={}){
 directory=resolve(directory);await access(join(directory,'server.js'));
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid public port.');
 const internalPort=await freePort(),assets=await staticPaths(directory);
 const child=spawn(process.execPath,[join(directory,'server.js')],{cwd:directory,env:{...env,PORT:String(internalPort),HOSTNAME:'127.0.0.1',NODE_ENV:'production'},stdio:['ignore','inherit','inherit']});
 let healthy=false,stopping=false,healthTimer,guard;
 const exited=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({code,signal}));child.once('error',()=>resolve({code:1,signal:null}));});
 let childEnded=false;exited.then(()=>{childEnded=true;healthy=false;if(!stopping)void close();});
 async function close(){if(stopping)return exited;stopping=true;healthy=false;clearTimeout(healthTimer);if(guard)await guard.close(shutdownMs);if(!childEnded)child.kill('SIGTERM');const force=setTimeout(()=>{if(!childEnded)child.kill('SIGKILL');},shutdownMs);force.unref();const status=await exited;clearTimeout(force);return status;}
 const sigterm=()=>void close(),sigint=()=>void close();process.on('SIGTERM',sigterm);process.on('SIGINT',sigint);
 try{
  const deadline=Date.now()+startupMs;
  while(!childEnded&&Date.now()<deadline){if(await probe(internalPort)){healthy=true;break;}await delay(100);}
  if(!healthy)throw new Error('Private Next server did not become healthy.');
  guard=createRuntimeGuard({upstreamPort:internalPort,staticPaths:assets,isHealthy:()=>healthy&&!stopping,publicUrl:env.SITE_URL??env.NEXT_PUBLIC_SITE_URL});
  await new Promise((resolve,reject)=>{guard.server.once('error',reject);guard.server.listen(port,hostname,resolve);});
  async function checkHealth(){if(stopping)return;healthy=await probe(internalPort);if(!stopping){healthTimer=setTimeout(checkHealth,2000);healthTimer.unref();}}
  healthTimer=setTimeout(checkHealth,2000);healthTimer.unref();
  const actualPort=guard.server.address().port;console.log(`Zapstick HTTP guard ready on port ${actualPort}.`);
  exited.finally(()=>{process.removeListener('SIGTERM',sigterm);process.removeListener('SIGINT',sigint);});
  return {port:actualPort,internalPort,child,guard,close,exited};
 }catch(error){await close();process.removeListener('SIGTERM',sigterm);process.removeListener('SIGINT',sigint);throw error;}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{const runtime=await startGuardedRuntime();const status=await runtime.exited;process.exitCode=status.code??0;}
 catch{console.error('Zapstick could not start its protected HTTP server.');process.exitCode=1;}
}
