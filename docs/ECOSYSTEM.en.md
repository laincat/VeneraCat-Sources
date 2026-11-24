# Three-project ecosystem, dependencies and plugin design

[简体中文](ECOSYSTEM.md) | English

Survey date: 2026-11-04. The[unified-source boundary](SOURCE-BOUNDARY.en.md) supersedes the initial project split: all platforms share each source collection,classified by content kind with support annotations. Based on actual local code/manifests, delivery receipts, GitHub searches and inspection of READMEs, licenses and source. Repository metadata and blob identities are in [research](../research/github-2026-11-04.json). Upstream claims and our measurements are separate. Finish foundations, architecture and infrastructure before rebuilding client UI/UX. Prefer maintained upstream dependencies over copying an application and maintaining a fork.

## 1. Current state

| Project | Actual implementation/delivery | Principal unfinished foundations |
|---|---|---|
| Nekularity | SwiftUI + NekularityKit + gomobile Core; published 0.3.4/16 with functional Core pin3be57b5; already depends on AetherEngine7.53.1; historical436/81 Kit regression and targeted simulator evidence have distinct scopes | URLSession failure/cancellation lifetime investigation on Mac; generic service host, extension registration and unified catalogue remain incomplete; device/background/PiP conditions retain their handoff |
| Nekophage | Go + MyGo0.7.3; WebView reader/player; HLS.js1.7.4; Core3be57b5; current delivery0.2.7/0db2ead | bfc3484 transform-failure fallback passed Windows engineering checks and exact-file Mac regression, without a new package; service/theme catalogue consumers and a future UI shell remain |
| VeneraCat Core | Go1.27.1 module, MoeJS, comic/video/Kazumi, standard AI protocols and Magpie provider host, subscriptions and backup; public mainc0f0dfa, functional consumer pin3be57b5 | Generic service/image-enhancer contracts, capability negotiation/lifecycle and specification-generation tooling; no qualified replacement JS engine |
| VeneraCat Sources | One shared collection,content kinds and per-entry supports;deterministic publication,content/module examples and real Core legacy-format contracts. The initial three-project split is withdrawn | Remote destination, client catalogue integration and implementation of the draft service packages; no automatic installation of new services |

The 0.3.4 cross-process report came from an Orca Worker: same-source search/episode entry, PID2020→2099, start7seconds. It does not cover direct Continue Watching or a device. Desktop Mac coverage used c545212 plus tested0db files and the two bfc files, not the full bfc tree. Source revisions and delivered packages remain distinct.

Some ARCHITECTURE/AI-CORE-BOUNDARY prose is an early design record. Its old uncompiled/not-yet-implemented statements do not describe current standard Chat/Responses/Messages paths, which have separate verification. This does not establish all tool/multimodal conversion, routing or middleware.

## 2. Important components and direct reuse

