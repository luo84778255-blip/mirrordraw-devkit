import { defineRunner } from "@mirrordraw/plugin-sdk";

export default defineRunner({
  async run(ctx) {
    const text = ctx.inputs.texts.map((item) => item.text).join("\n").trim();
    if (!text) throw new Error("请先连接一个有内容的文本节点");

    ctx.progress(50, "处理中");
    const prefix = String(ctx.params.prefix ?? "");

    return { kind: "text", text: prefix + text };
  },
});
