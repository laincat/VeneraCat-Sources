# LNReader 小说源转换器

[English](README.en.md) | 简体中文

本工具从上游 [LNReader/lnreader-plugins](https://github.com/LNReader/lnreader-plugins)（`plugins/v3.0.0` 分支）拉取已编译的 CommonJS 插件，按原样包进 `NovelSource` 外壳（通过 Core 的 `LNReaderAdapter` 运行），计算 SHA-256 并写入 `catalog/source.json`。

## 用法

```sh
node tools/convert/lnreader/convert.mjs --ids ixdzs8,quanben,novelbin
npm run build
```

## 条目元数据

- 条目类型：`novel-source`
- 能力声明：`novel-source.js`
- 许可证：`MIT`（保留上游原作者、原链接与转换器版本 `lnreader/1.0.0`）
