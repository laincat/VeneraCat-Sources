#!/usr/bin/env node
/**
 * Legado pure-CSS subset -> VeneraCat novel-js converter.
 *
 * Directly emits standalone NovelSource scripts from supported Legado rules
 * without shipping a runtime rule engine. Unsupported syntax is rejected with
 * explicit machine-readable reason codes.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONVERTER_VERSION = 'legado-css/1.0.0';

export const REJECT = Object.freeze({
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  UNSUPPORTED_JS_RULE: 'UNSUPPORTED_JS_RULE',
  UNSUPPORTED_POST_OR_DYNAMIC_HEADER: 'UNSUPPORTED_POST_OR_DYNAMIC_HEADER',
  UNSUPPORTED_XPATH_RULE: 'UNSUPPORTED_XPATH_RULE',
  UNSUPPORTED_JSON_RULE: 'UNSUPPORTED_JSON_RULE',
  UNSUPPORTED_PAGINATION: 'UNSUPPORTED_PAGINATION',
  UNSUPPORTED_SELECTOR_SYNTAX: 'UNSUPPORTED_SELECTOR_SYNTAX',
  LIVE_PROBE_FAILED: 'LIVE_PROBE_FAILED',
});

const root = fileURLToPath(new URL('../../../', import.meta.url));
const catalogPath = join(root, 'catalog/source.json');

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sanitizeKey(name, url) {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    host = String(name || 'source');
  }
  const cleaned = host.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return 'legado_' + (cleaned || 'source');
}

function sanitizeClassName(key) {
  return (
    'Legado' +
    key
      .replace(/^legado_/, '')
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join('')
  );
}

function sanitizeEntryId(key) {
  return 'legado.' + key.replace(/^legado_/, '').replace(/_/g, '-');
}

function hasUnsupportedJS(str, isSearchUrl = false) {
  if (!str) return false;
  const s = String(str);
  if (/@js:|<js>|<\/js>/i.test(s)) return true;
  const templates = [...s.matchAll(/\{\{([\s\S]*?)\}\}/g)];
  for (const m of templates) {
    const inner = m[1].trim();
    if (isSearchUrl && (inner === 'key' || inner === 'page')) continue;
    return true;
  }
  return false;
}

function hasUnsupportedXPath(str) {
  if (!str) return false;
  const s = String(str).trim();
  return /^@xpath:/i.test(s) || /^\/\//.test(s) || /@xpath:/i.test(s);
}

function hasUnsupportedJSON(str) {
  if (!str) return false;
  const s = String(str).trim();
  return /^@json:/i.test(s) || /^\$\./.test(s) || /^\$\.\./.test(s) || /@json:/i.test(s);
}

/**
 * Parse a Legado rule into { steps: [{selector, index}], attr, replace: [{pattern, replacement}] }.
 * Returns { ok: true, rule } or { ok: false, code, detail }.
 */
