# mirrordraw-mcp

让 Claude Desktop、Cursor、Codex 等支持 MCP 的本机 Agent 直接操控 MirrorDraw 桌面客户端里的画布。

服务通过 stdio 与 Agent 通信，再转发给本机 `127.0.0.1` 上 MirrorDraw 客户端的内部服务，所以**客户端必须已启动并打开了画布**。零第三方依赖，Node.js >= 18。

## 配置

```json
{
  "mcpServers": {
    "mirrordraw": {
      "command": "npx",
      "args": ["-y", "mirrordraw-mcp"]
    }
  }
}
```

也可以在客户端顶部点 **Agent**，复制客户端生成的配置，效果相同。

## 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `MIRRORDRAW_PORT` | `49152` | 客户端本地服务端口 |
| `MIRRORDRAW_TOKEN` | 自动读取 | 本地鉴权 token；未设置时从客户端用户数据目录下的 `agent_auth_token.json` 读取 |

## 工具与操作手册

见 [Agent 接入指南](../../docs/agent-mcp-integration-guide.md)。Agent 启动后会通过 `tools/list` 自动发现全部 `canvas_*` 工具。

## 版本兼容

MCP 工具集随客户端版本演进。新增工具在旧版客户端上会返回错误，请升级客户端到最新版。
