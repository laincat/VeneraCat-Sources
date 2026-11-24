# Legado 纯 CSS 子集转换器

[English](README.en.md) | 简体中文

本工具直接把符合纯 CSS / JSoup 默认子集的 Legado 书源 JSON 编译为独立的 `novel-js` 脚本，不在运行时引入规则引擎。

## 支持与拒绝边界

- **支持**：GET 搜索地址（`{{key}}`、`{{page}}` 占位）、`@css:`、可一对一转成 CSS 的 JSoup 默认写法（`class.` / `id.` / `tag.` / 索引 / 属性）、`##正则##替换` 净化规则。
- **拒绝并输出原因码**：`@js:` / `<js>` / `{{js}}`（`UNSUPPORTED_JS_RULE`）、POST 或动态请求头（`UNSUPPORTED_POST_OR_DYNAMIC_HEADER`）、`@XPath:`（`UNSUPPORTED_XPATH_RULE`）、`@json:`（`UNSUPPORTED_JSON_RULE`）、`nextTocUrl` / `nextContentUrl` 翻页（`UNSUPPORTED_PAGINATION`）、不可一对一转换的选择器（`UNSUPPORTED_SELECTOR_SYNTAX`）、真站四步探活失败（`LIVE_PROBE_FAILED`）。

## 用法与测试

```sh
node --test tools/convert/legado/convert.test.mjs
node tools/convert/legado/convert.mjs --input <legado.json-or-url> --limit 20
```
