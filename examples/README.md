# 示例插件

| 目录 | 说明 |
| :--- | :--- |
| `sample-plugin-grayscale` | 纯本地计算，无网络。用 `OffscreenCanvas` 把输入图片转为黑白胶片风格，演示参数表（滑块、开关）与二进制结果返回 |
| `plugin-video-sam2` | 视频输入与输出的写法演示：逐帧解码、`MediaRecorder` 编码输出、可选请求外部服务。内置的是简易追踪演示逻辑，**不包含 SAM2 模型** |

使用方式：

```bash
npx @mirrordraw/plugin-sdk validate examples/sample-plugin-grayscale
npx @mirrordraw/plugin-sdk pack examples/sample-plugin-grayscale -o grayscale.mdplugin
```

这两个目录由客户端仓库同步生成，请不要直接修改。
