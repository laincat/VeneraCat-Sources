import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const path=u=>fileURLToPath(new URL(u,import.meta.url));
execFileSync('go',['run',path('./contract.go'),path('./build/index.mjs')],{cwd:path('../../../VeneraCat Core/'),stdio:'inherit'});
