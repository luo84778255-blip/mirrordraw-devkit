# MirrorDraw Devkit

**MirrorDraw 开发者工具包**：MCP 服务、插件 SDK、插件脚手架与示例，用于让 AI Agent 操控 MirrorDraw 无限 AI 画布，并为桌面客户端开发自定义画布节点插件。

**MirrorDraw developer kit**: an MCP server, plugin SDK, plugin scaffolding CLI and examples. Let AI agents (Claude Desktop, Cursor, Codex) control the MirrorDraw infinite AI canvas, and build custom canvas-node plugins for the desktop app.

关键词 / Keywords: MCP, Model Context Protocol, AI agent, infinite canvas, AI 画布, plugin SDK, 插件, Electron, node-based workflow, 节点式工作流, AIGC, Claude, Cursor, Codex

| 目录 | 内容 |
| :--- | :--- |
| [packages/mcp-server](packages/mcp-server) | MCP 服务 `mirrordraw-mcp`：让 Claude Desktop、Cursor、Codex 等 Agent 操控画布 |
| [packages/plugin-sdk](packages/plugin-sdk) | 插件 SDK `@mirrordraw/plugin-sdk`：类型定义、本地测试桩、校验与打包命令 |
| [packages/create-mirrordraw-plugin](packages/create-mirrordraw-plugin) | 脚手架 `create-mirrordraw-plugin`：一条命令生成带 TypeScript、构建、测试的插件项目 |
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
npm create mirrordraw-plugin my-plugin
cd my-plugin && npm install
npm run build   # src/runner.ts -> dist/runner.js
npm test        # 用 SDK 测试桩运行
npm run pack    # 生成 .mdplugin
```

在客户端「插件中心」选择「添加本地开发目录」即可联调。也可以直接复制 `examples/` 里的示例作为起点。完整说明见 [docs/plugin-developer-guide.md](docs/plugin-developer-guide.md)。

## 本仓库开发

```bash
pnpm install
pnpm run build             # 编译 SDK
pnpm run test              # 脚手架单元测试
pnpm run validate:examples # 校验示例插件
pnpm run check:mcp         # MCP 服务语法检查
```

`packages/mcp-server/index.mjs`、`packages/plugin-sdk/src/manifest.ts`、`examples/` 与 `docs/agent-mcp-integration-guide.md` 由客户端仓库同步生成，请不要直接修改，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[Apache-2.0](LICENSE)
