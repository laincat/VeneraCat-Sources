import {readFile, writeFile, mkdir, mkdtemp, rename, rm, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, relative, dirname, join, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'build');
const input = JSON.parse(await readFile(join(root, 'catalog/source.json'), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJson = async (filePath, value) => { await mkdir(dirname(filePath), {recursive: true}); await writeFile(filePath, JSON.stringify(value, null, 2) + '\n'); };
const localPath = relPath => {
  if (typeof relPath !== 'string' || !relPath) throw Error('missing local file path');
  const full = resolve(root, relPath), rel = relative(root, full);
  if (isAbsolute(rel) || rel.startsWith('..')) throw Error('source escapes repository');
  return full;
};

// A source is one collection for every client. Compatibility does not fork it.
// The build does not execute packages, access accounts or use the network.
if (!input || !Array.isArray(input.entries)) throw Error('missing entries array');
const entries = [], stagedFiles = [], seenIds = new Set();
const byId = (first, second) => { const left = String(first?.id ?? ''), right = String(second?.id ?? ''); return left < right ? -1 : left > right ? 1 : 0; };
for (const item of [...input.entries].sort(byId)) {
  if (typeof item?.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.id) || seenIds.has(item.id)) throw Error('invalid or duplicate entry id');
  seenIds.add(item.id);
  if (!item.supports?.platforms?.length || !item.supports?.requiresCapabilities?.length) throw Error('missing compatibility declaration');
  const record = {id: item.id, kind: item.kind, name: item.name, version: item.version, status: item.status, license: item.license, supports: item.supports, verification: item.verification};
  if (item.upstream) record.upstream = item.upstream;
  if (item.input) {
    if (typeof item.input.file !== 'string' || !item.input.file) throw Error('entry input must specify a local file');
    if (typeof item.filename !== 'string' || !item.filename || item.filename === '.' || item.filename === '..' || /[/\\]/.test(item.filename)) throw Error('artifact filename must be a basename');
    const bytes = await readFile(localPath(item.input.file)), url = `packages/${item.id}/${item.filename}`;
    stagedFiles.push({url, bytes});
    record.artifact = {url, sha256: sha256(bytes), bytes: bytes.length};
    if (item.key) record.key = item.key;
  } else {
    const bytes = await readFile(localPath(item.design)), url = `designs/${item.id}.json`;
    stagedFiles.push({url, bytes});
    record.design = {url, sha256: sha256(bytes)};
  }
  entries.push(record);
}

const {entries: ignoredEntries, ...source} = input;
const legacyVideo = {
  $schema: 'vcvideo/1', name: input.name + ' — legacy video adapter',
  description: 'Generated from the shared source collection; no per-client content ownership.',
  plugins: entries.filter(entry => entry.kind === 'video-source' && entry.artifact && entry.status === 'experimental')
    .map(entry => ({type: 'js', key: entry.key, name: entry.name, version: entry.version, url: `../${entry.artifact.url}`, sha256: entry.artifact.sha256, tags: ['experimental', 'first-party']}))
};

const stage = await mkdtemp(join(dirname(out), '.build-stage-')), backup = `${stage}-prev`;
let movedPrevious = false;
try {
  for (const file of stagedFiles) { await mkdir(dirname(join(stage, file.url)), {recursive: true}); await writeFile(join(stage, file.url), file.bytes); }
  await writeJson(join(stage, 'source.json'), {...source, entries});
  await writeJson(join(stage, 'compat/vcvideo.json'), legacyVideo);
  await copyFile(join(root, 'LICENSE'), join(stage, 'LICENSE'));
  const staged = JSON.parse(await readFile(join(stage, 'source.json'), 'utf8'));
  if (!Array.isArray(staged.entries) || staged.entries.length !== entries.length) throw Error('staged manifest entry count mismatch');
  for (const entry of staged.entries) {
    const ref = entry.artifact ?? entry.design, bytes = await readFile(join(stage, ref.url));
    if (sha256(bytes) !== ref.sha256 || (entry.artifact && bytes.length !== entry.artifact.bytes)) throw Error(`staged integrity mismatch: ${entry.id}`);
  }
  JSON.parse(await readFile(join(stage, 'compat/vcvideo.json'), 'utf8'));
  try { await rename(out, backup); movedPrevious = true; } catch (err) { if (err.code !== 'ENOENT') throw err; }
  await rename(stage, out);
} catch (err) {
  if (movedPrevious) { try { await rename(backup, out); } catch {} }
  await rm(stage, {recursive: true, force: true});
  throw err;
}
if (movedPrevious) await rm(backup, {recursive: true, force: true});
console.log(`Built one shared source with ${entries.length} entries and ${entries.filter(entry => entry.artifact).length} artifacts in ${out}`);
