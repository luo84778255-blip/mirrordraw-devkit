# {{name}}

MirrorDraw 桌面客户端插件。

## 开发

```bash
npm install
npm run build      # src/runner.ts -> dist/runner.js（单文件 ES Module）
npm test           # 用 SDK 测试桩运行 runner
npm run validate   # 校验 manifest.json
npm run pack       # 生成 {{slug}}.mdplugin
```

联调：在客户端「插件中心」选择「添加本地开发目录」，指向本目录。修改 `manifest.json` 或 `dist/` 后会自动热重载，所以改完 `src/` 需要重新 `npm run build`。

## 目录

| 路径 | 说明 |
| :--- | :--- |
| `manifest.json` | 插件清单：节点、参数、网络白名单、配置项 |
| `src/runner.ts` | 执行逻辑，默认导出 `defineRunner({ run })` |
| `build.mjs` | esbuild 打包脚本 |
| `test/` | 基于 `@mirrordraw/plugin-sdk/testing` 的测试 |

完整说明见 MirrorDraw 插件开发指南。