| Component | Existing/recommended upstream dependency | Decision and maintenance boundary |
|---|---|---|
| JS engine | [MoeJS](https://github.com/MoeForge/moejs),Apache-2.0; current pseudoversion0a0ed36 | Keep the production pin; do not write an engine. Upgrade against actual source, Magpie, cancellation and resource contracts |
| New engine candidate | [go-quickjs](https://github.com/go-quickjs/go-quickjs),MIT | New in2026; claims pure Go, modules/Promises and optional JIT. Importable library, but not tested with this source corpus or gomobile/iOS. Evaluate interpreter operation for iOS rather than desktop JIT scores |
| Other engines | [goja](https://github.com/dop251/goja),[Sobek](https://github.com/grafana/sobek),MIT | Maintained libraries, not drop-in MoeJS APIs; qualify modules and host adaptation before switching |
| New engine candidate | [slowjs](https://github.com/liustack/slowjs),mixed MIT/BSD/ICU notices | Latest README now includes linux/darwin amd64/arm64 and windows/amd64, correcting the older two-platform survey; iOS is not listed. Account for Go assembly/runtime coupling |
| iOS media | [AetherEngine](https://github.com/superuser404notfound/AetherEngine),currently7.53.1 | Already a direct dependency. Current upstream LICENSE is LGPL-3.0 with an App Store/DRM exception; check the shipped revision and dependency notices instead of retroactively assigning the latest exception to old artifacts |
| Apple media alternative | [MPVKit](https://github.com/mpvkit/MPVKit),LGPL-3.0 | Importable library; no present need to add a second large media stack |
| Desktop media | [HLS.js](https://github.com/video-dev/hls.js),Apache-2.0,currently1.7.4 | Retain pinned bundled assets; native HLS/WebView decoding and our media proxy have different responsibilities |
| Desktop shell | [MyGo](https://github.com/egoist/mygo),MIT | Current Go native-rendered controls; different from Magpie's main Web UI |
| Magpie-style shell | [Wails](https://github.com/wailsapp/wails),MIT | Magpie currently pinsv3.0.0-beta.24. Qualify a shell adapter before migration; do not assume beta platform/build behavior is stable |
| Web components | [Mantine](https://github.com/mantinedev/mantine),MIT | A possible React dependency for maintained forms/menus/dialogs; not Magpie's existing framework. Use one component system |
| Theme build | [Style Dictionary](https://github.com/style-dictionary/style-dictionary),Apache-2.0 | DTCG authoring tokens compiled into CSS and platform data; no Node build runtime on users' devices |
| iOS image pipeline candidate | [Nuke](https://github.com/kean/Nuke),MIT | Can supply decoding/cache/coalescing with our partitioned data loader and source transforms; cache identity must include account/source/config version. Its default downloader must not replace established isolation |
| TypeScript publishing | [esbuild](https://github.com/evanw/esbuild),MIT | Browser-target ESM build artifacts; not Node/Bun/npm installation on iOS |
| API client generation | [openapi-ts](https://github.com/hey-api/hey-api),MIT | Generate narrow clients from official OpenAPI; verify their actual fetch/Request/Headers requirements |
| HTML/XPath,SQLite | cascadia/htmlquery/xpath,modernc.org/sqlite | Already upstream dependencies; no unsupported rewrite of parsers or databases |
| Networking/secret storage | URLSession,Go net/http,system Keychain/credential APIs | Use platform mechanisms; retain ownership of partitioning, request attribution, permissions and progress semantics |

The already-pinned MoeJS also exposes `webapi` and `CompileTS`,a priority reuse opportunity over maintaining URL/Headers/Streams ourselves. Eight library checks passed on that exact dependency: URLSearchParams,mutable URL query,Request/Headers,Response.json,AbortController,network refusal without an http.Client,TS type erasure and enum rejection. See[moejs-webapi-receipt.json](../research/moejs-webapi-receipt.json). Existing Core host integration is unchanged. Migration needs a restricted http.RoundTripper bridge to client-injected transport,not a default network client,and must retain actual cancellation,backpressure and early-stream regressions. Bundled core-js-pure is a transition for released Core; prefer eliminating duplicate host compatibility code later.

Searches included recently updated/new projects and established comparisons, followed by README, entry-point and license checks. Stars are background, not compatibility evidence. No claim is made that arbitrary npm packages run in MoeJS.

## 3. JavaScript editors with highlighting

| Option | Platforms/status | Recommendation |
|---|---|---|
| [Runestone](https://github.com/simonbs/Runestone),MIT | Native iOS editor,tree-sitter,highlighting/folding/search; package declaresiOS14+ | Primary native iOS candidate,thin UIViewRepresentable and JS/JSON grammars; Catalyst is not an established desktop solution |
| [CodeMirror6](https://codemirror.net/) | WebView2/WKWebView/Web; GitHub dev moved to the author's forge | Primary desktop choice and shared iOS alternative; import npm packages and bundle offline |
| [Monaco](https://github.com/microsoft/monaco-editor),MIT | Desktop language tooling; official FAQ explicitly excludes mobile browsers/frameworks | Desktop advanced alternative only; address workers,offline resources and size |
| [CodeEditorView](https://github.com/mchakravarty/CodeEditorView),Apache-2.0 | SwiftUI/TextKit2,iOS/macOS/visionOS; some completion/info features remain macOS-only | Apple-platform alternative,not Windows |
| [SyntaxEditorUI](https://github.com/lynnswap/SyntaxEditorUI),MIT | New project,JS/JSON highlighting and comparison,Swift6.3+; source-inspected only | Track as a candidate. Main product uses tree-sitter; its SourceModelBridge accesses Xcode internals for a separate snapshot tool, not proof that the main runtime uses private frameworks. Not built here |

Installed exact npm versions lang-javascript6.2.5,lang-json6.0.2 and @lezer/highlight1.2.5. Actual Plex source(8068characters) produced1366highlight spans;91399-character JSON produced16805. Single Node parse/highlight runs took about44.3/90.6ms. These are not input latency,WebView/iOS performance or statistical benchmarks. See research/editor-highlight-receipt.json.

Editing,filesystem save,debug execution,source installation and account authorization remain distinct actions. Highlighting grants no host access. Later editor validation covers Chinese IME,undo/redo,keyboards,selections/indentation,accessibility and large documents; do not maintain another syntax colorizer.

## 4. Implementing a Magpie-style desktop

Inspected Magpie's go.mod,index.html,app.css/theme.js,kernel.js and plugin documentation. It uses native Wails windows with HTML/CSS/JS content,wide side navigation/narrow top navigation,settings rows,cards and contributed pages. Its main interface is not entirely native Go controls.

Recommended future direction: Wails shell + one maintained Web component library + CodeMirror,with existing Go services,Core,storage and media proxy retained. Extract control-independent application services from internal/ui before changing the shell. Native SwiftUI remains the iOS baseline candidate; share protocols,tokens,component semantics and template data rather than the whole desktop DOM.

Magpie internal/gui and internal/pluginrt are not public Go SDK imports. Its assets are not a standalone component package; copying app.js transfers maintenance. Reuse Wails/components directly and reference layout,lifecycle and page contracts. An upstream public runtime could be adopted if extracted later. No Magpie application code was copied and no upstream requests were sent.

Cross-UI services need request IDs,cancellation,event subscriptions,account/source scope and explicit errors. Plugin pages use a narrow authorized bridge,without arbitrary filesystem/process/global credentials. Media sessions retain their own lifecycle and are cancelled when their owning interface closes.

## 5. iOS Magpie reality and exclusions

The implementation reuses original provider package files/protocols and MoeJS,not the entire Magpie Go application. Desktop connection to an installed Magpie and the independent iOS host are different paths.

| Item | Current behavior/requirement |
|---|---|
| Package | Folder,zip,tar.gz; package.json and relative modules; Core validates archive paths and rejects symlinks/traversal |
| Limits | 1024files,8MiB/file,32MiB total,512reachable modules,default64MiB JS memory/instance |
| Entry | ./server export→main→root export→index candidates; parsing does not establish complete compatibility |
| JS/TS | Current Core executes JS/ESM and explicitly rejects TS; this is not absence of TS support in MoeJS. The pinned library offers CompileTS type erasure,but rejects enums and other runtime transforms. Currently publish built JS,without source-entry candidates; multiple-candidate loader behavior needs a separate regression |
| Node/npm | node:,bare imports and unbundled dependencies fail explicitly; no automatic downloads or empty substitutes |
| URL import | No remote module loading; include modules in the inspected bundle |
| Bun/CLI/Go plugins | No Bun/subprocess/Go dynamic plugin execution on iOS; desktop internal Go plugin folders cannot run as JS packages |
| Web host APIs | Existing fetch,Request/Response,Headers,URL,Abort and streams are adapters,not a complete browser/Node implementation; validate SDK calls |
| Dynamic code | DisableDynamicCode exists and defaults off; an option is not an enforced global eval ban |
| Dependency analysis | Static scanning explains missing modules,not a complete security proof; runtime resolution enforces the module boundary |
| Login | Client-side per-provider Keychain data; device/poll/callback support follows package capability,without reading desktop accounts |
| Other Magpie extensions | Generic pages,budgets,observers,routing/redaction middleware remain incomplete; magpierouting is a prototype,not original-plugin execution |

Publish capability profiles separating unchanged packages,built bundles,host-adapted packages and exclusions. Network-origin permissions,generic service scopes and declarative pages are proposed work,not fully enforced current guarantees.

## 6. Plugin,theme and template formats

| Category | Authoring/distribution | Host/current state |
|---|---|---|
| Comic source | JavaScript ComicSource,single.js | Existing Core; Venera index.json array |
| Video source | JavaScript VideoSource,single.js | Existing Core;vcvideo/1 |
| Kazumi rule | JSON | Existing rule adapter,not generic JS |
| Magpie provider | JS/built TS,package.json + ESM/assets,zip/tar.gz | Current limited iOS provider host; preserve original packaging |
| Service | JS/built TS,manifest + ESM + settings schema | Draft service contract,not currently loaded; distinct hooks from AI providers |
| Image enhancer | JS orchestration + external inference API + workflow JSON | Draft; model weights do not belong in a32MiB plugin bundle |
| Current iOS theme | UTF-8 JSON | id/name/accent/background/surface/radius/dark/author; only wired views change |
| Next theme version | DTCG JSON tokens compiled to CSS/platform data | Reuse Style Dictionary; draft,not a current-format replacement |
| Simple settings module | Surge-inspired headers + INI,.vcmodule draft | settings-module in the same source;explicit overlays only,no current client executor |
| Layout preset | JSON selecting client-defined templates/module order | Cards,density,visibility; no arbitrary business calls or new native controls |
| Custom plugin page | HTML/CSS/JS or built TS/React/Svelte assets | Future scoped page extension; page-level freedom,not replacement of system/native UI |

Separate tokens,client layout presets and permissioned pages. A theme JSON must not secretly become executable code. CSS cannot directly restyle SwiftUI/MyGo controls or own system authorization/player behavior. Replacing navigation/window lifetime requires a client update or explicit versioned shell extension.

Use standard JSON/ESM and JSON Schema settings. YAML can be an authoring-tool input compiled to JSON,without separate runtime YAML interpreters in each client. Do not invent a generic UI language for the first stage.

## 7. Optional Trakt,TMDB and Bangumi plugins

BangumiClient/TMDBClient are currently native NekularityKit implementations called by SwiftUI/Stores,not installable plugins. Bangumi uses a personal token; TMDB uses a v3 key/v4 read token,which is not a completed user-account login. Trakt has no full existing integration.

| Service | Preferred upstream reuse | Minimum optional capabilities/authentication |
|---|---|---|
| Trakt | [official trakt-api](https://github.com/trakt/trakt-api),MIT,TypeScript/ts-rest/zod contract | Account,history/watchlist,scrobble; public-client OAuth/PKCE or device authorization according to registered app support. Workspace @trakt/api is0.0.0 with TS entry,not an assumed stable npm package directly loadable in MoeJS |
| TMDB | [tmdb-ts](https://github.com/blakejoy/tmdb-ts),MIT,or generated client | First migrate metadata/posters/air dates; user lists/ratings are additional account capabilities. SDK declaresNode>=20,so qualify a browser bundle and actual Core host support |
| Bangumi | [official API/OpenAPI](https://github.com/bangumi/api),v0.yaml synchronized from bangumi/server | Account,subjects,collections,episode progress; preserve personal tokens,User-Agent and anonymous Chinese-search fallback first. OAuth follows actual registration support |

A reproducible [SDK runtime prototype](../prototypes/tmdb-sdk/README.en.md) now exists: the tmdb-ts2.3.0 browser ESM initially failed in actual Core because URLSearchParams was missing. Bundling MIT core-js-pure3.51.0 made it pass without SDK modification or our own standard-library implementation. The53619-byte bundle verified Unicode/special-character TV queries,Bearer headers and JSON via an injected host. This is one endpoint,not real-account,full-SDK,iOS or service-lifecycle acceptance; retain legacy v3 API-key support during migration.

Version capabilities such as account/auth,metadata.search/get,collections,history/progress and optional scrobble. Plugins map provider APIs; Core owns registration,contracts,cancellation/timeouts,lifecycle and event attribution; clients supply credentials,network,persistent queues,display and user choice.

Keep native provider IDs,media kinds,seasons/episodes and provenance instead of title-only merging. Reading pages,episode counts and video seconds are distinct. Synchronization needs event IDs/origin to prevent loops,429/backoff and conflict rules; do not write every playback tick remotely.

Migration order:

1. Define service capabilities/account scope and build minimal upstream/generated adapters. Optional installation must leave local reading/playback functional.
2. Move read-only TMDB metadata first,retaining old Store entry points as adapters and provenance/language/expiry-aware caches.
3. Move Bangumi account,collections/progress; copy credentials to a new namespace,verify and retain old values until success rather than deleting data.
4. Add optional Trakt,then history/scrobble after authentication; account grants and user settings control writes.
5. Feed generic service cards/details into the later UI rewrite; custom service pages are optional extensions.

This iteration creates non-installable manifest drafts,an ESM template and the actual-Core SDK prototype above. It does not replace current clients,authenticate real accounts or write remote history. The template fails explicitly rather than returning invented success.

## 8. Next work and scope

Finish the active transport-lifetime repair,qualify a client-transport bridge to existing MoeJS/webapi instead of duplicate compatibility code,then implement a generic service host and optional catalogue consumer,starting with read-only TMDB migration. Colorization should reuse inference-service job APIs before on-device models. Final Wails-shell/native-iOS-editor integration follows foundation work.

Delivered this iteration: a working publisher,actual Core install-contract validation and CodeMirror highlighting dependency validation. No engine replacement,UI rewrite,model-inference benchmark or new service login occurred. Finding a repository or compiling syntax is not acceptance. Publication destination and service registration conditions are handed off when needed.
