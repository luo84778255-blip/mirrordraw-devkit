# MirrorDraw 插件开发指南

插件给桌面客户端的**本地画布**增加自定义处理节点，例如图像滤镜、调用自建推理服务、对接 ComfyUI / Ollama。

插件不提供界面代码：你在 `manifest.json` 里声明参数表，客户端用原生控件渲染节点；你只写一个 `runner`，接收输入和参数，返回结果。

> 适用客户端版本：1.80.0 及以上（`minAppVersion`）。插件面向桌面端的**本地画布**。插件缺失或被停用时，节点会显示为占位卡片，连线和历史产物保留。

---

## 1. 快速开始

```bash
# 1. 生成项目（带 TypeScript、esbuild 构建、测试）
npm create mirrordraw-plugin my-plugin -- --id com.example.my-plugin --name "我的插件"
cd my-plugin && npm install

# 2. 修改 manifest.json 中的节点和参数，编写 src/runner.ts

# 3. 构建、测试、校验、打包
npm run build      # src/runner.ts -> dist/runner.js
npm test
npm run validate
npm run pack       # 生成 my-plugin.mdplugin
```

`--id` 和 `--name` 可以省略，默认分别取 `com.example.<目录名>` 和目录名。不想用 TypeScript 时，也可以直接复制 `examples/sample-plugin-grayscale`，用 `npx @mirrordraw/plugin-sdk validate` 和 `pack` 处理。

在客户端侧边栏的「插件中心」：

- **添加本地开发目录**：直接关联你的插件目录，修改 `manifest.json` 或 `dist/` 后自动热重载，适合开发调试。
- **安装本地插件**：选择 `.mdplugin`（或 `.zip`）包。本地包是**未签名**插件，请只安装你信任的来源。

安装后，在画布侧边栏的「插件节点」分组或连线菜单里即可创建节点。

---

## 2. 插件包结构

```
my-plugin/
├── manifest.json     必需
├── dist/runner.js    必需：单文件 ES Module，不能有外部 import
├── icon.png          可选
└── README.md         可选
```

安装限制：解压后总大小 ≤ 100MB，文件数 ≤ 500；包内不允许绝对路径或 `..` 路径。

---

## 3. manifest.json

```json
{
  "manifestVersion": 1,
  "id": "com.example.relight",
  "name": "肖像打光",
  "version": "1.0.0",
  "minAppVersion": "1.80.0",
  "author": "Example Studio",
  "description": "基于深度估计的人像重打光",
  "runner": "dist/runner.js",
  "network": { "allow": ["relight.example.com", "http://127.0.0.1:8188"] },
  "configSchema": [
    { "key": "endpoint", "label": "服务地址", "type": "text", "default": "https://relight.example.com" },
    { "key": "apiKey", "label": "API Key", "type": "password", "secret": true, "required": true }
  ],
  "nodes": [
    {
      "type": "relight",
      "title": "肖像打光",
      "category": "图像处理",
      "defaultSize": { "width": 520, "height": 420 },
      "inputs": [
        { "kind": "image", "min": 1, "max": 1 },
        { "kind": "text", "min": 0, "max": 1 }
      ],
      "output": { "kind": "image" },
      "timeoutSec": 600,
      "params": [
        { "key": "intensity", "label": "强度", "type": "slider", "min": 0, "max": 100, "step": 1, "default": 60 }
      ]
    }
  ]
}
```

### 顶层字段

| 字段 | 说明 |
| :--- | :--- |
| `manifestVersion` | 固定为 `1` |
| `id` | 小写命名空间标识，匹配 `^[a-z0-9]+(\.[a-z0-9-]+){2,}$`，如 `com.example.relight` |
| `version` | 语义化版本，如 `1.0.0` |
| `minAppVersion` | 可选，要求的最低客户端版本 |
| `runner` | 执行脚本路径，通常是 `dist/runner.js` |
| `network.allow` | 网络白名单，见第 5 节；空数组表示不能联网 |
| `configSchema` | 插件级配置（服务地址、密钥），在插件设置页填写 |
| `nodes` | 至少声明一个节点 |

### 节点字段

| 字段 | 说明 |
| :--- | :--- |
| `type` | 节点类型标识，同一插件内唯一 |
| `title` / `category` | 侧边栏显示名与分组 |
| `defaultSize` | 节点默认宽高 |
| `inputs[].kind` | `image` / `video` / `audio` / `text` / `model3d`，同一 kind 只出现一次；`min` / `max` 限制连线数量 |
| `output.kind` | `image` / `video` / `audio` / `text`，每个节点只有一种输出 |
| `timeoutSec` | 超时秒数，默认 300，请勿超过 1800；超时会强制终止插件进程 |
| `params` | 节点参数表 |

节点固定只有一个 `input` 连接点和一个 `output` 连接点，**不能自定义连接点**。

### 参数控件

| `type` | 说明 | 可用字段 |
| :--- | :--- | :--- |
| `text` / `textarea` | 单行 / 多行文本 | `default` |
| `number` | 数字输入 | `min` `max` `step` `default` |
| `slider` | 滑块 | `min` `max` `step` `default` |
| `select` | 下拉 | `options`：`{ "label", "value" }` 数组，`default` |
| `switch` | 开关 | `default`（布尔值） |

`params[].key` 须匹配 `^[a-zA-Z][a-zA-Z0-9]{0,31}$`，节点内唯一。

### configSchema

`type` 可为 `text` / `password` / `number` / `switch`。设置 `"secret": true` 的字段会用系统安全存储加密保存，设置页只显示“已设置 / 未设置”，明文只在任务启动时传给你的 runner。

---

