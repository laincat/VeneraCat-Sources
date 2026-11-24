import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSources, parseRule, REJECT } from './convert.mjs';

test('parseRule handles @css, JSoup default, and ##regex##replace', () => {
  const r1 = parseRule('@css:.book-list > li a@href##\\?ref=.*##');
  assert.equal(r1.ok, true);
  assert.equal(r1.rule.steps[0].selector, '.book-list > li a');
  assert.equal(r1.rule.attr, 'href');
  assert.equal(r1.rule.replace.length, 1);

  const r2 = parseRule('class.result.0@tag.a@text##广告##');
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.rule.steps, [
    { selector: '.result', index: 0 },
    { selector: 'a', index: null },
  ]);
  assert.equal(r2.rule.attr, 'text');
  assert.equal(r2.rule.replace[0].pattern, '广告');
});

test('convertSources rejects every unsupported Legado construct with explicit reason code', () => {
  const base = {
    bookSourceName: 'Base',
    bookSourceUrl: 'https://demo.example.test',
    searchUrl: '/search?q={{key}}&p={{page}}',
    ruleSearch: { bookList: 'class.item', name: 'tag.a@text', bookUrl: 'tag.a@href' },
    ruleBookInfo: { name: 'tag.h1@text' },
    ruleToc: { chapterList: 'class.ch@tag.a', chapterName: 'text', chapterUrl: 'href' },
    ruleContent: { content: 'id.content@html##广告##' },
  };

  const cases = [
    { ...base, bookSourceName: 'CleanCSS' },
    { ...base, bookSourceName: 'HasJS', searchUrl: '@js:url' },
    { ...base, bookSourceName: 'HasPost', searchUrl: '/s,{"method":"POST","body":"k={{key}}"}' },
    { ...base, bookSourceName: 'HasXPath', ruleToc: { ...base.ruleToc, chapterList: '@XPath://li/a' } },
    { ...base, bookSourceName: 'HasJSON', ruleSearch: { ...base.ruleSearch, bookList: '@json:$.data[*]' } },
    { ...base, bookSourceName: 'HasNextToc', ruleToc: { ...base.ruleToc, nextTocUrl: 'a.next@href' } },
    { ...base, bookSourceName: 'HasNextContent', ruleContent: { ...base.ruleContent, nextContentUrl: 'a.next@href' } },
  ];

  const report = convertSources(cases);
  assert.equal(report.convertedCount, 1);
  assert.equal(report.rejectedCount, 6);
  const byName = new Map(report.rejected.map((r) => [r.name, r.code]));
  assert.equal(byName.get('HasJS'), REJECT.UNSUPPORTED_JS_RULE);
  assert.equal(byName.get('HasPost'), REJECT.UNSUPPORTED_POST_OR_DYNAMIC_HEADER);
  assert.equal(byName.get('HasXPath'), REJECT.UNSUPPORTED_XPATH_RULE);
  assert.equal(byName.get('HasJSON'), REJECT.UNSUPPORTED_JSON_RULE);
  assert.equal(byName.get('HasNextToc'), REJECT.UNSUPPORTED_PAGINATION);
  assert.equal(byName.get('HasNextContent'), REJECT.UNSUPPORTED_PAGINATION);
});
