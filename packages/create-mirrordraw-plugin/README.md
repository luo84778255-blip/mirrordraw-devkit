# create-mirrordraw-plugin

生成 MirrorDraw 桌面客户端插件项目。

```bash
npm create mirrordraw-plugin my-plugin
npm create mirrordraw-plugin my-plugin -- --id com.example.my-plugin --name "我的插件"
```

生成的项目包含 `manifest.json`、`src/runner.ts`、esbuild 构建脚本、基于 `@mirrordraw/plugin-sdk/testing` 的测试和 `.gitignore`。

| 参数 | 说明 |
| :--- | :--- |
| `<目录>` | 项目目录，必须为空或不存在 |
| `--id` | 插件 ID，形如 `com.developer.plugin`；默认 `com.example.<目录名>` |
| `--name` | 插件显示名称；默认取目录名 |

完整开发说明见 [插件开发指南](../../docs/plugin-developer-guide.md)。
