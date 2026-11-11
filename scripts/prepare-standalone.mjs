import {cp,access,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

// Next.js traces the server dependencies; public files and browser chunks are
// copied explicitly so both npm start and the Docker image serve a complete app.
const build=resolve('.next-coolify');
const standalone=resolve(build,'standalone');
await access(resolve(standalone,'server.js'));
await mkdir(resolve(standalone,'.next-coolify'),{recursive:true});
await cp(resolve('public'),resolve(standalone,'public'),{recursive:true,dereference:true});
await cp(resolve(build,'static'),resolve(standalone,'.next-coolify','static'),{recursive:true,dereference:true});
console.log('Standalone server and public assets prepared in .next-coolify/standalone.');