export function parseRule(raw, { requireAttr = false } = {}) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return { ok: true, rule: null };
  }
  let s = raw.trim();
  if (hasUnsupportedJS(s, false)) {
    return { ok: false, code: REJECT.UNSUPPORTED_JS_RULE, detail: 'JS rule in ' + s.slice(0, 60) };
  }
  if (hasUnsupportedXPath(s)) {
    return { ok: false, code: REJECT.UNSUPPORTED_XPATH_RULE, detail: 'XPath rule in ' + s.slice(0, 60) };
  }
  if (hasUnsupportedJSON(s)) {
    return { ok: false, code: REJECT.UNSUPPORTED_JSON_RULE, detail: 'JSONPath rule in ' + s.slice(0, 60) };
  }
  if (s.startsWith(':') || /&&|\|\||%%/.test(s)) {
    return { ok: false, code: REJECT.UNSUPPORTED_SELECTOR_SYNTAX, detail: 'Combinator or regex rule: ' + s.slice(0, 60) };
  }

  // Extract ##regex##replacement purification rules
  const replace = [];
  const hashIdx = s.indexOf('##');
  if (hashIdx >= 0) {
    const tail = s.slice(hashIdx + 2);
    s = s.slice(0, hashIdx).trim();
    const parts = tail.split('##');
    const pattern = parts[0] || '';
    const replacement = parts[1] !== undefined ? parts[1] : '';
    if (pattern) {
      try {
        new RegExp(pattern, 'g');
      } catch (err) {
        return { ok: false, code: REJECT.UNSUPPORTED_SELECTOR_SYNTAX, detail: 'Invalid regex in ## rule: ' + err.message };
      }
      replace.push({ pattern, replacement });
    }
  }

  // @css: explicit CSS selector
  if (/^@css:/i.test(s)) {
    let body = s.slice(5).trim();
    let attr = '';
    const atIdx = body.lastIndexOf('@');
    if (atIdx > 0) {
      const maybeAttr = body.slice(atIdx + 1).trim();
      if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(maybeAttr)) {
        attr = maybeAttr;
        body = body.slice(0, atIdx).trim();
      }
    }
    if (!body) {
      return { ok: false, code: REJECT.UNSUPPORTED_SELECTOR_SYNTAX, detail: 'Empty @css selector' };
    }
    if (requireAttr && !attr) attr = 'text';
    return { ok: true, rule: { steps: [{ selector: body, index: null }], attr, replace } };
  }

  // JSoup default syntax: seg1@seg2@attr
  const segments = s.split('@').map((p) => p.trim()).filter(Boolean);
  if (segments.length === 0) {
    return { ok: false, code: REJECT.UNSUPPORTED_SELECTOR_SYNTAX, detail: 'Empty rule' };
  }

  const attrSet = new Set(['text', 'owntext', 'html', 'all', 'href', 'src', 'data-src', 'data-original', 'content', 'title', 'alt']);
  let attr = '';
  const lastLower = segments[segments.length - 1].toLowerCase();
  if (attrSet.has(lastLower)) {
    attr = segments.pop();
  } else if (lastLower === 'textnodes') {
    return { ok: false, code: REJECT.UNSUPPORTED_SELECTOR_SYNTAX, detail: 'textNodes is not supported' };
  }

  const steps = [];
  for (const seg of segments) {
    if (/[\[\]!]/.test(seg)) {
      return { ok: false, code: REJECT.UNSUPPORTED_SELECTOR_SYNTAX, detail: 'Slice/negation not supported: ' + seg };
    }
    if (seg === 'children') {
      steps.push({ selector: '> *', index: null });
      continue;
    }
    let m = seg.match(/^class\.([^.]+?)(?:\.(\d+))?$/);
    if (m) {
      const cls = m[1].trim().split(/\s+/).map((c) => '.' + c).join('');
      steps.push({ selector: cls, index: m[2] !== undefined ? Number(m[2]) : null });
      continue;
    }
    m = seg.match(/^id\.([^.]+?)(?:\.(\d+))?$/);
    if (m) {
      steps.push({ selector: '#' + m[1].trim(), index: m[2] !== undefined ? Number(m[2]) : null });
      continue;
    }
    m = seg.match(/^tag\.([a-zA-Z0-9_-]+)(?:\.(\d+))?$/);
    if (m) {
      steps.push({ selector: m[1], index: m[2] !== undefined ? Number(m[2]) : null });
      continue;
    }
    // Plain CSS-like segment (e.g. "div.book > a" or "ul li")
    if (/^[a-zA-Z0-9_.*#\-\s>+~:()="']+$/.test(seg) && !/^text\./i.test(seg)) {
      steps.push({ selector: seg, index: null });
      continue;
    }
    return { ok: false, code: REJECT.UNSUPPORTED_SELECTOR_SYNTAX, detail: 'Unsupported JSoup segment: ' + seg };
  }

  if (requireAttr && !attr) attr = 'text';
  return { ok: true, rule: { steps, attr, replace } };
}

