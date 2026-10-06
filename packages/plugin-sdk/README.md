# @mirrordraw/plugin-sdk

MirrorDraw 桌面客户端插件的类型定义、本地测试桩和打包命令。

## 类型

```ts
import { defineRunner, type PluginManifest } from "@mirrordraw/plugin-sdk";

export default defineRunner({
  async run(ctx) {
    ctx.progress(50, "处理中");
    return { kind: "text", text: String(ctx.params.name) };
  },
});
```

`PluginManifest` 等清单类型由客户端源码自动生成，与客户端实际校验保持一致。

## 命令

```bash
mirrordraw-plugin validate <插件目录>
mirrordraw-plugin pack <插件目录> [-o 输出文件.mdplugin]
```

`validate` 的错误与客户端安装校验一致；警告是客户端当前不拦截、但会导致插件行为异常的项（如 `network.allow` 写了 `:*` 端口通配）。`pack` 只打包 `manifest.json`、`runner`、`icon.png`、`README.md` 与 `dist/` 目录。

## 测试桩

```ts
import { runRunner } from "@mirrordraw/plugin-sdk/testing";

const { results, progress, checkpoints } = await runRunner(runner, {
  params: { name: "demo" },
});
```

只模拟 `ctx`，不提供 `OffscreenCanvas`、`MediaRecorder` 等浏览器 API。

完整开发说明见 [插件开发指南](../../docs/plugin-developer-guide.md)。
