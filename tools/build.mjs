import {readFile, writeFile, mkdir, mkdtemp, rename, rm, copyFile, readdir, lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateRawSync} from 'node:zlib';
import {resolve, relative, dirname, join, isAbsolute, posix} from 'node:path';
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

const SERVICE_ID_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;
const SERVICE_ALLOWED_KEYS = new Set(['id', 'name', 'version', 'kind', 'entry', 'permissions']);
const SERVICE_KNOWN_PERMS = new Set(['network', 'storage', 'secrets']);

function validateServiceEntryPath(entry) {
  if (typeof entry !== 'string' || !entry) throw Error('service manifest has no entry');
  if (/[\\:]/.test(entry)) throw Error(`service entry "${entry}" uses disallowed separator`);
  if (entry.startsWith('/')) throw Error(`service entry "${entry}" must be relative`);
  const cleaned = posix.normalize(entry);
  if (cleaned !== entry || cleaned === '.' || cleaned.startsWith('../')) {
    throw Error(`service entry "${entry}" leaves package`);
  }
}

function validateServiceManifest(rawBytes, item, filesByName) {
  const manifest = JSON.parse(rawBytes.toString('utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw Error(`${item.id}: service.json must be a JSON object`);
  }
  for (const key of Object.keys(manifest)) {
    if (!SERVICE_ALLOWED_KEYS.has(key)) {
      throw Error(`${item.id}: service.json contains unknown field "${key}"`);
    }
  }
  if (typeof manifest.id !== 'string' || !SERVICE_ID_RE.test(manifest.id) || manifest.id !== item.id) {
    throw Error(`${item.id}: service.json id mismatch or invalid`);
  }
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw Error(`${item.id}: service.json missing name`);
  }
  if (typeof manifest.version !== 'string' || !manifest.version.trim() || manifest.version !== item.version) {
    throw Error(`${item.id}: service.json version mismatch or invalid`);
  }
  if (manifest.kind !== 'service.js') {
    throw Error(`${item.id}: service.json kind must be "service.js"`);
  }
  validateServiceEntryPath(manifest.entry);
  if (!filesByName.has(manifest.entry)) {
    throw Error(`${item.id}: service.json entry "${manifest.entry}" not found in package`);
  }
  if (!Array.isArray(manifest.permissions)) {
    throw Error(`${item.id}: service.json permissions must be an array`);
  }
  const seenPerms = new Set();
  for (const perm of manifest.permissions) {
    if (!SERVICE_KNOWN_PERMS.has(perm)) throw Error(`${item.id}: unknown service permission "${perm}"`);
    if (seenPerms.has(perm)) throw Error(`${item.id}: duplicate service permission "${perm}"`);
    seenPerms.add(perm);
  }
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC32_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function createDeterministicZip(entries) {
  // Deterministic PKZIP (fixed DOS timestamp 1980-01-01 00:00:00, UTF-8 names, sorted paths).
  const dosTime = 0x0000;
  const dosDate = 0x0021;
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const {name, bytes} of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(bytes);
    const deflated = deflateRawSync(bytes, {level: 9});
    const useDeflate = deflated.length < bytes.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? deflated : bytes;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(bytes.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(bytes.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

async function collectPackageFiles(dirPath, prefix = '') {
  const names = (await readdir(dirPath)).sort();
  const collected = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(dirPath, name);
    const stat = await lstat(full);
    if (stat.isSymbolicLink()) throw Error(`package may not contain symlinks: ${full}`);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (stat.isDirectory()) {
      collected.push(...await collectPackageFiles(full, rel));
    } else if (stat.isFile()) {
      validateServiceEntryPath(rel);
      collected.push({name: rel, bytes: await readFile(full)});
    }
  }
  return collected;
}

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
    if (typeof item.filename !== 'string' || !item.filename || item.filename === '.' || item.filename === '..' || /[/\\]/.test(item.filename)) throw Error('artifact filename must be a basename');
    let bytes;
    if (typeof item.input.file === 'string' && item.input.file) {
      bytes = await readFile(localPath(item.input.file));
    } else if (typeof item.input.dir === 'string' && item.input.dir) {
      if (!item.filename.endsWith('.zip')) throw Error(`${item.id}: directory input requires a .zip filename`);
      const pkgDir = localPath(item.input.dir);
      const pkgFiles = await collectPackageFiles(pkgDir);
      if (pkgFiles.length === 0) throw Error(`${item.id}: package directory is empty`);
      const filesByName = new Map(pkgFiles.map(f => [f.name, f.bytes]));
      if (item.kind === 'service') {
        const manifestBytes = filesByName.get('service.json');
        if (!manifestBytes) throw Error(`${item.id}: service package missing service.json`);
        validateServiceManifest(manifestBytes, item, filesByName);
      }
      bytes = createDeterministicZip(pkgFiles);
    } else {
      throw Error('entry input must specify a local file or directory');
    }
    const url = `packages/${item.id}/${item.filename}`;
    stagedFiles.push({url, bytes});
    record.artifact = {url, sha256: sha256(bytes), bytes: bytes.length};
    if (item.key) record.key = item.key;
  } else if (item.design) {
    const bytes = await readFile(localPath(item.design)), url = `designs/${item.id}.json`;
    stagedFiles.push({url, bytes});
    record.design = {url, sha256: sha256(bytes)};
  } else if (item.status !== 'broken') {
    throw Error('entry must specify input, design, or broken status');
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
    const ref = entry.artifact ?? entry.design;
    if (!ref) continue;
    const bytes = await readFile(join(stage, ref.url));
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
