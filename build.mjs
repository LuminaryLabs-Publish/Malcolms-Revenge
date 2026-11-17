import fs from 'node:fs';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('./',import.meta.url));
const read=f=>fs.readFileSync(resolve(root,f),'utf8');
const scene=n=>JSON.parse(read('scenes/'+n+'.nexus'));
const sceneSet={root:scene('starline'),menu:scene('orbit-menu'),legs:['leg-aurora','leg-ember','leg-glass'].map(scene)};
const profile=JSON.parse(read('profiles/pass-20.json'));
const bundle=await build({absWorkingDir:root,entryPoints:['src/app.mjs'],bundle:true,platform:'browser',format:'iife',minify:true,legalComments:'inline',write:false,
 define:{SCENES:JSON.stringify(sceneSet),PASS_PROFILE:JSON.stringify(profile)}});
const esc=s=>s.replace(/<\/script/gi,'<\\/script');
const html=read('shell.html').replace('/*CSS*/',()=>read('style.css')).replace('/*GAME*/',()=>esc(bundle.outputFiles[0].text)).replace('/*LICENSES*/',()=>esc(read('vendor/NexusEngine-LICENSE.txt')+'\n'+read('vendor/THIRD-PARTY-LICENSES.txt')));
fs.mkdirSync(resolve(root,'dist'),{recursive:true});
fs.writeFileSync(resolve(root,'dist','index.html'),html);
console.log('Built offline Malcolm’s Revenge:',Buffer.byteLength(html),'bytes');
