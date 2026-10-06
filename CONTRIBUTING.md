# 贡献指南

欢迎提交 Issue 和 Pull Request。

## 哪些文件可以直接改

| 路径 | 说明 |
| :--- | :--- |
| `packages/plugin-sdk/src/{index,runner,testing}.ts`、`packages/plugin-sdk/bin/` | 直接改 |
| `docs/plugin-developer-guide.md`、各 `README.md` | 直接改 |
| `packages/mcp-server/index.mjs` | 由客户端仓库同步，改动请通过 Issue 描述需求 |
| `packages/plugin-sdk/src/manifest.ts` | 由客户端类型自动生成，请勿手改 |
| `examples/`、`docs/agent-mcp-integration-guide.md` | 由客户端仓库同步，请勿手改 |

MCP 服务与插件清单契约以客户端实现为准。如果发现文档与客户端行为不一致，请开 Issue 并附上复现步骤。

## 提交前

```bash
pnpm install
pnpm run build
pnpm run validate:examples
pnpm run check:mcp
```

## 提交插件示例

示例插件需要满足：

- `pnpm run validate:examples` 校验无错误、无警告；
- 不含任何密钥、真实服务地址或个人路径；
- `network.allow` 只声明用到的域名或本机端口。

## 版本规则

| 变化 | 版本 |
| :--- | :--- |
| 新增工具或可选字段 | 小版本 |
| 工具改名、字段删除、行为不兼容 | 大版本 |
| 仅修复或文档 | 补丁版本 |
