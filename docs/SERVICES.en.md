# Service Plugin Packages (Bangumi / TMDB / Trakt)

[简体中文](SERVICES.md) | English

This repository maintains three installable service packages in the shared collection [catalog/source.json](../catalog/source.json) following the VeneraCat Core `service.js` contract, all licensed under `LGPL-3.0-or-later`.

- Source directories: `catalog/packages/service.{bangumi,tmdb,trakt}/` (each containing `service.json` and a self-contained `index.mjs`)
- Built archives: `build/packages/service.<name>/service.<name>.zip` (deterministically packed by `node tools/build.mjs` for direct installation via Core `service.InstallPackage`)
- Credential boundary: all API keys, access tokens, and client IDs are read from the host via `secret(key)`; no credentials are hardcoded, and errors/logs redact secret values.

## 1. Methods and Required Secrets

| Service ID | Required `secret(key)` | Exported methods (`describe()` / `handle()`) | Upstream API contract |
|---|---|---|---|
| `service.bangumi` | `access_token` (optional for public `metadata.search`/`metadata.detail`; required for `account.me`, `collection.update`, `episode.update`) | `account.me`, `metadata.search` (preserves `User-Agent` and legacy `/search/subject/` fallback), `metadata.detail`, `collection.get`, `collection.update`, `episode.update` | Bangumi OpenAPI v0 (`api.bgm.tv`) |
| `service.tmdb` | `api_read_token` or `api_key` (prefers Bearer `api_read_token`, falls back to v3 `api_key`) | `metadata.search`, `metadata.detail` (movie, TV show, season, episode), `artwork.list` (posters, backdrops, logos, stills) | TMDB API v3 (`api.themoviedb.org/3`) |
| `service.trakt` | `client_id` (required for all methods) and `access_token` (optional for `metadata.search`; required for account, watchlist, history, and scrobble) | `account.me`, `metadata.search`, `watchlist.list`, `history.list`, `scrobble.start`, `scrobble.stop` | Trakt API v2 (`api.trakt.tv`) |

When required secrets are missing, each service returns a structured error `{ ok: false, error: { code: "MISSING_SECRET", missingSecrets: [...] } }` without throwing uncaught errors or echoing any configured secrets.

## 2. Declarative Settings Module Alignment

`templates/modules/reader-preferences.vcmodule` stays aligned with the `reader-preferences` (`kind: "settings-module"`) entry in `catalog/source.json`:

- Metadata headers: `#!id=reader-preferences`, `#!name=阅读偏好示例`, `#!version=0.1.0`, `#!format=veneracat-module/1-draft`, `#!requires=settings-module.v1`
- Sections: declarative `[Reader]` keys only (`page-gap = 8`, `keep-screen-on = true`), with no proxy, MITM, or script execution sections.

## 3. Verification Scope and Limits

All three service packages are truthfully marked `fixture-verified`:

- Verified by offline mock-host unit tests (`node --test tools/services/services.test.mjs`) covering every method, headers, secret redaction, and fallback paths;
- Verified against actual VeneraCat Core `service.InstallPackageExpecting` + `service.Runtime` (MoeJS) for zip installation, compilation, `describe()`, and `handle()` (`node prototypes/catalog-contract/run.mjs`);
- **No live remote account sign-in or production API write acceptance has been performed**, and the catalog metadata states this explicitly.
