#!/usr/bin/env node
/**
 * LNReader -> VeneraCat novel-js converter.
 *
 * Fetches pre-built LNReader plugins from LNReader/lnreader-plugins
 * (plugins/v3.0.0), wraps each unmodified CommonJS bundle in a NovelSource
 * class using LNReaderAdapter, writes catalog/packages/lnreader-<id>/<id>.js,
 * computes SHA-256, and upserts entries into catalog/source.json.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONVERTER_VERSION = 'lnreader/1.0.0';
const UPSTREAM_REPO = 'https://github.com/LNReader/lnreader-plugins';
const DEFAULT_INDEX_URL =
  'https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v3.0.0/.dist/plugins.min.json';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const catalogPath = join(root, 'catalog/source.json');

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sanitizeKey(id) {
  const cleaned = String(id)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return 'lnreader_' + (cleaned || 'source');
}

function sanitizeClassName(id) {
  const parts = String(id)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1));
  const base = parts.join('') || 'Source';
  return /^[A-Za-z_$]/.test(base) ? 'LN' + base : 'LNSource';
}

function sanitizeEntryId(id) {
  return 'lnreader.' + String(id).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export function wrapPlugin(meta, upstreamCode) {
  const className = sanitizeClassName(meta.id);
  const key = sanitizeKey(meta.id);
  const version = meta.version || '1.0.0';
  const name = meta.name || meta.id;
  const site = meta.site || '';

  return [
    '// @veneracat-converter: ' + CONVERTER_VERSION,
    '// @upstream-repo: ' + UPSTREAM_REPO,
    '// @upstream-plugin-id: ' + meta.id,
    '// @upstream-url: ' + meta.url,
    '// @license: MIT',
    '',
    'class ' + className + ' extends NovelSource {',
    '  name = ' + JSON.stringify(name),
    '  key = ' + JSON.stringify(key),
    '  version = ' + JSON.stringify(version),
    '  minAppVersion = "1.0.0"',
    '  url = ' + JSON.stringify(site),
    '  author = { name: "LNReader contributors", url: ' + JSON.stringify(UPSTREAM_REPO) + ' }',
    '  homepage = ' + JSON.stringify(UPSTREAM_REPO),
    '',
    '  constructor() {',
    '    super()',
    '    this._ln = LNReaderAdapter.attach(this, function(require, exports, module) {',
    upstreamCode.trim(),
    '    })',
    '  }',
    '',
    '  popular(page) { return this._ln.popular(page) }',
    '  search(keyword, page) { return this._ln.search(keyword, page) }',
    '  detail(id) { return this._ln.detail(id) }',
    '  chapter(novelId, chapId) { return this._ln.chapter(novelId, chapId) }',
    '}',
    '',
  ].join('\n');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + url);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + url);
  return res.text();
}

function parseArgs(argv) {
  const out = { ids: [], indexUrl: DEFAULT_INDEX_URL, writeCatalog: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ids' && argv[i + 1]) {
      out.ids.push(...argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--index' && argv[i + 1]) {
      out.indexUrl = argv[++i];
    } else if (a === '--no-catalog') {
      out.writeCatalog = false;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.ids.length === 0) {
    console.error('Usage: node tools/convert/lnreader/convert.mjs --ids id1,id2,... [--no-catalog]');
    process.exit(1);
  }

  const index = await fetchJson(args.indexUrl);
  const byId = new Map(index.map((p) => [p.id, p]));
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const entryMap = new Map(catalog.entries.map((e) => [e.id, e]));

  const results = [];
  for (const id of args.ids) {
    const meta = byId.get(id);
    if (!meta) {
      throw new Error('Plugin not found in LNReader index: ' + id);
    }
    const upstreamCode = await fetchText(meta.url);
    const wrapped = wrapPlugin(meta, upstreamCode);
    const digest = sha256(wrapped);
    const key = sanitizeKey(meta.id);
    const entryId = sanitizeEntryId(meta.id);
    const filename = key + '.js';
    const relFile = 'catalog/packages/' + entryId + '/' + filename;
    const absFile = join(root, relFile);

    await mkdir(dirname(absFile), { recursive: true });
    await writeFile(absFile, wrapped, 'utf8');

    const entry = {
      id: entryId,
      kind: 'novel-source',
      name: meta.name,
      key,
      version: meta.version || '1.0.0',
      filename,
      license: 'MIT',
      input: { file: relFile },
      upstream: {
        author: 'LNReader contributors',
        repo: UPSTREAM_REPO,
        url: meta.url,
        site: meta.site,
        pluginId: meta.id,
        lang: meta.lang,
        license: 'MIT',
        converter: CONVERTER_VERSION,
      },
      supports: {
        platforms: ['ios', 'macos', 'windows'],
        requiresCapabilities: ['novel-source.js'],
      },
      status: 'experimental',
      verification: {
        level: 'converted',
        scope: 'Converted from LNReader plugins/v3.0.0; see probe report for live verification',
      },
    };

    if (args.writeCatalog) {
      entryMap.set(entryId, entry);
    }
    results.push({ id: meta.id, entryId, key, relFile, sha256: digest, bytes: Buffer.byteLength(wrapped, 'utf8'), lang: meta.lang });
  }

  if (args.writeCatalog) {
    catalog.entries = [...entryMap.values()];
    await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  }

  console.log(JSON.stringify({ converter: CONVERTER_VERSION, count: results.length, results }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
