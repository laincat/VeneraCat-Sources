# VeneraCat Sources

[English](README.en.md) | 简体中文

**一个源就是一个多端统一的内容合集。** 插件、扩展、主题、简单模块和服务都收录在同一合集里;条目声明支持的平台与所需宿主能力。订阅是用户跟踪这个合集的关系。已移除最初按Nekularity、Nekophage、Core生成独立目录的方案。

当前为本地原型,没有远程仓库、发布网址或客户端自动订阅接入。

## 资料

- [源、合集、条目、订阅与模块的明确边界](docs/SOURCE-BOUNDARY.md)
- [三项目现状、上游依赖、Magpie、编辑器与主题方案](docs/ECOSYSTEM.md)
- [漫画 AI 自动上色方案](docs/COLORIZATION.md)
- [GitHub 检索与源码证据](research/github-2026-11-04.json)
- [TMDB上游SDK与标准polyfill的真实Core运行原型](prototypes/tmdb-sdk/README.md)

## 目录

```text
catalog/source.json       一个源合集,按内容类型登记,条目带supports
catalog/packages/         本仓维护的一方发布源码(如Plex)
plans/                    合集内尚不可安装的服务/上色设计
prototypes/               可重复的依赖复用与目录契约验证
templates/                主题、服务、布局、简单配置模块模板
tools/build.mjs           统一源发布构建器
research/                 检索和验证记录
docs/                     中英双语边界、方案和迁移说明
build/source.json         所有端读取的同一份合集
build/packages/           每个可发布条目仅一份内容
build/compat/             由同一合集生成的旧视频格式适配,不按平台分开
```

当前官方合集的ID为`veneracat.official`。内容的身份由`source.id + entry.id`确定,下载地址可以变化;平台是兼容声明,不是命名空间。未来新增来源,每个来源维护自己的合集,而不是复制一套iOS源和桌面源。

Plex发布源码已迁入本仓`catalog/packages/plex/plex.js`,构建器直接读取本仓文件,不再依赖相邻仓库的Git历史。

## 构建与验证

构建仅需Node.js20+;零网络、无需Git或相邻仓库,也无需npm安装。构建先在临时目录校验再原子替换`build/`:

```sh
node tools/build.mjs
node prototypes/catalog-contract/run.mjs
```

第二条还需要相邻VeneraCat Core及其Go依赖。它核对一个合集、所有实际条目哈希、平台/能力声明,确认不存在按客户端划分的发布目录,并通过真实Core解析旧视频适配及安装Plex。

其它可选原型:`node prototypes/moejs-webapi/run.mjs`;在`prototypes/editor-highlight`执行`npm install --no-package-lock`与`node check.mjs`;TMDB原型按其README运行。这些不是客户端生产代码。

## 当前内容与兼容性

合集统一列出Plex、主题示例、Surge风格的阅读偏好模块示例,以及Trakt/TMDB/Bangumi和上色设计。实际内容、原型、计划分别标记;计划没有可安装artifact。

- `source.json`是新的统一草案协议,当前客户端尚无总目录消费者。
- `compat/vcvideo.json`适配现有视频索引格式,来自同一合集,不独立维护;待客户端支持统一合集安装视频源后再退役。旧客户端暂不能用一个新合集入口自动安装所有种类。
- 当前iOS可手动安装legacy主题JSON;桌面全局主题与新模块执行器尚未实现。
- `.vcmodule`示例只借鉴Surge元信息头与INI配置覆盖形式,不宣称兼容Surge的代理、MITM或脚本行为。
- 本轮没有真实Plex服务器、服务账号登录、模型推理或新客户端界面验收。

## 发布与维护

所有端共享源ID、条目ID、版本和内容,按`supports.platforms`与`requiresCapabilities`判断可用性;支持声明不等于真机验证。订阅不会自动执行所有条目,安装/启用/权限授权分别处理。

当前只本地构建,不填写假发布网址。先保留现有索引的正文哈希含义,新压缩包另有整包哈希;哈希证明完整性,不自动证明发布者身份。第三方代码和模型按各自许可证处理,本仓库LGPL-3.0-or-later不替它们重新授权。
