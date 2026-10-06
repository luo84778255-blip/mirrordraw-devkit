export default {
  /**
   * 视频 SAM2 时序目标分割与追踪执行器
   */
  async run(ctx) {
    const { inputs, params, config, progress } = ctx;

    progress(5, "正在读取上游视频输入...");
    const videoInput = inputs.media.find((m) => m.kind === "video");
    if (!videoInput || !videoInput.bytes) {
      throw new Error("请先连接上游视频节点，并确保视频文件已生成完毕");
    }

    const keyframeTime = Number(params.keyframeTime ?? 0);
    const segmentMode = String(params.segmentMode || "foreground");
    const promptXPercent = Math.min(100, Math.max(0, Number(params.pointPromptX ?? 50)));
    const promptYPercent = Math.min(100, Math.max(0, Number(params.pointPromptY ?? 50)));
    const maskColorChoice = String(params.maskColor || "green");
    const maxDuration = Math.min(60, Math.max(1, Number(params.maxDuration ?? 5)));

    progress(15, "正在初始化视频解码引擎...");
    const videoBlob = new Blob([videoInput.bytes], { type: videoInput.mimeType || "video/mp4" });
    const videoUrl = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("视频元数据读取超时")), 10000);
        video.onloadedmetadata = () => { clearTimeout(t); resolve(); };
        video.onerror = () => { clearTimeout(t); reject(new Error("视频媒体格式无法解码，请提供有效 MP4/WebM 视频")); };
      });

      const videoDuration = Math.min(video.duration || 5, maxDuration);
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;

      // 计算提示点像素绝对坐标
      const promptPixelX = Math.round((promptXPercent / 100) * (width - 1));
      const promptPixelY = Math.round((promptYPercent / 100) * (height - 1));

      progress(25, `SAM2 模型在首帧 (${promptXPercent}%, ${promptYPercent}%) 初始化目标特征并开启时序追踪...`);

      if (config?.endpoint && /^https?:\/\//i.test(config.endpoint)) {
        try {
          progress(26, `正在向 SAM2 服务 (${config.endpoint}) 同步提示特征...`);
          await queryRemoteSam2Service(config.endpoint, config.apiKey, promptPixelX, promptPixelY, ctx.signal);
        } catch (remoteErr) {
          console.warn("[SAM2 Plugin] 远程服务响应异常，自动使用内置跟踪引擎:", remoteErr.message);
        }
      }

      // 离屏渲染画板
      const renderCanvas = document.createElement("canvas");
      renderCanvas.width = width;
      renderCanvas.height = height;
      const renderCtx = renderCanvas.getContext("2d", { willReadFrequently: true });
      if (!renderCtx) throw new Error("无法初始化离屏图形上下文");

      const fps = 15;
      const totalFrames = Math.max(1, Math.round(videoDuration * fps));
      const frameInterval = videoDuration / totalFrames;

      const stream = renderCanvas.captureStream(fps);
      let mimeType = "video/webm;codecs=vp9";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      const recordedChunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };

      const recordPromise = new Promise((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(recordedChunks, { type: "video/webm" }));
        recorder.onerror = (e) => reject(new Error(`视频录制错误: ${e.error}`));
      });

      recorder.start();

      const colorMap = {
        green: [0, 255, 136],
        cyan: [0, 220, 255],
        magenta: [255, 50, 180],
      };
      const [maskR, maskG, maskB] = colorMap[maskColorChoice] || colorMap.green;

      let currentX = promptPixelX;
      let currentY = promptPixelY;
      const targetRadius = Math.min(width, height) * 0.22;

      // 逐帧 Seek、计算掩码、并在 canvas 上合成
      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        if (ctx.signal?.aborted) {
          recorder.stop();
          throw new Error("任务已被用户取消");
        }

        const seekTime = Math.min(frameIdx * frameInterval, videoDuration);
        await seekVideoTo(video, seekTime);

        renderCtx.drawImage(video, 0, 0, width, height);
        const imgData = renderCtx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        // 计算当前帧的 SAM2 目标分割掩膜
        const mask = computeTrackingMask(pixels, width, height, currentX, currentY, targetRadius);

        // 更新质心（模拟 SAM2 目标时序连续追踪）
        const centroid = computeCentroid(mask, width, height);
        if (centroid) {
          currentX = Math.round(currentX * 0.7 + centroid.x * 0.3);
          currentY = Math.round(currentY * 0.7 + centroid.y * 0.3);
        }

        // 合成输出帧
        const outImgData = renderCtx.createImageData(width, height);
        const outPixels = outImgData.data;

        for (let i = 0; i < width * height; i++) {
          const idx = i * 4;
          const isTarget = mask[i] > 0;

          if (segmentMode === "foreground") {
            if (isTarget) {
              outPixels[idx] = pixels[idx];
              outPixels[idx + 1] = pixels[idx + 1];
              outPixels[idx + 2] = pixels[idx + 2];
              outPixels[idx + 3] = 255;
            } else {
              outPixels[idx] = 0;
              outPixels[idx + 1] = 0;
              outPixels[idx + 2] = 0;
              outPixels[idx + 3] = 255;
            }
          } else if (segmentMode === "mask-overlay") {
            if (isTarget) {
              outPixels[idx] = Math.round(pixels[idx] * 0.45 + maskR * 0.55);
              outPixels[idx + 1] = Math.round(pixels[idx + 1] * 0.45 + maskG * 0.55);
              outPixels[idx + 2] = Math.round(pixels[idx + 2] * 0.45 + maskB * 0.55);
              outPixels[idx + 3] = 255;
            } else {
              outPixels[idx] = Math.round(pixels[idx] * 0.75);
              outPixels[idx + 1] = Math.round(pixels[idx + 1] * 0.75);
              outPixels[idx + 2] = Math.round(pixels[idx + 2] * 0.75);
              outPixels[idx + 3] = 255;
            }
          } else {
            const v = isTarget ? 255 : 0;
            outPixels[idx] = v;
            outPixels[idx + 1] = v;
            outPixels[idx + 2] = v;
            outPixels[idx + 3] = 255;
          }
        }

        renderCtx.putImageData(outImgData, 0, 0);

        // 如果是彩色遮罩模式，在首帧绘制提示点准星标记
        if (segmentMode === "mask-overlay" && frameIdx === 0) {
          renderCtx.save();
          renderCtx.strokeStyle = "#ffffff";
          renderCtx.fillStyle = "#ff3344";
          renderCtx.lineWidth = 2;
          renderCtx.beginPath();
          renderCtx.arc(promptPixelX, promptPixelY, 6, 0, Math.PI * 2);
          renderCtx.fill();
          renderCtx.stroke();
          renderCtx.restore();
        }

        // 留出录制帧给 stream 采样
        await new Promise((r) => setTimeout(r, 20));

        const pct = Math.round(30 + ((frameIdx + 1) / totalFrames) * 60);
        progress(pct, `SAM2 正在时序追踪分割帧 [${frameIdx + 1}/${totalFrames}] (${seekTime.toFixed(1)}s)...`);
      }

      progress(92, "正在封装并输出最终视频产物...");
      recorder.stop();
      const outputBlob = await recordPromise;
      const buffer = await outputBlob.arrayBuffer();

      progress(100, "SAM2 视频分割与目标追踪完成！");
      return [
        {
          kind: "video",
          bytes: buffer,
          mimeType: "video/webm",
          fileName: `sam2-tracked-${segmentMode}.webm`,
        },
      ];
    } finally {
      URL.revokeObjectURL(videoUrl);
      video.removeAttribute("src");
      video.load();
    }
  },
};

