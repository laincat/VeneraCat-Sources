import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {javascriptLanguage} from '@codemirror/lang-javascript';
import {jsonLanguage} from '@codemirror/lang-json';
import {highlightTree, classHighlighter} from '@lezer/highlight';

const source = readFileSync(fileURLToPath(new URL('../../../Nekularity/plugins/plex.js',import.meta.url)), 'utf8');
const json = JSON.stringify({items:Array.from({length:1200},(_,i)=>({id:i,name:`页面 ${i}`,enabled:true}))},null,2);
const results = [];
for (const [name, text, language] of [['existing Plex JavaScript',source,javascriptLanguage],['JSON catalogue',json,jsonLanguage]]) {
  const start = performance.now();
  const tree = language.parser.parse(text);
  const spans = [];
  highlightTree(tree,classHighlighter,(from,to,classes)=>spans.push({from,to,classes}));
  assert.ok(spans.length > 20);
  assert.ok(spans.some(s=>s.classes.includes('string')));
  assert.ok(spans.some(s=>s.classes.includes('keyword') || s.classes.includes('bool')));
  assert.ok(spans.every(s=>s.from>=0 && s.to<=text.length && s.from<s.to));
  results.push({name,characters:text.length,highlightSpans:spans.length,parseAndHighlightMs:performance.now()-start});
}
const record={scope:'Node parser/highlighter only; not WebView editing, IME, touch, accessibility or iOS performance',packages:JSON.parse(readFileSync('package.json','utf8')).dependencies,results};
writeFileSync('result.json',JSON.stringify(record,null,2)+'\n');
console.log('PASS CodeMirror parses and highlights actual Plex source and JSON catalogue; receipt.json');
