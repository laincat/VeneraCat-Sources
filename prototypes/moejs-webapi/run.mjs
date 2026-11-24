import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const path=u=>fileURLToPath(new URL(u,import.meta.url));
execFileSync('go',['run',path('./main.go')],{cwd:path('../../../VeneraCat Core/'),stdio:'inherit'});