export function validateAndPlan(source) {
  if (!source || typeof source !== 'object') {
    return { ok: false, code: REJECT.MISSING_REQUIRED_FIELD, detail: 'Empty source object' };
  }
  const name = String(source.bookSourceName || '').trim();
  const baseUrl = String(source.bookSourceUrl || '').trim();
  const searchUrl = String(source.searchUrl || '').trim();
  if (!name || !baseUrl || !searchUrl || !source.ruleSearch || !source.ruleToc || !source.ruleContent) {
    return { ok: false, code: REJECT.MISSING_REQUIRED_FIELD, detail: 'Missing bookSourceName, bookSourceUrl, searchUrl, ruleSearch, ruleToc, or ruleContent' };
  }

  // Check JS in top-level / searchUrl / header
  if (hasUnsupportedJS(searchUrl, true) || hasUnsupportedJS(source.header, false) || hasUnsupportedJS(source.loginUrl, false)) {
    return { ok: false, code: REJECT.UNSUPPORTED_JS_RULE, detail: 'JS expression in searchUrl/header/loginUrl' };
  }
  if (source.header && String(source.header).trim()) {
    return { ok: false, code: REJECT.UNSUPPORTED_POST_OR_DYNAMIC_HEADER, detail: 'Custom/dynamic bookSource header' };
  }
  if (/,\s*\{/.test(searchUrl)) {
    return { ok: false, code: REJECT.UNSUPPORTED_POST_OR_DYNAMIC_HEADER, detail: 'searchUrl contains POST/request options block' };
  }
  if (!searchUrl.includes('{{key}}')) {
    return { ok: false, code: REJECT.UNSUPPORTED_SELECTOR_SYNTAX, detail: 'searchUrl does not contain {{key}}' };
  }

  // Reject pagination
  if (source.ruleToc.nextTocUrl && String(source.ruleToc.nextTocUrl).trim()) {
    return { ok: false, code: REJECT.UNSUPPORTED_PAGINATION, detail: 'ruleToc.nextTocUrl is set' };
  }
  if (source.ruleContent.nextContentUrl && String(source.ruleContent.nextContentUrl).trim()) {
    return { ok: false, code: REJECT.UNSUPPORTED_PAGINATION, detail: 'ruleContent.nextContentUrl is set' };
  }

  // Parse all required and optional rules
  const fields = [
    ['searchList', source.ruleSearch.bookList, false, true],
    ['searchName', source.ruleSearch.name, true, true],
    ['searchUrl', source.ruleSearch.bookUrl, true, true],
    ['searchAuthor', source.ruleSearch.author, true, false],
    ['searchCover', source.ruleSearch.coverUrl, true, false],
    ['infoName', source.ruleBookInfo?.name, true, false],
    ['infoAuthor', source.ruleBookInfo?.author, true, false],
    ['infoIntro', source.ruleBookInfo?.intro, true, false],
    ['infoCover', source.ruleBookInfo?.coverUrl, true, false],
    ['infoTocUrl', source.ruleBookInfo?.tocUrl, true, false],
    ['tocList', source.ruleToc.chapterList, false, true],
    ['tocName', source.ruleToc.chapterName, true, true],
    ['tocUrl', source.ruleToc.chapterUrl, true, true],
    ['content', source.ruleContent.content, true, true],
  ];

  const plan = {};
  for (const [k, raw, requireAttr, required] of fields) {
    if (required && (!raw || !String(raw).trim())) {
      return { ok: false, code: REJECT.MISSING_REQUIRED_FIELD, detail: 'Missing rule: ' + k };
    }
    const parsed = parseRule(raw, { requireAttr });
    if (!parsed.ok) return parsed;
    plan[k] = parsed.rule;
  }

  return { ok: true, plan, meta: { name, baseUrl, searchUrl } };
}

function emitExtract(varEl, rule, isHtml = false) {
  if (!rule) return '""';
  let expr = varEl;
  for (const st of rule.steps) {
    expr = '(' + expr + ').find(' + JSON.stringify(st.selector) + ')';
    if (st.index !== null) {
      expr = '(' + expr + ').eq(' + st.index + ')';
    }
  }
  const attr = (rule.attr || (isHtml ? 'html' : 'text')).toLowerCase();
  if (attr === 'html' || attr === 'all') {
    expr = '((' + expr + ').html() || "")';
  } else if (attr === 'text' || attr === 'owntext') {
    expr = '((' + expr + ').text() || "").trim()';
  } else {
    expr = '((' + expr + ').attr(' + JSON.stringify(rule.attr) + ') || "").trim()';
  }
  for (const rep of rule.replace) {
    expr = '(' + expr + ').replace(new RegExp(' + JSON.stringify(rep.pattern) + ', "g"), ' + JSON.stringify(rep.replacement) + ')';
  }
  return expr;
}

function emitSelectList(rootExpr, rule) {
  let expr = rootExpr;
  for (let i = 0; i < rule.steps.length; i++) {
    const st = rule.steps[i];
    if (i === 0) {
      expr = rootExpr + '(' + JSON.stringify(st.selector) + ')';
    } else {
      expr = '(' + expr + ').find(' + JSON.stringify(st.selector) + ')';
    }
    if (st.index !== null) {
      expr = '(' + expr + ').eq(' + st.index + ')';
    }
  }
  return expr;
}

export function generateNovelJS(meta, plan) {
  const key = sanitizeKey(meta.name, meta.baseUrl);
  const className = sanitizeClassName(key);
  const baseUrl = meta.baseUrl.replace(/\/+$/, '');

  const searchUrlExpr =
    'new URL(' +
    JSON.stringify(meta.searchUrl) +
    '.replace(/\{\{key\}\}/g, encodeURIComponent(keyword)).replace(/\{\{page\}\}/g, String(page || 1)), this.url).toString()';

  const code = [
    '// @veneracat-converter: ' + CONVERTER_VERSION,
    '// @source-url: ' + meta.baseUrl,
    '',
    'class ' + className + ' extends NovelSource {',
    '  name = ' + JSON.stringify(meta.name),
    '  key = ' + JSON.stringify(key),
    '  version = "1.0.0"',
    '  minAppVersion = "1.0.0"',
    '  url = ' + JSON.stringify(baseUrl),
    '',
    '  _cheerio() {',
    '    return LNReaderAdapter.createRequire(this)("cheerio")',
    '  }',
    '',
    '  _abs(u, base) {',
    '    if (!u) return ""',
    '    try { return new URL(u, base || this.url).toString() } catch (_) { return u }',
    '  }',
    '',
    '  async _getHtml(url) {',
    '    const res = await Network.get(url)',
    '    if (res.status < 200 || res.status >= 300) throw new Error("HTTP " + res.status + " for " + url)',
    '    return res.body || ""',
    '  }',
    '',
    '  async popular(page) {',
    '    return this.search("龙", page || 1)',
    '  }',
    '',
    '  async search(keyword, page) {',
    '    const url = ' + searchUrlExpr,
    '    const html = await this._getHtml(url)',
    '    const $ = this._cheerio().load(html)',
    '    const items = [];',
    '    ' + emitSelectList('$', plan.searchList) + '.each((_, el) => {',
    '      const $el = $(el)',
    '      const title = ' + emitExtract('$el', plan.searchName),
    '      const id = this._abs(' + emitExtract('$el', plan.searchUrl) + ', url)',
    '      if (!id || !title) return',
    '      const item = { id, title }',
    '      const cover = this._abs(' + emitExtract('$el', plan.searchCover) + ', url)',
    '      if (cover) item.cover = cover',
    '      const author = ' + emitExtract('$el', plan.searchAuthor),
    '      if (author) item.author = author',
    '      items.push(item)',
    '    })',
    '    return { items }',
    '  }',
    '',
    '  async detail(id) {',
    '    const bookUrl = this._abs(id, this.url)',
    '    const html = await this._getHtml(bookUrl)',
    '    const $ = this._cheerio().load(html)',
    '    const $root = $.root()',
    '    const title = ' + emitExtract('$root', plan.infoName) + ' || $("title").text().trim()',
    '    const author = ' + emitExtract('$root', plan.infoAuthor),
    '    const summary = ' + emitExtract('$root', plan.infoIntro),
    '    const cover = this._abs(' + emitExtract('$root', plan.infoCover) + ', bookUrl)',
    '    let tocUrl = bookUrl',
    '    let $toc = $',
    ...(plan.infoTocUrl
      ? [
          '    const nextToc = this._abs(' + emitExtract('$root', plan.infoTocUrl) + ', bookUrl)',
          '    if (nextToc && nextToc !== bookUrl) { tocUrl = nextToc; $toc = this._cheerio().load(await this._getHtml(tocUrl)) }',
        ]
      : []),
    '    const chapters = [];',
    '    ' + emitSelectList('$toc', plan.tocList) + '.each((_, el) => {',
    '      const $el = $toc(el)',
    '      const ctitle = ' + emitExtract('$el', plan.tocName),
    '      const cid = this._abs(' + emitExtract('$el', plan.tocUrl) + ', tocUrl)',
    '      if (!cid || !ctitle) return',
    '      chapters.push({ id: cid, title: ctitle })',
    '    })',
    '    return { id: bookUrl, title, cover, author, summary, status: "", tags: [], chapters }',
    '  }',
    '',
    '  async chapter(novelId, chapId) {',
    '    const url = this._abs(chapId, this.url)',
    '    const html = await this._getHtml(url)',
    '    const $ = this._cheerio().load(html)',
    '    const $root = $.root()',
    '    const content = ' + emitExtract('$root', plan.content, true),
    '    return { html: content }',
    '  }',
    '}',
    '',
  ].join('\n');

  return { key, entryId: sanitizeEntryId(key), filename: key + '.js', code, sha256: sha256(code) };
}

export function convertSources(sources) {
  const converted = [];
  const rejected = [];
  for (const src of sources) {
    const res = validateAndPlan(src);
    if (!res.ok) {
      rejected.push({
        name: src?.bookSourceName || '(unnamed)',
        url: src?.bookSourceUrl || '',
        code: res.code,
        detail: res.detail,
      });
      continue;
    }
    const gen = generateNovelJS(res.meta, res.plan);
    converted.push({ ...gen, name: res.meta.name, url: res.meta.baseUrl });
  }
  return {
    converter: CONVERTER_VERSION,
    total: sources.length,
    convertedCount: converted.length,
    rejectedCount: rejected.length,
    conversionRate: sources.length ? Number(((converted.length / sources.length) * 100).toFixed(1)) : 0,
    converted,
    rejected,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let input = '';
  let limit = 20;
  let outDir = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = args[++i];
    else if (args[i] === '--limit' && args[i + 1]) limit = Number(args[++i]);
    else if (args[i] === '--out-dir' && args[i + 1]) outDir = args[++i];
  }
  if (!input) {
    console.error('Usage: node tools/convert/legado/convert.mjs --input <file-or-url> [--limit 20] [--out-dir dir]');
    process.exit(1);
  }
  const raw = /^https?:\/\//i.test(input) ? await (await fetch(input)).text() : await readFile(input, 'utf8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed.slice(0, limit) : [parsed];
  const report = convertSources(list);
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    for (const item of report.converted) {
      await writeFile(join(outDir, item.filename), item.code, 'utf8');
    }
  }
  console.log(JSON.stringify({
    converter: report.converter,
    total: report.total,
    convertedCount: report.convertedCount,
    rejectedCount: report.rejectedCount,
    conversionRate: report.conversionRate,
    converted: report.converted.map(({ code, ...rest }) => rest),
    rejected: report.rejected,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
