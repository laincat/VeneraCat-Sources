# Upstream TMDB SDK reuse prototype

[简体中文](README.md) | English

This is not an installable service plugin or client integration. It checks whether built `tmdb-ts 2.3.0` can reuse the existing Core module/HTTP host instead of maintaining our own request implementation.

## Run

Requires Node/npm here and the adjacent VeneraCat Core repository with its Go dependencies.

```sh
npm install --no-package-lock
npm run build
npm run test:core
```

Dependencies install within the compatible ranges in `package.json` (no lockfile is committed); the build produces `build/index.mjs` and license notices. Runtime content is browser-target ESM,not Node/Bun on iOS. The test passes it to actual Core NewBundle/Load/NewInstance/UseHost/Call and verifies the GET path,Unicode/special-character query,language,Bearer header and JSON response through an injected host. It makes no real TMDB connection.

## Finding and resolution

Without a polyfill,actual Core failed with `ReferenceError: URLSearchParams is not defined`. Bundling MIT-licensed `core-js-pure 3.51.0` made the same path pass without modifying tmdb-ts or implementing URLSearchParams ourselves. The initial single-file bundle was53619bytes; see `../../research/tmdb-sdk-receipt.json`.

Only one TV-search endpoint was verified. Details,accounts,pagination,errors,cancellation,iOS execution and the complete SDK remain unqualified. A fixed fake token is used without reading or storing credentials. Production code needs a scoped account/secret bridge.

The SDK primarily uses Bearer access tokens. Current iOS accepts both v3 API keys and v4 read tokens,so migration must retain a v3 adapter rather than removing that capability because this prototype passed. The service ABI,optional installation and client presentation are still to be implemented.
