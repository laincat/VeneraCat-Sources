# 三项目生态、依赖与插件方案

[English](ECOSYSTEM.en.md) | 简体中文

调查日期:2026-11-04。源的最新边界以[统一源合集](SOURCE-BOUNDARY.md)为准:所有端共享一个源的同一合集,按内容类型分类,支持端写在条目中。依据本地实际代码、依赖文件、发布回执以及 GitHub API/README/许可证/源码检索。GitHub 元数据和文件 blob 记录见 [research](../research/github-2026-11-04.json)。候选的 README 宣称与本项目实测严格分开。用户已要求先完成底层、架构和基建,各端 UI/UX 随后整体重构重写;优先直接依赖上游,避免复制一套长期自行维护。

## 1. 当前状态

| 项目 | 实际实现/产物 | 主要待收束内容 |
|---|---|---|
| Nekularity | SwiftUI + NekularityKit + gomobile Core;已发布0.3.4/16,Core功能pin3be57b5;播放器已直接依赖AetherEngine 7.53.1;436/81历史Kit回归及定向模拟器证据分别记录 | URLSession失败/取消生命周期正在Mac复现与修复;通用服务插件宿主、扩展能力注册与统一源目录未实现;真机/后台/PiP等仍按原交接 |
| Nekophage | Go + MyGo 0.7.3;阅读器/播放器WebView;HLS.js 1.7.4;Core3be57b5;当前交付包0.2.7/0db2ead | bfc3484的图片转换失败回退已过Windows完整工程检查与Mac精确文件定向回归,尚未重新打包;服务/主题目录消费者、后续界面新壳仍待实现 |
| VeneraCat Core | Go1.27.1模块、MoeJS、漫画/视频/Kazumi、AI标准协议与Magpie供应商宿主、订阅、备份;公开main c0f0dfa,两端功能pin仍3be57b5 | 通用service/image-enhancer接口、插件能力协商与启停生命周期、API规范生成工具链;引擎替换尚未做产品资格验证 |
| VeneraCat Sources | 一个跨端源合集,按kind分类,条目声明supports;有确定性构建、内容/模块示例与真实Core旧格式契约验证。初版按三项目拆目录的方案已撤销 | 远程发布目的地、客户端目录接入、服务包从设计到实现;当前不存在自动安装新服务的能力 |

0.3.4跨进程续播证据来自Orca Worker:同源搜索/分集路径,PID2020→2099,start7秒;不覆盖“继续观看”直接入口或真机。Mac桌面回归是c545212加0db受验文件再加bfc两文件,不能冒充完整bfc文件树。当前源码和交付包须分别引用。

现有ARCHITECTURE/AI-CORE-BOUNDARY部分文字是早期设计,不能据其“未编译”“标准API尚未实现”等旧句判断现状。标准Chat/Responses/Messages路径已实现并有独立验证,但不等于所有工具/多模态互转、路由或中间件已经实现。

## 2. 重要部件与直接复用

