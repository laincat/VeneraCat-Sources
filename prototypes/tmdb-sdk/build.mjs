import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
await build({entryPoints:['entry.js'],outfile:'build/index.mjs',bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,legalComments:'eof'});
await mkdir('build/licenses',{recursive:true});
await copyFile('node_modules/tmdb-ts/LICENSE.md','build/licenses/tmdb-ts.txt');
await copyFile('node_modules/core-js-pure/LICENSE','build/licenses/core-js-pure.txt');
