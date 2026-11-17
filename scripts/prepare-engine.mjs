import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const revision = '48f8f9a6dce74255546045f98a30d86ff7202cc1';
const upstream = 'https://github.com/LuminaryLabs-Dev/NexusEngine.git';
const dir = fileURLToPath(new URL('../.build/NexusEngine', import.meta.url));
const git = (args, options = {}) => {
 const result = spawnSync('git', ['-C', dir, ...args], { encoding:'utf8', ...options });
 if (result.status !== 0) throw Error(result.error?.message ?? result.stderr ?? 'git '+args[0]+' failed');
 return result.stdout.trim();
};
if (!fs.existsSync(path.join(dir,'.git'))) {
 if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw Error('Refusing to overwrite existing Engine input.');
 fs.mkdirSync(dir, {recursive:true});
 git(['init','-q']);
 git(['fetch','--depth=1','--no-tags',upstream,revision]);
 git(['checkout','--detach','-q',revision]);
}
if (git(['rev-parse','HEAD']) !== revision) throw Error('Engine revision mismatch');
if (git(['status','--porcelain','--untracked-files=all'])) throw Error('Unexpected changes in pinned Engine input');
console.log('NexusEngine',revision);