## 4. Runner

`runner` 是一个 ES Module，默认导出带 `run` 方法的对象：

```ts
import { defineRunner } from "@mirrordraw/plugin-sdk";

export default defineRunner({
  async run(ctx) {
    const image = ctx.inputs.media.find((m) => m.kind === "image");
    if (!image) throw new Error("请连接一张图片");

    ctx.progress(20, "上传原图");
    const form = new FormData();
    form.append("image", new Blob([image.bytes], { type: image.mimeType }), image.fileName);
    form.append("intensity", String(ctx.params.intensity));

    const res = await fetch(`${ctx.config.endpoint}/v1/relight`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.config.apiKey}` },
      body: form,
      signal: ctx.signal,
    });
    if (!res.ok) throw new Error(`服务返回 ${res.status}`);

    return [{ kind: "image", bytes: await res.arrayBuffer(), mimeType: "image/png", fileName: "relight.png" }];
  },
});
```

脚手架生成的项目已经配好构建：`npm run build` 用 esbuild 把 `src/runner.ts` 打成**单文件 ES Module** 输出到 `dist/runner.js`。手动搭建时请自行用 esbuild / Vite 达到同样的效果。示例插件直接提供的是 JavaScript。

### ctx

| 字段 | 说明 |
| :--- | :--- |
| `nodeType` | 当前运行的节点类型 |
| `params` | 参数值，键为 `params[].key` |
| `config` | `configSchema` 的值，含已解密的 secret |
| `inputs.media` | 上游素材，每项含 `kind`、`bytes`（ArrayBuffer）、`mimeType`、`fileName`、`sourceNodeId` |
| `inputs.texts` | 上游文本，每项含 `text`、`sourceNodeId` |
| `signal` | 用户取消任务时触发 abort，请传给 `fetch` 并在循环中检查 |
| `progress(percent, message?)` | 上报进度（0–100）与说明 |
| `checkpoint(externalRef)` | 记录外部任务 ID，预留接口，见下文 |

### 返回值

`run` 返回一个结果或结果数组：

| 形式 | 说明 |
| :--- | :--- |
| `{ kind: "image" \| "video" \| "audio", bytes, mimeType?, fileName? }` | 二进制结果，客户端落盘为本地资产 |
| `{ kind: "image" \| "video" \| "audio", url }` | `http(s)` 地址，由客户端下载并落盘 |
| `{ kind: "text", text }` | 文本结果 |

抛出异常即任务失败，异常消息会显示在节点上。

### 运行时约束

- 同一个插件的任务**严格串行排队**，不会并发运行。
- 插件进程空闲 5 分钟会被回收，每次任务都应视为全新环境，**不要依赖全局变量缓存状态**。
- 进程内存超过 1GB 或任务超时会被强制终止。
- `checkpoint` / `resume` 是预留接口：当前版本只记录 `externalRef`，不会在应用重启后自动调用 `resume`。

---

## 5. 安全模型与网络白名单

插件跑在独立的 Chromium 沙箱进程里：

- 没有 Node.js，没有文件系统访问；`require`、`process` 均不可用。输入素材由客户端读好后传给你，结果由客户端落盘。
- 可以使用浏览器 API：`fetch`、`OffscreenCanvas`、`createImageBitmap`、`MediaRecorder`、`document` 等。
- 所有网络请求都会按 `network.allow` 过滤，未声明的请求直接被拦截。

白名单写法：

| 写法 | 效果 |
| :--- | :--- |
| `relight.example.com` | 放行该域名（HTTPS） |
| `https://api.example.com/v1` | 同上，路径部分被忽略 |
| `*.example.com` | 放行所有子域名及 `example.com` 本身 |
| `http://127.0.0.1:8188` | 仅放行本机该端口（ComfyUI 等） |
| `http://127.0.0.1` | 放行本机所有端口 |
| `http://localhost:11434` | 本机 Ollama |

远程地址必须是 HTTPS；只有 `127.0.0.1`、`localhost`、`[::1]` 允许明文 HTTP。**不支持 `:*` 形式的端口通配。**

密钥一律放进 `configSchema` 并标记 `secret: true`，不要写进 `manifest.json` 或 `runner.js`。

---

## 6. 本地测试

SDK 提供测试桩，可以在 Node 里用假上下文运行 runner，不用启动客户端：

```ts
import { runRunner } from "@mirrordraw/plugin-sdk/testing";
import runner from "./dist/runner.js";

const { results, progress } = await runRunner(runner, {
  params: { intensity: 60 },
  config: { endpoint: "http://127.0.0.1:8000" },
  inputs: { media: [{ kind: "image", bytes, mimeType: "image/png", fileName: "a.png", sourceNodeId: "n1" }] },
});
```

测试桩只模拟 `ctx`，不提供浏览器 API。依赖 `OffscreenCanvas`、`MediaRecorder` 的 runner 需要在客户端里用开发目录调试。

---

## 7. 示例

| 示例 | 说明 |
| :--- | :--- |
| [sample-plugin-grayscale](../examples/sample-plugin-grayscale) | 纯本地计算：用 `OffscreenCanvas` 把图片转为黑白胶片风格，无网络 |
| [plugin-video-sam2](../examples/plugin-video-sam2) | 视频输入、可选调用外部服务、逐帧处理并用 `MediaRecorder` 输出视频 |

---

## 8. 与 Agent / MCP 的关系

外部 Agent 可以通过 MCP 的 `canvas_list_plugins` 查到已安装插件，并创建、连线、运行插件节点。参数在节点数据里平铺为 `p_<key>`。详见 [Agent 接入指南](./agent-mcp-integration-guide.md)。
