export default {
  async run(ctx) {
    const { inputs, params, progress } = ctx;

    progress(10, "正在读取上游图像...");
    const imageInput = inputs.media.find((m) => m.kind === "image");
    if (!imageInput || !imageInput.bytes) {
      throw new Error("请先连接上游图片节点，并确保已有生成画面");
    }

    progress(30, "正在解码图像像素...");
    const blob = new Blob([imageInput.bytes], { type: imageInput.mimeType || "image/png" });
    const imageBitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) throw new Error("无法初始化离屏图形渲染上下文");

    canvasCtx.drawImage(imageBitmap, 0, 0);

    progress(60, "正在进行黑白灰度与胶片对比度增强处理...");
    const imgData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const contrast = Number(params.contrast ?? 30);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const invert = Boolean(params.invert);

    for (let i = 0; i < data.length; i += 4) {
      // 灰度转换公式：Y = 0.299R + 0.587G + 0.114B
      let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      // 对比度增强
      gray = factor * (gray - 128) + 128;
      gray = Math.max(0, Math.min(255, gray));

      if (invert) {
        gray = 255 - gray;
      }

      data[i] = gray;     // R
      data[i + 1] = gray; // G
      data[i + 2] = gray; // B
      // Alpha 保持不变
    }

    canvasCtx.putImageData(imgData, 0, 0);

    progress(90, "正在编码并转存本地资产库...");
    const outputBlob = await canvas.convertToBlob({ type: "image/png" });
    const outputBuffer = await outputBlob.arrayBuffer();

    return [
      {
        kind: "image",
        bytes: outputBuffer,
        mimeType: "image/png",
        fileName: "grayscale-result.png",
      },
    ];
  },
};
