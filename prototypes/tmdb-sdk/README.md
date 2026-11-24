# TMDB 上游 SDK 复用原型

[English](README.en.md) | 简体中文

这不是可安装的服务插件,也没有接入客户端。它验证`tmdb-ts 2.3.0`能否通过构建产物复用现有Core的模块/HTTP宿主,减少自行维护TMDB请求代码。

## 运行

本目录需要Node/npm;相邻三项目布局中的VeneraCat Core需具备其Go依赖。

```sh
npm install --no-package-lock
npm run build
npm run test:core
```

构建按`package.json`的兼容范围安装依赖(不提交lockfile),生成`build/index.mjs`及依赖许可文本。运行时是浏览器目标ESM,不是把Node/Bun放入iOS。测试把该产物交给真实Core的`magpieplugin.NewBundle/Load/NewInstance/UseHost/Call`,通过注入宿主验证GET路径、中文及特殊字符查询、语言、Bearer头和返回JSON;不连接真实TMDB。

## 已发现与解决

不带polyfill时,真实Core报`ReferenceError: URLSearchParams is not defined`。打包MIT许可的`core-js-pure 3.51.0`标准实现后同一路径通过;没有修改tmdb-ts,也没有自己写URLSearchParams。最初的单文件产物53619字节,回执见`../../research/tmdb-sdk-receipt.json`。

只验证了一个电视剧搜索接口。详情、账户、分页、错误、取消、iOS运行以及整个SDK仍未完整验收。此原型使用固定的假token,不读取或保存凭据。生产服务宿主必须改为受限账号/凭据桥。

SDK主要使用Bearer访问token。当前iOS同时接受v3 API key与v4读token;迁移时必须保留v3兼容适配,不能因为SDK跑通就删掉旧能力。新的service ABI、按需安装和客户端展示仍需实现。