| 部件 | 已用/建议直接依赖 | 决策与维护边界 |
|---|---|---|
| JS引擎 | [MoeJS](https://github.com/MoeForge/moejs),Apache-2.0;当前伪版本0a0ed36 | 保留现有生产pin,不自写引擎;升级由源脚本、Magpie模块、取消与资源契约证明 |
| 新引擎候选 | [go-quickjs](https://github.com/go-quickjs/go-quickjs),MIT | 2026新项目,声称纯Go/ES模块/Promise及可选JIT;可以引用库,但未跑本项目源集或gomobile/iOS验证。iOS候选只能按解释器路径评估,不能以桌面JIT跑分作依据 |
| 其他引擎 | [goja](https://github.com/dop251/goja)、[Sobek](https://github.com/grafana/sobek),MIT | 可直接依赖的维护中项目;不是当前MoeJS的API替身,模块/宿主适配仍要验证,不为成熟度标签贸然重写 |
| 新引擎候选 | [slowjs](https://github.com/liustack/slowjs),MIT/BSD/ICU等分文件许可 | 最新README已支持linux/darwin amd64/arm64和windows/amd64,纠正旧调查的“两平台”说法;未列iOS。依赖Go汇编/运行时细节,升级成本需要计入 |
| iOS媒体 | [AetherEngine](https://github.com/superuser404notfound/AetherEngine),当前7.53.1 | 已直接引用,继续复用而非重写解码器。当前上游LICENSE为LGPL-3.0加App Store/DRM例外;发行仍核所用版本与依赖许可,不把新例外自动套到所有旧制品 |
| Apple媒体备选 | [MPVKit](https://github.com/mpvkit/MPVKit),LGPL-3.0 | 可引用库,目前没有必要同时引入第二套大型媒体栈 |
| 桌面媒体 | [HLS.js](https://github.com/video-dev/hls.js),Apache-2.0,当前1.7.4 | 保留固定版本内置资源;原生HLS/WebView解码和自有媒体代理各有职责 |
| 桌面壳 | [MyGo](https://github.com/egoist/mygo),MIT | 当前已用;Go原生自绘控件,与Magpie主内容Web UI不是同一实现 |
| Magpie风格新壳 | [Wails](https://github.com/wailsapp/wails),MIT | Magpie当前直接用v3.0.0-beta.24。建议后续做壳适配验证再迁移;beta平台行为和构建条件不能按稳定版假定 |
| Web组件 | [Mantine](https://github.com/mantinedev/mantine),MIT | 可作为React页面组件依赖,避免自维护菜单/表单/弹层;并非Magpie现用框架。不同时叠加多套UI库 |
| 主题构建 | [Style Dictionary](https://github.com/style-dictionary/style-dictionary),Apache-2.0 | 采用DTCG设计token作为作者层,构建时生成CSS和Swift/Go可消费数据;客户端不运行Node构建工具 |
| iOS图片管线候选 | [Nuke](https://github.com/kean/Nuke),MIT | 可复用解码/缓存/合并请求,但必须注入现有分区网络及源转换,缓存键含账号/源/配置版本。不能直接用默认下载器替换已经验证的隔离规则 |
| TS构建 | [esbuild](https://github.com/evanw/esbuild),MIT | 作者写TS,发行包构建为浏览器目标ESM;不是让iOS安装Node/Bun/npm |
| API客户端生成 | [openapi-ts](https://github.com/hey-api/hey-api),MIT | 优先依官方OpenAPI生成窄客户端,减少手工追接口;生成后的fetch/Request/Headers能力仍需实测 |
| HTML/XPath、SQLite | cascadia/htmlquery/xpath、modernc.org/sqlite | 当前已经依赖上游;无依据不再重写解析器、数据库或另加一套同类库 |
| 网络/安全存储 | URLSession、Go net/http、系统Keychain/凭据API | 通用机制用系统能力;本项目维护账号分区、请求归属、权限与进度语义 |

当前pin中的MoeJS还直接提供`webapi`和`CompileTS`,这比继续维护手写URL/Headers/Streams更值得优先复用。本轮在该精确依赖上实际运行了URLSearchParams、可变URL查询、Request/Headers、Response.json、AbortController、无http.Client时拒绝联网,以及TS类型擦除与枚举拒绝,八项通过。回执见[moejs-webapi-receipt.json](../research/moejs-webapi-receipt.json)。这只是库级验证,Core现有宿主尚未迁移。迁移时用受限http.RoundTripper桥接客户端注入的传输,不得改用默认网络客户端,还要保留真实连接取消、背压与首段流式回归。已发布Core可先用包内core-js-pure过渡,后续优先消除重复兼容代码。

检索包括按更新时间检索的新项目与成熟项目对照,并继续检查README、包入口和许可。GitHub stars只作背景,不作为可用性证明。不存在“所有npm包都能在MoeJS中运行”的结论。

## 3. 带高亮的JS编辑器

| 方案 | 适用端/现状 | 推荐方式 |
|---|---|---|
| [Runestone](https://github.com/simonbs/Runestone),MIT | 原生iOS文本编辑器,tree-sitter增量解析,支持高亮、折叠、查找等;Package声明iOS14+ | iOS优先候选;薄UIViewRepresentable适配,按需带JS/JSON语法。Catalyst不是已完成的跨桌面方案 |
| [CodeMirror 6](https://codemirror.net/) | WebView2/WKWebView/Web;GitHub dev仓库迁往作者代码站,不是停更 | 桌面首选、iOS共享实现备选;通过npm直接依赖语言/编辑器扩展,本地打包离线加载 |
| [Monaco](https://github.com/microsoft/monaco-editor),MIT | 桌面较完整语言服务;官方FAQ明确不支持移动浏览器/移动Web框架 | 仅桌面高级编辑器备选,不要用它统一iOS;需要处理Worker URL、离线资源和体积 |
| [CodeEditorView](https://github.com/mchakravarty/CodeEditorView),Apache-2.0 | SwiftUI/TextKit2,iOS/macOS/visionOS;部分补全/信息能力仅macOS | Apple端备选,不能替代Windows编辑器 |
| [SyntaxEditorUI](https://github.com/lynnswap/SyntaxEditorUI),MIT | 新项目,JS/JSON高亮和diff,Swift6.3+;本轮仅源码核查 | 保留候选。主产品用tree-sitter;仓库中访问Xcode内部框架的SourceModelBridge属于单独取样工具,不能仅凭该文件宣称主产品使用私有框架。尚未在本项目编译运行 |

本轮通过npm固定安装`@codemirror/lang-javascript 6.2.5`、`lang-json 6.0.2`、`@lezer/highlight 1.2.5`,用真实Plex脚本8068字符得到1366个高亮区段,91399字符JSON得到16805个区段。单次Node解析/高亮约44.3/90.6ms;这不是输入延迟、WebView或iOS性能,也不是统计基准。原始记录见research/editor-highlight-receipt.json。

编辑器只编辑:文件读写、撤销保存、调试运行、源安装和账号授权是不同动作。语法高亮不授予宿主权限。后续测试重点是中文IME、撤销/重做、软键盘、选择/缩进、无障碍和大文件,不重写语法着色器。

## 4. 桌面按Magpie设计的实现路径

实读Magpie的go.mod、index.html、app.css/theme.js、kernel.js及插件文档:它是Wails原生窗口加HTML/CSS/JS主内容,窄窗顶部导航/宽窗侧栏,设置、行式表单、卡片和可插拔页面;并不是主界面全部由Go原生控件绘制。

建议的后续方案是Wails外壳 + 一套成熟Web组件 + CodeMirror,复用现有Go服务、Core、存储和媒体代理。先把internal/ui中的业务操作收束成与控件无关的应用服务,再接新壳,不把UI换壳变成业务逻辑搬家。iOS保留原生SwiftUI作为候选基线,共享协议、token、组件语义和模板数据,不强行共享整个桌面DOM。

Magpie的`internal/gui`、`internal/pluginrt`不是可供外部Go模块直接导入的公共SDK。它的网页资源也不是一个独立组件包;复制整份app.js会接管其后续维护。优先直接用Wails/组件库,参考布局、生命周期和页面协议。若未来上游抽出公共运行时再依赖它;本轮没有复制Magpie应用代码或提交上游请求。

跨界面服务应提供明确的请求ID、取消、事件订阅、账号/源范围和错误结果。插件页只能经窄桥调用获得授权的服务,不能拿到任意文件系统、进程执行或全局凭据。Web媒体代理保持自己的会话生命周期,界面销毁须取消其资源。

## 5. iOS Magpie现状与排除规则

现在复用的是原供应商包的文件/协议和MoeJS引擎,不是链接完整Magpie Go应用。桌面首期连接用户已安装Magpie,与iOS独立宿主是两条路径。

| 内容 | 当前情况/要求 |
|---|---|
| 包 | 文件夹、zip、tar.gz;package.json + 包内相对模块;Core校验解包路径,不接受符号链接/目录穿越 |
| 限额 | 1024文件、单文件8MiB、总32MiB、可达模块512;默认每实例JS内存64MiB |
| 入口 | `./server` export → main → 根export → index候选;解析入口不是兼容全包的证明 |
| JS/TS | 当前Core加载器运行JS/ESM、显式拒绝TS;不是MoeJS没有TS能力。同一依赖已有CompileTS类型擦除,不支持需要运行时代码生成的枚举等。当前TS作者仍须先构建JS发行包,不要把源码候选混入发行入口;当前loader对多个入口候选的处理还应做独立兼容回归 |
| Node/npm | node:与裸模块、未打包npm依赖明确失败;不是自动下载、不是空模块替身 |
| URL import | 不远程拉取模块,必须打包进受检包 |
| Bun/CLI/Go插件 | 不在iOS启动Bun/子进程,不装Go动态插件,不支持原桌面内部Go插件目录直接执行 |
| Web宿主API | 已有fetch、Request/Response、Headers、URL、Abort与流式适配;不是完整浏览器/Node标准库,SDK需按实际调用验证 |
| 动态代码 | 存在DisableDynamicCode选项,默认未启用;不能把“有开关”描述成当前已全局禁用eval |
| 静态依赖扫描 | 帮助解释缺失依赖,不是完整安全证明;运行时Resolver才是模块加载边界 |
| 登录 | 凭据客户端分provider保存至Keychain,设备码/轮询/回调按插件能力;不读取宿主桌面账号 |
| 其他Magpie扩展 | 通用页面、预算、观察器、路由/脱敏中间件尚未整体接入;现有magpierouting是原型,不等同原插件已运行 |

建议发布明确的能力档案和兼容清单,区分“原包可运行”“预构建后可运行”“需要宿主适配”“当前排除”。网络origin白名单、统一service权限和声明式页面是新设计,不能说当前已有完整执行保障。

## 6. 插件、主题与模板格式

| 类别 | 作者语言/发行格式 | 宿主与当前状态 |
|---|---|---|
| 漫画源 | JavaScript,ComicSource;单.js | 现有Core运行;订阅为Venera index.json数组 |
| 视频源 | JavaScript,VideoSource;单.js | 现有Core运行;vcvideo/1索引 |
| Kazumi规则 | JSON | 现有规则适配器;不是通用JS插件 |
| Magpie供应商 | JS/构建后的TS;package.json + ESM资源,zip/tar.gz | 当前iOS受限供应商宿主;保留原包结构,不改成自造供应商协议 |
| 服务插件 | JS/构建后TS;元数据清单 + ESM + 设置schema | 新的service能力契约草案,当前客户端未加载;与AI供应商不是同一种hook |
| 图片增强 | JS编排 + 外部推理API + 工作流JSON | 新image-enhancer草案;模型权重不塞入32MiB插件包 |
| 当前iOS主题 | UTF-8 JSON | id/name/accent/background/surface/radius/dark/author;只有接入这些字段的界面会变化 |
| 主题下一版 | DTCG token JSON,必要时构建生成CSS/平台数据 | 复用Style Dictionary;草案,不兼容冒充当前JSON |
| 简单配置模块 | Surge风格元信息头 + INI分节,.vcmodule草案 | 同一合集中的settings-module;仅明确设置覆盖,当前没有客户端执行器 |
| 布局预设 | JSON选择客户端提供的布局模板/模块顺序 | 可改卡片顺序、密度、可见模块;不引入任意业务调用或新的原生控件 |
| 插件自定义页面 | HTML/CSS/JS,或TS/React/Svelte构建后的静态资源 | 后续受限页面扩展;可高度自定义页内布局,不替换整个原生系统界面 |

主题应分为:颜色/字号/间距/圆角等token;客户端定义的布局预设;有权限声明的页面扩展。不要让一个“主题JSON”暗中变成可执行插件。CSS不能直接改SwiftUI或MyGo原生控件;系统授权界面和原生播放器能力也不能由主题接管。完全替换主导航/窗口生命周期属于客户端或明确版本化的shell扩展,不承诺换个主题就能做到。

模板用标准JSON/ESM,JSON Schema用于设置声明。可支持YAML作为作者工具的输入,发布时统一生成JSON;不在每个客户端维护一套YAML模板解释器。首期不用再造一门通用UI语言。

## 7. Trakt、TMDB、Bangumi按需插件化

当前BangumiClient/TMDBClient直接在NekularityKit中,并由SwiftUI页面/Store调用;它们并未变成可安装插件。Bangumi使用个人访问token,TMDB使用v3 key或v4读token;后者不能当作已经完成用户账号登录。Trakt尚无完整现有实现。

| 服务 | 优先复用 | 最小可选能力与登录路径 |
|---|---|---|
| Trakt | [官方trakt-api](https://github.com/trakt/trakt-api),MIT,TypeScript/ts-rest/zod契约 | 账号、历史/待看、scrobble;依注册应用支持情况采用公开客户端OAuth/PKCE或设备码。官方workspace的@trakt/api版本为0.0.0、入口是TS,不能假称有稳定可直接装入MoeJS的npm包 |
| TMDB | [tmdb-ts](https://github.com/blakejoy/tmdb-ts),MIT,或规范生成客户端 | 先迁移剧集资料/海报/播出时间;用户收藏/评分/列表作为额外账号能力。该SDK声明Node>=20,必须验证浏览器目标构建及Core宿主能力后再采用 |
| Bangumi | [官方API/OpenAPI](https://github.com/bangumi/api);v0.yaml来自bangumi/server | 账号、条目、收藏/在看、章节/集进度;先保留个人token与User-Agent、中文匿名搜索回退;OAuth另按实际注册条件接入 |

本轮增加了可复现的[SDK运行原型](../prototypes/tmdb-sdk/README.md):tmdb-ts2.3.0浏览器ESM最初在真实Core中因URLSearchParams缺失失败;直接打包core-js-pure3.51.0的MIT标准实现后通过,无需修改SDK或自写标准库。单文件53619字节,假宿主验证了带中文/特殊字符的电视剧查询、Bearer头和JSON结果。仅一个接口,不代表真实账号、完整SDK、iOS或服务插件生命周期通过;现有v3 API key兼容仍需保留。

插件对外提供account/auth、metadata.search/get、collections、history/progress、可选scrobble等有版本的能力。插件负责平台接口映射;Core负责能力注册、输入输出、取消/超时、启停与事件归属;客户端负责凭据、网络、持久队列、展示和用户选择。

共同数据模型保留provider原生ID、媒体种类、季/集和来源,不以标题相同自动合并。阅读页数、动画集数、视频秒数分开记录;同步携带事件ID和来源以防回环,处理429/重试与冲突,不把每个播放tick直接写到服务。

迁移顺序:

1. 固定service能力接口与账号范围,构建上游规范/SDK的最小适配包;按需启用,无插件时本地阅读/播放照常工作。
2. TMDB只读metadata先替换现有实现,保留旧Store入口作为兼容外观;缓存有来源、语言和失效规则。
3. Bangumi账号/收藏/进度迁移;凭据先复制到新命名空间并验证,旧值保留到成功确认,不破坏既有用户资料。
4. Trakt可选安装,完成账号流程后再接历史与scrobble;写入能力由账号和用户设置决定。
5. 客户端改为通用服务卡片/详情模板,UI重写时消费同一接口;服务页面自定义是后续可选能力。

本轮已落地不可安装的manifest草案、ESM模板和上述真实Core SDK原型,没有替换客户端实现、登录真实账号或执行远端记录写入。模板错误不会伪装为成功。

## 8. 下一步与投入边界

先结束正在进行的传输生命周期修复,再以现有MoeJS/webapi替代重复兼容代码并验证平台传输桥,然后实现通用服务宿主和可选内容目录消费者,以TMDB只读迁移验证契约。上色先接现成推理服务的任务API,再考虑端侧模型。UI重写前再定Wails新壳与iOS原生编辑器的最终集成。

本轮已产生可运行的源目录构建器、真实Core安装契约验证和CodeMirror高亮依赖验证。未做引擎替换、UI重写、模型推理跑分或新服务真实登录;这些不能因检索到仓库或通过语法构建而计为完成。公开发布目的地和服务账号注册条件在需要时单独交接。