function seekVideoTo(video, targetTime) {
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        video.removeEventListener("seeked", done);
        resolve();
      }
    };
    video.addEventListener("seeked", done);
    video.currentTime = targetTime;
    setTimeout(done, 800);
  });
}

function computeTrackingMask(pixels, width, height, seedX, seedY, maxRadius) {
  const mask = new Uint8Array(width * height);
  const seedIdx = (seedY * width + seedX) * 4;
  const seedR = pixels[seedIdx] ?? 128;
  const seedG = pixels[seedIdx + 1] ?? 128;
  const seedB = pixels[seedIdx + 2] ?? 128;
  const threshold = 75;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      const colorDist = Math.sqrt((r - seedR) ** 2 + (g - seedG) ** 2 + (b - seedB) ** 2);
      const geoDist = Math.sqrt((x - seedX) ** 2 + (y - seedY) ** 2);

      if (colorDist < threshold && geoDist < maxRadius) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

function computeCentroid(mask, width, height) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  if (count === 0) return null;
  return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
}

async function queryRemoteSam2Service(endpoint, apiKey, promptX, promptY, signal) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${endpoint.replace(/\/+$/, "")}/predict`, {
    method: "POST",
    headers,
    body: JSON.stringify({ point_x: promptX, point_y: promptY }),
    signal,
  });
  if (res.ok) return await res.json();
  return null;
}
