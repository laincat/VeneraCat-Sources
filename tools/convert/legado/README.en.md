# Legado pure-CSS subset converter

English | [简体中文](README.md)

This tool compiles Legado book sources that fall within the pure-CSS / 1-to-1 JSoup subset directly into standalone `novel-js` scripts without adding a runtime rule engine.

## Supported and rejected scope

- **Supported**: GET `searchUrl` with `{{key}}` and `{{page}}` placeholders, `@css:`, 1-to-1 JSoup default selectors (`class.` / `id.` / `tag.` / index / attribute), and `##regex##replacement` cleanup rules.
- **Rejected with reason codes**: `@js:` / `<js>` / `{{js}}` (`UNSUPPORTED_JS_RULE`), POST or dynamic headers (`UNSUPPORTED_POST_OR_DYNAMIC_HEADER`), `@XPath:` (`UNSUPPORTED_XPATH_RULE`), `@json:` (`UNSUPPORTED_JSON_RULE`), `nextTocUrl` / `nextContentUrl` pagination (`UNSUPPORTED_PAGINATION`), non-1-to-1 selector syntax (`UNSUPPORTED_SELECTOR_SYNTAX`), and failed live 4-step probes (`LIVE_PROBE_FAILED`).

## Usage and tests

```sh
node --test tools/convert/legado/convert.test.mjs
node tools/convert/legado/convert.mjs --input <legado.json-or-url> --limit 20
```
