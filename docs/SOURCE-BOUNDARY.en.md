# Unified cross-platform source collections

[简体中文](SOURCE-BOUNDARY.md) | English

On2026-11-04 the user clarified that plugins,extensions and subscriptions must remain unified across platforms,with supported platforms declared in entries. Simple capabilities may borrow Surge module syntax,but everything belongs to a source collection. This replaces the initial per-project directory design.

## 1. Layers

| Term | Meaning | Outside its responsibility |
|---|---|---|
| Source/collection | A publisher-maintained content set with stable source.id,version,description and entries | Not a client-specific repository or executor |
| Entry | One plugin,extension,theme,module,service or source reference | No duplicate identity/version for iOS versus desktop |
| Artifact | Versioned text/JSON/JS package/resources with location,size and digest | Not account data or subscription state |
| Subscription | A user's update relationship to a collection,including URL,channel/version and update policy | Not automatic installation/enablement of every entry |
| Runtime capability | APIs actually provided by a client/runtime for compatibility decisions | Not a grant of every platform feature or other accounts' access |

Earlier Core documentation separated origin indexes,containers and execution,retaining Origin/IndexURL and body hashes. These boundaries remain; unified collections are added. A legacy ComicSource “comic source” still means its content-provider plugin; new terminology must not break that protocol.

## 2. One collection for all platforms

Multiple sources may be registered,each owning a shared cross-platform collection. This project starts with the official collection. Publishers or content scope may define sources;client platforms do not.

`catalog/source.json` is the sole maintained input and `build/source.json` the sole collection output. Classify entries by content kind,not client or OS directories. Core is a shared runtime,not a third content-consumption platform needing another subscription.

Each entry carries:

- id/kind/name/version/status for identity,type and maturity.
- supports.platforms such as ios,macos,windows;iPadOS belongs to ios.
- supports.requiresCapabilities such as video-source.js,theme.legacy-json,service.v1.
- artifact for actual bytes/digest/size; plans have no artifact.
- verification separating author declarations from observed coverage.

```json
{
  "id": "service.tmdb",
  "kind": "service",
  "status": "experimental",
  "supports": {
    "platforms": ["ios", "macos", "windows"],
    "requiresCapabilities": ["service.v1"]
  }
}
```

Identity is source.id + entry.id,with one version/artifact across platforms. Download/mirror URLs are not identity,and matching names cannot silently transfer an installation to another publisher. Current Registry still handles legacy script-key collisions; this does not establish simultaneous cross-source same-key execution. Migration needs explicit mapping/conflict handling without rewriting script keys silently.

Clients evaluate platform,capabilities and status,explaining unsupported requirements while sharing collection content. Accounts,enablement and preferences are user configuration; their cross-device synchronization belongs to configuration policy.

## 3. Classification and references

A collection may contain comic/video plugins,Magpie providers,services,image enhancers,themes,pages and settings modules. Execution formats may differ while origin,versions and updates remain shared.

Aggregation of another publisher uses an explicit source-reference entry with identity/URL and original ownership. Subscribing to an outer collection does not recursively trust,enable or execute everything inside references. Remote recursive resolution is not implemented in the prototype.

`build/compat/vcvideo.json` is a generated legacy video format adapter from the same collection,without separate ownership or platform folders,kept until clients install video sources directly from the unified collection. The Core contract probe currently validates installation through this legacy video adapter; full unified consumer wiring still requires client integration.

## 4. Surge-inspired simple modules

Reference the[official Surge Module documentation](https://manual.nssurge.com/profile/module.html) for readable metadata headers,INI sections and reversible overlays. This is format inspiration,not support for arbitrary.sgmodule imports,proxy/MITM behavior or network scripting.

Our draft uses`.vcmodule`; see`templates/modules/reader-preferences.vcmodule`. A module can declare reading preferences or theme-token overrides without a JS program. It remains an entry of the same collection and declares its requirements.

The initial design accepts only explicitly supported settings keys,without script execution,arbitrary files,secrets or global interception. Prefer an established INI parser for the eventual executor. Unknown sections/keys or missing capabilities must fail explicitly rather than partially apply.

Store an independent overlay:effective settings combine base configuration and ordered enabled modules. Disabling removes its overlay rather than permanently rewriting user preferences. Only the example format and collection artifact exist now,not a client executor.

## 5. Packages and permissions

A shared collection does not share all runtimes or accounts. JS plugins,Magpie packages,theme data and modules retain their respective hosts;platform bridges scope networking,credentials,files and pages to entries/accounts.

Preserve body-digest semantics for legacy single-file sources;archives receive separate archive hashes. Digests do not prove publisher identity. Subscription,installation,enablement and authorization remain separate;a collection gains no whole-library/account access merely by being subscribed.

## 6. Current iteration

The single cross-platform collection remains unified without per-client publication folders. Trakt, TMDB, and Bangumi are now packaged as installable `service.js` zip archives under `catalog/packages/` and `build/packages/` (`fixture-verified`: offline mock-host tests and real Core `service.Store`/`service.Runtime` contract checks pass; no live account acceptance). `templates/modules/reader-preferences.vcmodule` stays aligned with the `settings-module` entry headers and declarative-only sections.

Next implement the shared consumer/capability matching, then client service panels and declarative-module executors. All clients retain the same source/entry identities; UI presents compatibility and user choices rather than maintaining independent sources.
