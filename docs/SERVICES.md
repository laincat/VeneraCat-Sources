# 服务插件包说明（Bangumi / TMDB / Trakt）

[English](SERVICES.en.md) | 简体中文

本仓库在统一合集 [catalog/source.json](../catalog/source.json) 中维护三个遵循 VeneraCat Core `service.js` 契约的可安装服务包，许可均为 `LGPL-3.0-or-later`。

- 源码目录：`catalog/packages/service.{bangumi,tmdb,trakt}/`（均含 `service.json` 与自包含单文件 `index.mjs`）
- 构建产物：`build/packages/service.<name>/service.<name>.zip`（由 `node tools/build.mjs` 确定性打包，可被 Core `service.InstallPackage` 直接校验安装）
- 凭据边界：所有 API Key / Access Token / Client ID 均由宿主通过 `secret(key)` 按需注入，仓库不硬编码任何密钥，日志与错误输出均对密钥做脱敏处理。

## 1. 方法与凭据清单

| 服务 ID | 所需 `secret(key)` | 导出方法 (`describe()` / `handle()`) | 上游 API 契约 |
|---|---|---|---|
| `service.bangumi` | `access_token`（`metadata.search`/`metadata.detail` 可匿名，`account.me`/`collection.update`/`episode.update` 必需） | `account.me`、`metadata.search`（保留 `User-Agent` 及旧 `/search/subject/` 兜底）、`metadata.detail`、`collection.get`、`collection.update`、`episode.update` | Bangumi OpenAPI v0 (`api.bgm.tv`) |
| `service.tmdb` | `api_read_token` 或 `api_key`（优先 Bearer `api_read_token`，未配置时回退 v3 `api_key`） | `metadata.search`、`metadata.detail`（电影、剧集、季、集）、`artwork.list`（海报、背景、Logo、剧照） | TMDB API v3 (`api.themoviedb.org/3`) |
| `service.trakt` | `client_id`（全部方法必需）与 `access_token`（`metadata.search` 可选，账号/片单/历史/上报必需） | `account.me`、`metadata.search`、`watchlist.list`、`history.list`、`scrobble.start`、`scrobble.stop` | Trakt API v2 (`api.trakt.tv`) |

未配置所需凭据时，各服务均返回结构化错误 `{ ok: false, error: { code: "MISSING_SECRET", missingSecrets: [...] } }`，不会抛出未捕获异常，也不会回显已配置密钥。

## 2. 声明式设置模块对照

`templates/modules/reader-preferences.vcmodule` 与 `catalog/source.json` 中的 `reader-preferences`（`kind: "settings-module"`）保持一一对应：

- 元信息头：`#!id=reader-preferences`、`#!name=阅读偏好示例`、`#!version=0.1.0`、`#!format=veneracat-module/1-draft`、`#!requires=settings-module.v1`
- 配置节：仅包含 `[Reader]` 声明式键值（`page-gap = 8`、`keep-screen-on = true`），不包含代理、MITM 或可执行脚本。

## 3. 验证范围与限制

三个服务包当前验证级别统一标记为 `fixture-verified`：

- 已通过离线 mock 宿主单测（`node --test tools/services/services.test.mjs`），覆盖全部方法、请求头、错误脱敏与降级路径；
- 已通过相邻 VeneraCat Core 真实 `service.InstallPackageExpecting` + `service.Runtime`（MoeJS）安装、编译、`describe()` 与 `handle()` 契约校验（`node prototypes/catalog-contract/run.mjs`）；
- **尚未进行真实远端账号登录或线上写入验收**，文档与合集元数据中如实标明，不冒充实网验收。
