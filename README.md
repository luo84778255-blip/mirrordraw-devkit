# MirrorDraw Devkit

MirrorDraw 桌面客户端的开发者工具包。MirrorDraw is an infinite AI canvas; this repo contains what you need to extend it.

| 目录 | 内容 |
| :--- | :--- |
| [packages/mcp-server](packages/mcp-server) | MCP 服务 `mirrordraw-mcp`：让 Claude Desktop、Cursor、Codex 等 Agent 操控画布 |
| [packages/plugin-sdk](packages/plugin-sdk) | 插件 SDK `@mirrordraw/plugin-sdk`：类型定义、本地测试桩、校验与打包命令 |
| [examples](examples) | 官方示例插件 |
| [docs](docs) | Agent 接入指南、插件开发指南 |

## 给 Agent 接入画布

客户端必须已启动并打开画布。在 Agent 的 MCP 配置中加入：

```json
{
  "mcpServers": {
    "mirrordraw": { "command": "npx", "args": ["-y", "mirrordraw-mcp"] }
  }
}
```

工具列表与操作手册见 [docs/agent-mcp-integration-guide.md](docs/agent-mcp-integration-guide.md)。

## 开发画布插件

```bash
cp -r examples/sample-plugin-grayscale my-plugin
npx @mirrordraw/plugin-sdk validate my-plugin
npx @mirrordraw/plugin-sdk pack my-plugin -o my-plugin.mdplugin
```

在客户端「插件中心」选择「添加本地开发目录」即可联调。完整说明见 [docs/plugin-developer-guide.md](docs/plugin-developer-guide.md)。

## 本仓库开发

```bash
pnpm install
pnpm run build             # 编译 SDK
pnpm run validate:examples # 校验示例插件
pnpm run check:mcp         # MCP 服务语法检查
```

`packages/mcp-server/index.mjs`、`packages/plugin-sdk/src/manifest.ts`、`examples/` 与 `docs/agent-mcp-integration-guide.md` 由客户端仓库同步生成，请不要直接修改，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
