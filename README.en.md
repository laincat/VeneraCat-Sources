# VeneraCat Sources

[简体中文](README.md) | English

**One source is one content collection shared by every platform.** Plugins,extensions,themes,simple modules and services belong to the same collection. Entries declare supported platforms and required host capabilities. A subscription tracks that collection. The initial separate Nekularity/Nekophage/Core publication folders have been removed.

This is a local prototype without a remote repository,publication URL or automatic client catalogue integration.

## Documentation

- [Source,collection,entry,subscription and module boundaries](docs/SOURCE-BOUNDARY.en.md)
- [Service plugin packages (Bangumi / TMDB / Trakt)](docs/SERVICES.en.md)
- [Project state,upstream dependencies,Magpie,editors and themes](docs/ECOSYSTEM.en.md)
- [AI manga colorization plan](docs/COLORIZATION.en.md)
- [GitHub search/source evidence](research/github-2026-11-04.json)
- [TMDB SDK and standard-polyfill prototype in actual Core](prototypes/tmdb-sdk/README.en.md)

## Layout

```text
catalog/source.json       One collection; content kinds and per-entry supports
catalog/packages/         First-party published sources owned here (such as Plex)
plans/                    Non-installable service/colorization designs in that source
prototypes/               Reproducible reuse and catalogue contract evaluations
templates/                Theme,service,layout and simple configuration examples
tools/build.mjs           Shared-source publication builder
research/                 Discovery and verification records
docs/                     Paired boundaries,design and migration documents
build/source.json         The same collection read by all clients
build/packages/           One content artifact per published entry
build/compat/             Legacy video format adapter from that collection,not per OS
```

The initial source ID is `veneracat.official`. Content identity is `source.id + entry.id`; its download URL may change. Platform compatibility is not a namespace. Additional publishers can maintain their own collections without separate iOS and desktop sources.

The authoritative published Plex source now lives in this repository at `catalog/packages/plex/plex.js`, so the builder reads local files without depending on an adjacent repository's Git history.

## Build and validation

Requires Node.js 20+ only; no network,Git,adjacent repository or npm installation is needed for publication. The builder stages and verifies outputs before atomically replacing `build/`:

```sh
node tools/build.mjs
node prototypes/catalog-contract/run.mjs
node --test tools/convert/legado/convert.test.mjs tools/services/services.test.mjs
```

The second also needs adjacent VeneraCat Core and its Go dependencies. It checks one collection,artifact hashes and platform/capability declarations,asserts no per-client publication folders exist,verifies real Core installation and execution of the `service.{bangumi,tmdb,trakt}` zip packages,and parses the legacy video adapter/installs video plugins.

Other optional prototypes: `node prototypes/moejs-webapi/run.mjs`; `npm install --no-package-lock` then `node check.mjs` in `prototypes/editor-highlight`; and the TMDB prototype's README. These are not production client implementations.

## Current content and compatibility

One collection contains video/novel sources,a theme example,a Surge-style reading-preferences example,packaged Trakt/TMDB/Bangumi service zips (`experimental`, `fixture-verified`),and the colorization design. Content,prototypes and plans have distinct statuses; plans have no installable artifact.

- `source.json` is a new draft protocol without a current unified client consumer.
- `compat/vcvideo.json` adapts the existing video index format from the same collection,without independent ownership,and stays until clients install video sources directly from the unified collection. Old clients cannot yet install every kind through the new single entry point.
- Current iOS supports manual legacy theme JSON; desktop global themes and the new module executor are not implemented.
- The `.vcmodule` example borrows metadata headers and INI settings-overlay syntax,without claiming compatibility with Surge proxy,MITM or script behavior.
- No real Plex server,service login,model inference or new client UI acceptance occurred.

## Publication and maintenance

All platforms share source IDs,entry IDs,versions and content. Clients evaluate `supports.platforms` and `requiresCapabilities`; declarations are not device verification. Subscribing does not execute every entry: installation,enablement and permissions are separate.

There is no invented publication URL. Preserve existing script-body digest semantics and give future archives separate digests. A checksum establishes integrity,not publisher identity. Third-party code/models retain their own licenses; this repository's LGPL-3.0-or-later does not relicense them.
