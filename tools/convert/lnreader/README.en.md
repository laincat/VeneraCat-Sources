# LNReader novel source converter

English | [简体中文](README.md)

This tool fetches pre-built CommonJS plugins from upstream [LNReader/lnreader-plugins](https://github.com/LNReader/lnreader-plugins) (`plugins/v3.0.0` branch), wraps each unmodified plugin in a `NovelSource` shell backed by Core's `LNReaderAdapter`, computes its SHA-256, and writes entries into `catalog/source.json`.

## Usage

```sh
node tools/convert/lnreader/convert.mjs --ids ixdzs8,quanben,novelbin
npm run build
```

## Entry metadata

- Entry kind: `novel-source`
- Required capability: `novel-source.js`
- License: `MIT` (records upstream author, source URL, and converter version `lnreader/1.0.0`)
