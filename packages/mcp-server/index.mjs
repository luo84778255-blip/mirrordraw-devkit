#!/usr/bin/env node

/**
 * MirrorDraw Pro - Official Model Context Protocol (MCP) Server
 * 
 * 外部 Agent（Claude Desktop、Cursor、Cline、Windsurf 等）通过此 MCP 服务直接操控 MirrorDraw 画布。
 * 遵循标准 JSON-RPC 2.0 via Stdio。
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_PORT = 49152;
const PORT = parseInt(process.env.MIRRORDRAW_PORT || String(DEFAULT_PORT), 10);
let TOKEN = process.env.MIRRORDRAW_TOKEN || "";

// 如果环境变量未传入 Token，尝试从 MirrorDraw 本地配置自动读取
if (!TOKEN) {
  try {
    const home = os.homedir();
    const candidateDirs = [];
    if (process.platform === "darwin") {
      candidateDirs.push(
        path.join(home, "Library", "Application Support", "MirrorDraw.AI"),
        path.join(home, "Library", "Application Support", "mirrordraw-ai"),
        path.join(home, "Library", "Application Support", "Electron")
      );
    } else if (process.platform === "win32") {
      const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
      candidateDirs.push(
        path.join(appData, "MirrorDraw.AI"),
        path.join(appData, "mirrordraw-ai"),
        path.join(appData, "Electron")
      );
    } else {
      const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
      candidateDirs.push(
        path.join(configHome, "MirrorDraw.AI"),
        path.join(configHome, "mirrordraw-ai"),
        path.join(configHome, "Electron")
      );
    }

    for (const dir of candidateDirs) {
      const tokenFile = path.join(dir, "agent_auth_token.json");
      if (fs.existsSync(tokenFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
          if (data && data.token) {
            TOKEN = data.token;
            break;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

// HTTP 请求转发给 MirrorDraw 客户端内部服务
function callMirrorDrawApi(method, endpoint, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : "";
    const headers = {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    };
    if (postData) {
      headers["Content-Length"] = Buffer.byteLength(postData);
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: endpoint,
        method: method,
        headers: headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}: ${raw}`));
            }
          } catch (e) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ raw });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
            }
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout connecting to MirrorDraw desktop app. Is the app running with an open canvas?"));
    });

    req.on("error", (err) => {
      if (err.code === "ECONNREFUSED") {
        reject(new Error("Cannot connect to MirrorDraw Desktop. Please ensure MirrorDraw.AI is running on your machine."));
      } else {
        reject(err);
      }
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// ==================== MCP Tool 规范定义 ====================

const CANVAS_NODE_TYPES = [
  "plugin",
  "script",
  "image",
  "imageV2",
  "rhFaceSwap",
  "batchMedia",
  "batchImage",
  "batchVideo",
  "nineGridParse",
  "video",
  "videoV2",
  "videoClip",
  "videoMerge",
  "rhVideoUpscale",
  "rhVideoUpscaleBatch",
  "rhVideoFps",
  "videoSubtitleRemove",
  "videoEraseSubtitlePro",
  "rhVideoSceneSplit",
  "videoCharacterSceneRemix",
  "videoReverse",
  "scriptSplit",
  "screenplay",
  "videoSplitMax",
  "audio",
  "voiceV2",
  "dubbing",
  "music",
  "soundEffect",
  "voiceConversion",
  "voiceConversionVideo",
  "model3dGenerator",
  "ai3dRigging",
  "director3dStage",
  "text",
  "stickyText",
  "material",
  "note",
  "group",
  "gridStoryboardGroup",
  "gridStoryboardTile",
  "productionCheckpoint",
  "rhDetailFix",
  "rhUpscale",
  "rhMultiAngle",
  "rhLightRemodel",
  "rhCameraSimulator",
  "rhSharp3D",
];

const PREFERRED_NODE_TYPES = {
  image: "imageV2",
  video: "videoV2",
  audio: "voiceV2",
  music: "music",
  screenplay: "screenplay",
  scriptSplit: "scriptSplit",
  text: "text",
  group: "group",
  model3d: "model3dGenerator",
};

const NODE_CATALOG = {
  plugin: {
    title: "插件节点",
    preferred: false,
    category: "tool",
    summary: "执行本地安装或开发的扩展插件任务（仅限本地画布）。",
    useWhen: "需要使用第三方插件进行特定图像、视频或文本算法处理时",
    avoidWhen: "云端协作画布（暂仅限本地画布使用）",
    keyFields: ["pluginId", "pluginNodeType", "title", "p_<key>"],
    upstream: ["image", "imageV2", "video", "videoV2", "audio", "text"],
    downstream: ["imageV2", "videoV2", "videoClip", "videoSplitMax"],
    triggerable: true,
  },
  imageV2: {
    title: "图片生成",
    preferred: true,
    category: "generate",
    summary: "文生图 / 图生图。普通生图首选。data.frameCaptureFrom=视频节点ID 时变为尾帧节点：触发即截取该视频最后一帧，不生图。",
    useWhen: "要生成新图，或用参考图改图；或把上一段视频的尾帧接到下一段",
    avoidWhen: "只贴已有素材、批量多图、或遗留超分/多角度",
    keyFields: ["prompt", "title", "outputSize", "model", "negativePrompt", "frameCaptureFrom"],
    upstream: ["text", "image", "imageV2", "videoV2"],
    downstream: ["imageV2", "videoV2", "model3dGenerator", "batchMedia"],
    triggerable: true,
  },
  image: {
    title: "图片生成",
    preferred: false,
    aliasOf: "imageV2",
    category: "generate",
    summary: "与 imageV2 同类。新节点优先用 imageV2。",
    useWhen: "已有旧画布上的 image 节点需要继续改",
    avoidWhen: "新创建生图节点",
    keyFields: ["prompt", "title", "outputSize", "model", "negativePrompt"],
    upstream: ["text", "image", "imageV2"],
    downstream: ["imageV2", "videoV2"],
    triggerable: true,
  },
  videoV2: {
    title: "视频生成",
    preferred: true,
    category: "generate",
    summary: "文生视频 / 图生视频。普通生视频首选。",
    useWhen: "要根据提示词或参考图/视频生成新视频",
    avoidWhen: "剪辑、合成、高清、切分、去字幕等后处理",
    keyFields: ["prompt", "title", "model", "ratio", "duration"],
    upstream: ["text", "image", "imageV2", "video", "videoV2"],
    downstream: ["videoClip", "videoMerge", "rhVideoUpscale", "rhVideoSceneSplit", "videoReverse", "soundEffect"],
    triggerable: true,
  },
  video: {
    title: "视频生成",
    preferred: false,
    aliasOf: "videoV2",
    category: "generate",
    summary: "与 videoV2 同类。新节点优先用 videoV2。",
    useWhen: "维护已有 video 节点",
    avoidWhen: "新创建生视频节点",
    keyFields: ["prompt", "title", "model", "ratio", "duration"],
    upstream: ["text", "image", "video"],
    downstream: ["videoClip", "videoReverse"],
    triggerable: true,
  },
  voiceV2: {
    title: "音频 / 语音",
    preferred: true,
    category: "generate",
    summary: "通用音频节点，配音、参考音频、语音生成首选。",
    useWhen: "需要语音或通用音频轨道",
    avoidWhen: "专门做 AI 音乐时改用 music；纯音效改用 soundEffect",
    keyFields: ["prompt", "title", "model"],
    upstream: ["text", "voiceV2"],
    downstream: ["videoV2", "voiceV2"],
    triggerable: true,
  },
  audio: {
    title: "音频",
    preferred: false,
    aliasOf: "voiceV2",
    category: "generate",
    summary: "与 voiceV2 同类。新节点优先用 voiceV2。",
    useWhen: "维护已有 audio 节点",
    avoidWhen: "新创建音频节点",
    keyFields: ["prompt", "title", "model"],
    upstream: ["text"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  music: {
    title: "AI 音乐",
    preferred: true,
    category: "generate",
    summary: "生成歌曲 / BGM，不要拿来做对白配音。",
    useWhen: "需要原创音乐或配乐",
    avoidWhen: "对白、音效、变声",
    keyFields: ["prompt", "title", "lyricsText", "model"],
    upstream: ["text"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  dubbing: {
    title: "配音",
    category: "generate",
    summary: "对白 / TTS 配音。",
    useWhen: "给画面或文本配人声",
    avoidWhen: "做音乐或音效",
    keyFields: ["prompt", "title", "model"],
    upstream: ["text"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  soundEffect: {
    title: "音效",
    category: "generate",
    summary: "文本或视频生成音效。",
    useWhen: "需要环境音、动作音、视频配乐效",
    avoidWhen: "对白或完整歌曲",
    keyFields: ["prompt", "title", "model"],
    upstream: ["text", "video", "videoV2"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  voiceConversion: {
    title: "变声",
    category: "process",
    summary: "把已有人声转换成另一种音色。",
    useWhen: "已有音频，只要换声线",
    avoidWhen: "从零生成语音（用 voiceV2 / dubbing）",
    keyFields: ["prompt", "title", "model"],
    upstream: ["voiceV2", "audio"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  voiceConversionVideo: {
    title: "视频变声",
    category: "process",
    summary: "对视频里的人声做变声。",
    useWhen: "输入是视频而不是纯音频",
    avoidWhen: "纯音频变声（用 voiceConversion）",
    keyFields: ["prompt", "title", "model"],
    upstream: ["video", "videoV2"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  screenplay: {
    title: "剧本工作台",
    preferred: true,
    category: "writing",
    summary: "写剧本、大纲、分场。不是拆分镜工具。内部阶段用 canvas_screenplay_run，不要只改 content。",
    useWhen: "从故事/大纲开始创作",
    avoidWhen: "已经有完整剧本只想拆镜头（用 scriptSplit）",
    keyFields: ["title", "content", "currentStage"],
    upstream: ["text"],
    downstream: ["scriptSplit"],
    triggerable: false,
  },
  script: {
    title: "脚本文本",
    category: "writing",
    summary: "较旧的剧本文本节点。新创作优先 screenplay。",
    useWhen: "只要贴一段剧本原文",
    avoidWhen: "需要完整剧本工作流",
    keyFields: ["prompt", "label"],
    upstream: ["text"],
    downstream: ["scriptSplit"],
    triggerable: false,
  },
  scriptSplit: {
    title: "剧本拆分",
    preferred: true,
    category: "writing",
    summary: "把剧本拆成集/场/分镜，供下游生图与生视频使用。",
    useWhen: "已有剧本文本，要拆成可执行分镜",
    avoidWhen: "还没写剧本（先建 screenplay）",
    keyFields: ["title", "splitLlmModel", "splitStageModels", "shotImageModel", "shotVideoModel"],
    upstream: ["screenplay", "text", "script"],
    downstream: ["imageV2", "videoV2"],
    triggerable: true,
  },
  text: {
    title: "文本",
    preferred: true,
    category: "writing",
    summary: "提示词、说明、可连到生图/生视频/音频的文本节点。",
    useWhen: "提供 prompt 或说明文字",
    avoidWhen: "完整剧本（用 screenplay）；临时便签（用 stickyText / note）",
    keyFields: ["content"],
    upstream: [],
    downstream: ["imageV2", "videoV2", "voiceV2", "scriptSplit", "soundEffect"],
    triggerable: false,
  },
  stickyText: {
    title: "便利贴",
    category: "layout",
    summary: "画布上的短便签，不作为生成输入。",
    useWhen: "给自己或协作者留短备注",
    avoidWhen: "当 prompt 用（用 text）",
    keyFields: ["content"],
    upstream: [],
    downstream: [],
    triggerable: false,
  },
  note: {
    title: "注释",
    category: "layout",
    summary: "注释卡，用于标注，不参与生成。",
    useWhen: "标记区域或说明",
    avoidWhen: "当 prompt 或剧本用",
    keyFields: ["title", "content"],
    upstream: [],
    downstream: [],
    triggerable: false,
  },
  group: {
    title: "分区",
    preferred: true,
    category: "layout",
    summary: "把一组节点框在一起。不是生成节点。",
    useWhen: "整理工作流、批量跑分区内节点",
    avoidWhen: "误当成生图/生视频节点",
    keyFields: ["label"],
    upstream: [],
    downstream: [],
    triggerable: false,
  },
  rhFaceSwap: {
    title: "换脸",
    category: "process",
    summary: "用一张脸替换底图中的人脸。",
    useWhen: "已有底图和脸图",
    avoidWhen: "从零生图（用 imageV2）",
    keyFields: ["title"],
    upstream: ["image", "imageV2"],
    downstream: ["imageV2", "videoV2"],
    triggerable: true,
  },
  batchMedia: {
    title: "批量图/视频",
    category: "generate",
    summary: "一张或多张参考图批量生图或生视频。",
    useWhen: "同一套参数要跑很多张",
    avoidWhen: "只生成一张（用 imageV2 / videoV2）",
    keyFields: ["batchUnifiedPrompt", "batchMediaMode", "title"],
    upstream: ["image", "imageV2"],
    downstream: ["imageV2", "videoV2"],
    triggerable: true,
  },
  batchImage: {
    title: "批量图生图",
    aliasOf: "batchMedia",
    category: "generate",
    summary: "batchMedia 的图片模式别名。",
    useWhen: "批量出图",
    avoidWhen: "单张生图",
    keyFields: ["batchUnifiedPrompt", "title"],
    upstream: ["image"],
    downstream: ["imageV2"],
    triggerable: true,
  },
  batchVideo: {
    title: "批量视频",
    aliasOf: "batchMedia",
    category: "generate",
    summary: "batchMedia 的视频模式别名。",
    useWhen: "批量出视频",
    avoidWhen: "单条生视频",
    keyFields: ["batchUnifiedPrompt", "title"],
    upstream: ["image"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  nineGridParse: {
    title: "九宫格解析",
    category: "process",
    summary: "把宫格图拆成多格内容。",
    useWhen: "输入是九宫格/多宫格图",
    avoidWhen: "普通单图生图",
    keyFields: ["title", "gridMode"],
    upstream: ["image", "imageV2"],
    downstream: ["imageV2"],
    triggerable: true,
  },
  videoClip: {
    title: "视频剪辑",
    category: "process",
    summary: "时间线剪辑已有视频。打开后用 canvas_video_clip_run：加素材、建轨、入出点、变速、音量、字幕、淡入淡出、blur。不是完整 NLE，没有独立转场轨和调色着色器。",
    useWhen: "裁切、拼接、加字幕、调速度音量",
    avoidWhen: "从提示词生成新视频；不要指望 dissolve/wipe 或亮度对比度调色",
    keyFields: ["title", "clipProjectId"],
    upstream: ["video", "videoV2"],
    downstream: ["videoMerge", "videoV2"],
    triggerable: false,
  },
  videoMerge: {
    title: "视频合成",
    category: "process",
    summary: "把多段视频合成一条。",
    useWhen: "已有多段成片要接起来",
    avoidWhen: "生成全新视频",
    keyFields: ["title"],
    upstream: ["video", "videoV2", "videoClip"],
    downstream: ["videoV2"],
    triggerable: false,
  },
  rhVideoUpscale: {
    title: "视频高清",
    category: "process",
    summary: "提升已有视频清晰度。",
    useWhen: "成片太糊，只要变清晰",
    avoidWhen: "还没有源视频",
    keyFields: ["title"],
    upstream: ["video", "videoV2"],
    downstream: ["videoV2", "videoReverse"],
    triggerable: true,
  },
  rhVideoUpscaleBatch: {
    title: "批量视频高清",
    aliasOf: "rhVideoUpscale",
    category: "process",
    summary: "批量视频超分。",
    useWhen: "多条视频一起超分",
    avoidWhen: "单条超分直接用 rhVideoUpscale",
    keyFields: ["title"],
    upstream: ["video", "videoV2"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  rhVideoFps: {
    title: "视频补帧",
    category: "process",
    summary: "提高视频帧率，让运动更顺。",
    useWhen: "已有视频要补帧",
    avoidWhen: "生成新视频",
    keyFields: ["title"],
    upstream: ["video", "videoV2"],
    downstream: ["videoV2", "videoReverse", "soundEffect"],
    triggerable: true,
  },
  videoSubtitleRemove: {
    title: "视频去字幕",
    category: "process",
    summary: "去掉视频上的字幕。",
    useWhen: "源视频带烧录字幕",
    avoidWhen: "没有字幕要去",
    keyFields: ["title"],
    upstream: ["video", "videoV2"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  videoEraseSubtitlePro: {
    title: "视频擦除字幕 Pro",
    category: "process",
    summary: "更强的字幕/文字擦除。",
    useWhen: "普通去字幕效果不够",
    avoidWhen: "没有源视频",
    keyFields: ["eraseType"],
    upstream: ["video", "videoV2"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  rhVideoSceneSplit: {
    title: "视频智能切分",
    category: "process",
    summary: "按镜头把视频切成片段。",
    useWhen: "一条长视频要按场景切开",
    avoidWhen: "要从剧本拆分镜（用 scriptSplit）",
    keyFields: ["threshold", "minSceneLength"],
    upstream: ["video", "videoV2"],
    downstream: ["videoV2", "videoReverse", "soundEffect"],
    triggerable: true,
  },
  videoCharacterSceneRemix: {
    title: "视频人物场景重制",
    category: "process",
    summary: "按角色/场景映射重制视频。",
    useWhen: "已有拆分分析和角色库",
    avoidWhen: "普通文生视频",
    keyFields: ["title"],
    upstream: ["videoSplitMax", "video"],
    downstream: ["videoV2"],
    triggerable: true,
  },
  videoReverse: {
    title: "视频/图片反推提示词",
    category: "process",
    summary: "从图片或视频反推出 prompt，再拿去生图/生视频。",
    useWhen: "想模仿已有画面的描述",
    avoidWhen: "已经有明确 prompt",
    keyFields: ["title"],
    upstream: ["image", "imageV2", "video", "videoV2"],
    downstream: ["imageV2", "videoV2"],
    triggerable: true,
  },
  videoSplitMax: {
    title: "视频拆分 MAX",
    category: "process",
    summary: "切分成片并全局反推，再一键派生角色设定、分镜生图、分镜视频三列流水线。",
    useWhen: "从成片反拆工作流，要规整导出到画布",
    avoidWhen: "从文字剧本拆分（用 scriptSplit）",
    keyFields: ["title", "videoUrl", "threshold", "minSceneLength", "stage", "rows", "characterLibrary"],
    upstream: ["video", "videoV2"],
    downstream: ["group", "text", "image", "imageV2", "video", "videoV2"],
    triggerable: true,
  },
  model3dGenerator: {
    title: "3D 模型生成",
    preferred: true,
    category: "generate",
    summary: "图生 3D 或文生 3D 模型。",
    useWhen: "需要 3D 资产",
    avoidWhen: "只要 2D 图或视频",
    keyFields: ["prompt", "title", "model"],
    upstream: ["image", "imageV2", "text"],
    downstream: ["ai3dRigging", "director3dStage"],
    triggerable: true,
  },
  ai3dRigging: {
    title: "一键绑骨",
    category: "process",
    summary: "给 3D 模型自动绑骨骼。",
    useWhen: "已有 3D 模型要进导演台做动作",
    avoidWhen: "还没有模型（先 model3dGenerator）",
    keyFields: ["title"],
    upstream: ["model3dGenerator"],
    downstream: ["director3dStage"],
    triggerable: true,
  },
  director3dStage: {
    title: "3D 导演台",
    category: "generate",
    summary: "3D 片场，摆场景、导演出图/视频。",
    useWhen: "要在 3D 空间里导戏",
    avoidWhen: "普通 2D 生图/生视频",
    keyFields: ["title", "sceneProjectId"],
    upstream: ["model3dGenerator", "ai3dRigging"],
    downstream: ["imageV2", "videoV2"],
    triggerable: false,
  },
  material: {
    title: "素材",
    category: "media",
    summary: "放已有图片/文件素材，不负责生成。",
    useWhen: "导入现成资产",
    avoidWhen: "要 AI 生成内容",
    keyFields: ["title", "url"],
    upstream: [],
    downstream: ["imageV2", "videoV2"],
    triggerable: false,
  },
  gridStoryboardGroup: {
    title: "宫格分镜组",
    category: "layout",
    summary: "把一张图切成宫格分镜。",
    useWhen: "需要宫格分镜布局",
    avoidWhen: "普通剧本分镜（用 scriptSplit）",
    keyFields: ["title", "splitRows", "splitCols"],
    upstream: ["image", "imageV2"],
    downstream: ["gridStoryboardTile"],
    triggerable: false,
  },
  gridStoryboardTile: {
    title: "宫格分镜格子",
    category: "layout",
    summary: "宫格组里的单格，一般不要单独创建。",
    useWhen: "作为宫格组的子节点",
    avoidWhen: "手动当普通图片节点用",
    keyFields: ["url", "index"],
    upstream: ["gridStoryboardGroup"],
    downstream: [],
    triggerable: false,
  },
  productionCheckpoint: {
    title: "生产打卡",
    category: "layout",
    summary: "项目进度打卡。整张画布通常只需一个。",
    useWhen: "要跟踪制作进度",
    avoidWhen: "当生成节点用；不要重复创建",
    keyFields: ["title", "phase", "status"],
    upstream: [],
    downstream: [],
    triggerable: false,
  },
  rhDetailFix: {
    title: "细节修复",
    deprecated: true,
    category: "deprecated",
    summary: "遗留图片工具，已并入图片节点面板。不要新建。",
    useWhen: "不要新建",
    avoidWhen: "任何新工作流",
    keyFields: [],
    upstream: ["image"],
    downstream: ["image"],
    triggerable: false,
  },
  rhUpscale: {
    title: "图片超分",
    deprecated: true,
    category: "deprecated",
    summary: "遗留超分节点。不要新建。",
    useWhen: "不要新建",
    avoidWhen: "任何新工作流",
    keyFields: [],
    upstream: ["image"],
    downstream: ["image"],
    triggerable: false,
  },
  rhMultiAngle: {
    title: "多角度",
    deprecated: true,
    category: "deprecated",
    summary: "遗留多角度节点。不要新建。",
    useWhen: "不要新建",
    avoidWhen: "任何新工作流",
    keyFields: [],
    upstream: ["image"],
    downstream: ["image"],
    triggerable: false,
  },
  rhLightRemodel: {
    title: "光影重塑",
    deprecated: true,
    category: "deprecated",
    summary: "遗留光影节点。不要新建。",
    useWhen: "不要新建",
    avoidWhen: "任何新工作流",
    keyFields: [],
    upstream: ["image"],
    downstream: ["image"],
    triggerable: false,
  },
  rhCameraSimulator: {
    title: "镜头模拟",
    deprecated: true,
    category: "deprecated",
    summary: "遗留镜头模拟节点。不要新建。",
    useWhen: "不要新建",
    avoidWhen: "任何新工作流",
    keyFields: [],
    upstream: ["image"],
    downstream: ["image"],
    triggerable: false,
  },
  rhSharp3D: {
    title: "3D 锐化",
    deprecated: true,
    category: "deprecated",
    summary: "遗留 3D 锐化节点。不要新建。",
    useWhen: "不要新建",
    avoidWhen: "任何新工作流",
    keyFields: [],
    upstream: ["image"],
    downstream: ["image"],
    triggerable: false,
  },
};

const AGENT_PLAYBOOK = {
  rules: [
    "先看当前画布：canvas_get_status，再 canvas_get_map 或 canvas_get_summary 快速摸底工作流拓扑，需全量坐标细节再调 canvas_get_snapshot。",
    "创建生成节点前先 canvas_list_models，必须传 nodeType。只写表里的 modelKey。生视频写文生视频 key，有参考图时节点会自动切到配对模型。",
    "创建节点用 preferred 类型：生图 imageV2，生视频 videoV2，音频 voiceV2，剧本 screenplay。",
    "不要新建 deprecated 节点。",
    "group 只用于分区，不是生成节点。",
    "参考图/提示词关系用 canvas_connect_nodes，默认 sourceHandle=output、targetHandle=input。图片连到视频时可传 frameRole=firstFrame/lastFrame/reference 明确首尾帧，不要靠连接顺序。",
    "生成类节点创建后如需执行，再调用 canvas_trigger_node_task。",
    "批量修改不理想或需放弃改动时，可调用 canvas_undo 一键回退，或用 canvas_revert_changeset 靶向回退特定批次而不干扰其他卡片。",
    "需要保持角色一致性或世界观连贯时，先调 canvas_get_context 获取角色参考图和故事基调。",
    "改动或生成完一组节点后，可调用 canvas_lint 验证拓扑与参数完整性，若有警告根据 suggestedAction 自愈修正。",
    "写作台 / 导演台 / 剪辑：先 canvas_open_workbench。写作台用 canvas_screenplay_run，导演台用 canvas_director3d_run，剪辑用 canvas_video_clip_run。",
    "要看生成图或视频封面必须调用 canvas_get_node_media。snapshot / summary 里的 url 不能当图片打开。",
    "canvas_trigger_node_task 只表示已开始生成，不表示完成。完成后用 canvas_wait_node_result 或 canvas_get_node_media。视频回封面/首帧；要点播放成片再调 canvas_open_node_media。",
    "在大画布中查找特定卡片或按状态排查时，优先用 canvas_find_nodes，避免拉取全量快照消耗过多 Token。定位到目标后可配合 canvas_focus_node 将视口对焦到该卡片。",
    "改已有节点用 canvas_update_node；批量修改多个节点（统一模型、比例、参数）时使用 canvas_batch_update_nodes 原子更新，不要多次串行调用。",
    "批量创建或连线后，可调用 canvas_auto_layout 自动按 DAG 拓扑分层整齐排版，消除卡片重叠与折线交叉。",
    "data 必须是 JSON 对象，不能是字符串。生图比例用 outputSize，例如 2K|16:9；不要用 aspect_ratio。",
    "选模型：生图写 data.model 或 data.img2imgModel；生视频/音频/3D 写 data.model。模型参数按 params[].key 平铺进 data，不要包一层 params。",
    "生图提示词可写 prompt，服务端会落到 img2imgPrompt。negativePrompt 创建和更新都会写入。",
    "写操作成功时回执会带落地后的 data / nodeId，不要只看 applied:true。",
    "本地插件扩展：先 canvas_list_plugins 取 pluginId / pluginNodeType 和参数表，再创建 plugin 节点；参数写 p_<key>（如 p_pointPromptX），不要包 params。输出 kind=video 时结果写入 data.videoUrl，image 写 data.imageUrl。",
    "剪辑：先 canvas_open_workbench kind=videoClip，再 canvas_video_clip_run kind=snapshot。addMedia 只用 snapshot.assets 的 mediaId。转场只有 fadeIn/fadeOut（透明度关键帧）。特效只有 blur。没有调色、没有独立转场轨、导出不是 MCP。",
  ],
  preferred: PREFERRED_NODE_TYPES,
  recipes: [
    {
      id: "text-to-image",
      title: "文生图",
      steps: [
        "canvas_list_models nodeType=imageV2，记下 modelKey 和 params",
        "canvas_create_node type=imageV2，data.prompt 写提示词，data.model 写表里的 modelKey，可选 outputSize",
        "可选：先建 text，再 connect text -> imageV2",
        "canvas_trigger_node_task",
        "canvas_wait_node_result 等待出图；不要用 snapshot 的 url",
      ],
    },
    {
      id: "image-to-video",
      title: "参考图生视频",
      steps: [
        "确保参考图节点已在画布上（image / imageV2）",
        "canvas_list_models nodeType=videoV2，记下支持参考图的 modelKey",
        "canvas_create_node type=videoV2，data.prompt 写镜头描述，data.model 写表里的 modelKey",
        "canvas_connect_nodes 参考图 -> videoV2",
        "canvas_trigger_node_task",
        "canvas_wait_node_result 看封面；要播成片再 canvas_open_node_media",
      ],
    },
    {
      id: "video-tail-frame-chain",
      title: "尾帧接力（上一段视频尾帧作下一段首帧）",
      steps: [
        "canvas_create_node type=imageV2，data.frameCaptureFrom 写上一段视频节点 ID（尾帧节点，不生图）",
        "canvas_connect_nodes 上一段视频 -> 尾帧节点",
        "canvas_connect_nodes 尾帧节点 -> 下一段 videoV2，frameRole=firstFrame（接续）或 reference（硬切，只保持外观一致）",
        "三者放同一分区后 canvas_run_group_nodes：视频完成→截尾帧→下一段，按顺序推进",
        "也可逐个 canvas_trigger_node_task：尾帧节点触发即截帧，上一段视频无结果时报错",
      ],
    },
    {
      id: "screenplay-to-shots",
      title: "剧本到分镜",
      steps: [
        "canvas_create_node type=screenplay，写入剧情",
        "canvas_open_workbench nodeId=剧本节点，kind=screenplay",
        "canvas_screenplay_run 切阶段 / 跑 AI / 写入阶段文本 / 导出",
        "canvas_create_node type=scriptSplit",
        "connect screenplay -> scriptSplit，然后 trigger scriptSplit",
        "scriptSplit 完成后可派生或直接按分镜创建 imageV2 / videoV2 并连接",
      ],
    },
    {
      id: "video-split-max-pipeline",
      title: "成片拆分再派生流水线",
      steps: [
        "把成片连到 videoSplitMax，或创建 videoSplitMax 后写入 videoUrl",
        "trigger videoSplitMax，等待 stage=done",
        "完成后节点可一键派生：角色设定（紫）→ 分镜生图（绿）→ 分镜视频（蓝）",
        "下游按连线引用角色图和首帧，不要再塞内嵌分镜大表",
      ],
    },
    {
      id: "reverse-then-generate",
      title: "成片反推再生",
      steps: [
        "把已有视频/图片连到 videoReverse",
        "trigger videoReverse 得到 prompt",
        "用反推结果创建 imageV2 或 videoV2 并连接",
      ],
    },
    {
      id: "3d-stage",
      title: "图生 3D 进导演台",
      steps: [
        "imageV2 或已有图 -> model3dGenerator，trigger",
        "需要动作时再连 ai3dRigging",
        "连到 director3dStage，canvas_open_workbench kind=director3d",
        "等 canvas_get_snapshot 里 director3d.open 为 true 后再 canvas_director3d_run。status 不含此字段；太早会报片场仍在加载",
        "addObject / addObjects / addLibraryModel / duplicateObject 成功回执带 objectId / objectIds，后续变换用这个 ID",
      ],
    },
    {
      id: "video-clip",
      title: "打开剪辑时间线并改片段",
      steps: [
        "画布上要有 videoClip 节点，并把视频/音频连上去",
        "canvas_open_workbench nodeId=剪辑节点，kind=videoClip",
        "等剪辑页打开后再 canvas_video_clip_run kind=snapshot，记下 assets[].mediaId 和 tracks[].elements[].elementId",
        "addMedia 只用 snapshot 里的 mediaId，不要传外网 URL",
        "setTrim 用 inSeconds/outSeconds 或 trimStartSeconds/trimEndSeconds；setSpeed rate=0.01-5；setVolume volumeDb=-60..20",
        "字幕用 addSubtitle；转场用 fadeIn/fadeOut（透明度关键帧，不是独立转场轨）；特效用 addEffect effectType=blur",
        "没有 dissolve/wipe，也没有亮度对比度调色。导出仍非 MCP",
      ],
    },
  ],
};

function getNodeTypeEntry(type) {
  const entry = NODE_CATALOG[type];
  if (!entry) {
    return {
      type,
      title: type,
      summary: type,
      category: "unknown",
      preferred: false,
      deprecated: false,
      useWhen: "",
      avoidWhen: "",
      keyFields: [],
      upstream: [],
      downstream: [],
      triggerable: false,
    };
  }
  return {
    type,
    title: entry.title,
    summary: entry.summary,
    category: entry.category || "other",
    preferred: Boolean(entry.preferred),
    deprecated: Boolean(entry.deprecated),
    aliasOf: entry.aliasOf || undefined,
    useWhen: entry.useWhen || "",
    avoidWhen: entry.avoidWhen || "",
    keyFields: entry.keyFields || [],
    upstream: entry.upstream || [],
    downstream: entry.downstream || [],
    triggerable: Boolean(entry.triggerable),
  };
}

const NODE_DATA_PROPERTIES = {
  title: { type: "string", description: "节点标题" },
  prompt: { type: "string", description: "提示词。生图会写入 img2imgPrompt，生视频写入 prompt。" },
  content: { type: "string", description: "文本节点正文" },
  model: { type: "string", description: "模型 key。必须先 canvas_list_models 再写表里的 modelKey。生图会同时写入 img2imgModel；视频/音频/3D 写 data.model。" },
  splitLlmModel: { type: "string", description: "剧本拆分节点使用的大语言模型 key。空或不填表示跟随平台默认。" },
  splitStageModels: { type: "object", description: "高级专家模式：细分阶段模型配置 { bible?, segments?, shots?, costume?, world?, seam? }" },
  outputSize: { type: "string", description: "生图分辨率+比例，格式 1K|16:9、2K|9:16、4K|1:1。优先用这个，不要用 aspect_ratio。" },
  img2imgAspectRatio: { type: "string", description: "生图比例，如 16:9。可与 img2imgImageSize 一起传；若传 outputSize 则不必再传。" },
  img2imgImageSize: { type: "string", description: "生图档位：1K / 2K / 4K" },
  ratio: { type: "string", description: "视频比例，如 16:9" },
  duration: { type: "number", description: "视频时长（秒）" },
  negativePrompt: { type: "string", description: "负向提示词。创建和更新都会写入 node.data.negativePrompt。" },
};

const NODE_DATA_SCHEMA = {
  type: "object",
  description: "节点字段对象，必须是 JSON object，不能是字符串。生图比例请用 outputSize（如 2K|16:9）。aspect_ratio 会被映射到 img2imgAspectRatio / ratio，但不会单独作为生效字段保存。",
  additionalProperties: true,
  properties: NODE_DATA_PROPERTIES,
};

function parseToolObject(value, label) {
  if (value == null) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      throw new Error(`${label} 必须是对象，不能是 JSON 字符串`);
    }
    throw new Error(`${label} 必须是对象，不能是 JSON 字符串`);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length > 1 && keys.every((key) => /^\d+$/.test(key)) && typeof value["0"] === "string") {
      try {
        return parseToolObject(
          keys
            .sort((a, b) => Number(a) - Number(b))
            .map((key) => value[key])
            .join(""),
          label,
        );
      } catch {
        throw new Error(`${label} 被展开成了单字符键，已拒绝`);
      }
    }
    return value;
  }
  throw new Error(`${label} 必须是对象`);
}

function summarizeMediaStatus(node) {
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  const generating = data.isGenerating === true
    || data.localModelIsGenerating === true
    || (Array.isArray(data._activeGenerations) && data._activeGenerations.length > 0)
    || (Array.isArray(data.localModelActiveGenerations) && data.localModelActiveGenerations.length > 0)
    || ["QUEUED", "IN_PROGRESS"].includes(String(data.progressStatus || "").toUpperCase());
  if (generating) return "generating";
  if (data.activeResultUrl || data.url || data.localModelUrl || data.videoUrl || data.audioUrl
    || (Array.isArray(data.taskResultList) && data.taskResultList.length > 0)
    || (Array.isArray(data.localModelResultList) && data.localModelResultList.length > 0)) {
    return "ready";
  }
  if (data.generateError || String(data.progressStatus || "").toUpperCase() === "FAILED") return "failed";
  return "empty";
}

function buildMediaQuery(args) {
  const params = new URLSearchParams();
  params.set("nodeId", String(args.nodeId || ""));
  if (args.which) params.set("which", String(args.which));
  if (args.maxImages != null) params.set("maxImages", String(args.maxImages));
  if (args.maxEdge != null) params.set("maxEdge", String(args.maxEdge));
  if (args.includeImages != null) params.set("includeImages", String(args.includeImages));
  if (args.wait != null) params.set("wait", String(args.wait));
  if (args.timeoutMs != null) params.set("timeoutMs", String(args.timeoutMs));
  return `/api/canvas/media?${params.toString()}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampWaitTimeout(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 90_000;
  return Math.min(180_000, Math.max(5_000, Math.round(numeric)));
}

function mediaToolContent(res) {
  const images = Array.isArray(res.images) ? res.images : [];
  const content = [
    {
      type: "text",
      text: JSON.stringify(
        {
          success: true,
          nodeId: res.nodeId,
          type: res.type,
          status: res.status,
          title: res.title,
          prompt: res.prompt,
          sourceUrl: res.sourceUrl,
          previewKind: res.previewKind,
          videoUrl: res.videoUrl,
          playableUrl: res.playableUrl,
          localPath: res.localPath,
          message: res.message,
          imageCount: images.length,
        },
        null,
        2,
      ),
    },
  ];
  for (const image of images) {
    if (!image?.data || !image?.mimeType) continue;
    content.push({
      type: "image",
      data: image.data,
      mimeType: image.mimeType,
    });
  }
  return { content };
}

const TOOLS = [
  {
    name: "canvas_get_status",
    description: "检查 MirrorDraw 客户端运行状态及当前是否有已打开的画布窗口。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "canvas_get_snapshot",
    description: "获取 MirrorDraw 当前打开画布的完整快照，包含全部节点、参数、连线拓扑与视口位置。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "canvas_get_summary",
    description: "获取当前画布的高层次概览（节点数量、类型分布、已有节点的简要标题与提示词），适合在进行生成决策前快速摸底。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "canvas_get_map",
    description: "获取当前画布的工作流拓扑骨架图（Canvas DSL）。以极低 Token 消耗直观呈现全部节点的流转链路（如剧本→拆分→生图→生视频）、分组归属及独立节点，在做全局规划或排版决策前首选使用。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "canvas_find_nodes",
    description: "在当前画布中按关键词、节点类型、生成状态或分区精准检索节点。适合在大画布中快速定位目标卡片，避免拉取全量快照消耗大量 Token。检索到目标节点后可配合 canvas_focus_node 将视口平移并对焦高亮。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "关键词模糊匹配（搜索标题、提示词、对话、便签、模型等）" },
        nodeType: { type: "string", description: "按节点类型过滤，例如 videoV2 / imageV2 / screenplay / scriptSplit", enum: CANVAS_NODE_TYPES },
        status: { type: "string", description: "按任务生成状态过滤", enum: ["ready", "generating", "failed", "empty"] },
        groupId: { type: "string", description: "限定在指定分区节点 ID 内检索" },
        limit: { type: "number", description: "最多返回多少个匹配节点，默认 20，最大 100" },
      },
    },
  },
  {
    name: "canvas_create_node",
    description: "在当前 MirrorDraw 画布中创建一个新节点。支持生图、生视频、剧本分镜、文本、分组等多种类型。",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "节点类型。不确定时先调用 canvas_list_node_types。常用：image/imageV2 生图，video/videoV2 生视频，screenplay 剧本，scriptSplit 剧本拆分，text 文本，group 分区，voiceV2 音频。",
          enum: CANVAS_NODE_TYPES,
        },
        position: {
          type: "object",
          description: "节点在画布中的坐标 { x, y }。若未提供，系统将自动在视口或空白区域智能排版放置。",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
        },
        data: NODE_DATA_SCHEMA,
      },
      required: ["type"],
    },
  },
  {
    name: "canvas_batch_create_nodes",
    description: "批量创建多个节点（推荐用于剧本生成整套分镜、多个并行画面等场景，往返效率极高）。",
    inputSchema: {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          description: "待创建的节点列表",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: CANVAS_NODE_TYPES },
              position: {
                type: "object",
                properties: { x: { type: "number" }, y: { type: "number" } },
              },
              data: NODE_DATA_SCHEMA,
            },
            required: ["type"],
          },
        },
      },
      required: ["nodes"],
    },
  },
  {
    name: "canvas_connect_nodes",
    description: "在画布中两个节点之间建立连线（用于数据流依赖、参考图传递、工作流管线）。",
    inputSchema: {
      type: "object",
      properties: {
        sourceNodeId: { type: "string", description: "源节点 ID" },
        targetNodeId: { type: "string", description: "目标节点 ID" },
        sourceHandle: { type: "string", description: "源输出端点，如 output" },
        targetHandle: { type: "string", description: "目标输入端点，如 input" },
        frameRole: {
          type: "string",
          enum: ["firstFrame", "lastFrame", "reference"],
          description: "仅图片 -> 视频连线有效，写入 edge.data.frameRole。firstFrame 首帧、lastFrame 尾帧、reference 普通参考。不传则按连接顺序推断（第 1 张首帧、第 2 张尾帧）。首帧上游尚无结果时视频节点拒绝生成。",
        },
      },
      required: ["sourceNodeId", "targetNodeId"],
    },
  },
  {
    name: "canvas_update_node",
    description: "修改已有节点的数据（如重新设定生图提示词、修改文本、调整坐标等）。",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "要修改的节点 ID" },
        data: NODE_DATA_SCHEMA,
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
        },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "canvas_batch_update_nodes",
    description: "批量原子更新多个节点的数据或坐标（例如批量切换模型、统一设置视频比例或调整提示词）。在单次操作中原子更新，性能极高且无中间态闪烁。",
    inputSchema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          description: "待更新的节点数据列表",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string", description: "节点 ID" },
              data: NODE_DATA_SCHEMA,
              position: {
                type: "object",
                properties: { x: { type: "number" }, y: { type: "number" } },
              },
            },
            required: ["nodeId"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "canvas_auto_layout",
    description: "基于 DAG（有向依赖图）和 Sugiyama 分层算法，对画布节点进行自动平行流式排版。消除连线大角度交叉、解决卡片穿模重叠，使工作流（剧本→拆分→生图→生视频）呈现工业级整齐布局。支持 canvas_undo / canvas_revert_changeset 撤销。",
    inputSchema: {
      type: "object",
      properties: {
        nodeIds: {
          type: "array",
          items: { type: "string" },
          description: "可选。指定要排版的节点 ID 数组。如果不传，自动对画布所有顶层节点进行排版。",
        },
        direction: {
          type: "string",
          enum: ["LR", "TB"],
          description: "排版流向。LR: 从左向右（水平流式，默认且推荐）；TB: 从上到下（垂直流式）。",
        },
      },
    },
  },
  {
    name: "canvas_delete_nodes",
    description: "从画布中删除指定的一个或多个节点（及其附带的所有连线）。",
    inputSchema: {
      type: "object",
      properties: {
        nodeIds: {
          type: "array",
          items: { type: "string" },
          description: "待删除的节点 ID 数组",
        },
      },
      required: ["nodeIds"],
    },
  },
  {
    name: "canvas_focus_node",
    description: "在 MirrorDraw 画布中平移视口，聚焦并高亮选中指定的节点。当用户询问某个节点在什么位置、放哪里了、或需要引导用户查看某个节点时调用。",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "目标节点 ID" },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "canvas_undo",
    description: "撤销画布上一次由 Agent 或用户执行的修改操作（回滚到修改前的状态）。在批量生成不理想或需要撤销最近改动时，调用此工具即可一键恢复画布。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "canvas_revert_changeset",
    description: "精准回退 Agent 最近一次（或指定 changesetId）的批量修改事务。精确拔除由该批次创建的节点和连线、并将被该批次修改的节点原地还原，绝不破坏用户在此期间于其他节点进行的手动编辑。",
    inputSchema: {
      type: "object",
      properties: {
        changesetId: { type: "string", description: "可选。指定要撤销回滚的变更集 ID。如果不填，默认撤销最近一次 Agent 批次。" },
      },
    },
  },
  {
    name: "canvas_lint",
    description: "对当前画布进行静态规则检查与自愈诊断（遵循 Codex Linter 规范）。检查项包括：悬挂死连线、循环依赖回路、空提示词/无上游输入的生成节点、已废弃节点类型、非法分辨率或比例格式等，并给出结构化自愈建议。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "canvas_get_context",
    description: "获取当前项目的世界观基调（Creative Brief）、已知登场角色清单（含名字、设定小传与人脸参考图）、以及项目风格记忆（Memories）。在生成连续分镜、新角色或设计提示词前调用，可确保人物与视觉高度连贯。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "canvas_list_models",
    description: "列出当前客户端某类节点可用的模型表：modelKey、显示名、可填参数 params（含 options/默认值）和素材输入。必须传 nodeType，不要一次拉全表。创建生成节点前先查。",
    inputSchema: {
      type: "object",
      properties: {
        nodeType: { type: "string", description: "必须。按节点类型过滤，常用 imageV2 / videoV2 / voiceV2 / music / model3dGenerator", enum: CANVAS_NODE_TYPES },
        modelKey: { type: "string", description: "只返回这一个模型的参数表" },
        domain: { type: "string", description: "按 domain 过滤，如 image / video / audio / 3d" },
        includeHidden: { type: "boolean", description: "是否包含 hidden 参数，默认 false" },
      },
    },
  },
  {
    name: "canvas_list_plugins",
    description: "列出客户端已安装的本地插件及其节点：pluginId、pluginNodeType、输入 kind、输出 kind、参数表（field 即写入 data 的 p_<key>）。创建 plugin 节点前先查，不要猜 pluginId。",
    inputSchema: {
      type: "object",
      properties: {
        pluginId: { type: "string", description: "只返回这一个插件" },
      },
    },
  },
  {
    name: "canvas_configure_model",
    description: "为 MirrorDraw 配置或更新本地/私有 AI 模型。支持直接传入 cURL 命令行自动智能解析，或显式传入 modelKey, url, apiKey 等参数。配置后可在生图、生视频、对话等节点中直接调用该模型，无需平台中转。",
    inputSchema: {
      type: "object",
      properties: {
        curl: { type: "string", description: "调试用的 cURL 命令行或 HTTP 请求文本。传入后系统自动解析 URL、Token、模型名、参数映射与输入格式" },
        modelKey: { type: "string", description: "模型唯一标识（如 local-deepseek-chat 或 local-flux-schnell）。如果不填且提供了 curl，会自动生成" },
        displayName: { type: "string", description: "在画布和模型选择器中展示的名称" },
        domain: { type: "string", description: "模型领域", enum: ["image", "video", "audio", "text", "3d"] },
        inputMode: { type: "string", description: "输入模式，如 text-to-image / image-to-image / chat / text-to-video / image-to-video" },
        url: { type: "string", description: "模型接口请求地址 (HTTP 或 HTTPS)" },
        apiKey: { type: "string", description: "调用该模型所用的 API Key / 鉴权令牌" },
        modelName: { type: "string", description: "发送给服务端的实际模型名 (如 deepseek-chat 或 flux-schnell)" },
        imageInputMode: { type: "string", description: "图片输入方式（仅图像/视频模型）：url(公网URL，默认) / base64(本地Base64 DataURL，离线可用) / base64_raw(纯Base64字符串)", enum: ["url", "base64", "base64_raw"] },
        enabled: { type: "boolean", description: "是否立即启用模型，默认 true" },
      },
    },
  },
  {
    name: "canvas_delete_model",
    description: "从 MirrorDraw 客户端中删除指定的本地 AI 模型",
    inputSchema: {
      type: "object",
      properties: {
        modelKey: { type: "string", description: "要删除的本地模型 modelKey" },
      },
      required: ["modelKey"],
    },
  },
  {
    name: "canvas_list_node_types",
    description: "列出画布节点说明书：用途、何时用/别用、关键字段、上下游。创建节点前先查这个。可用 type 只查一种，includeDeprecated=true 才包含遗留类型。",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "只返回这一种节点的说明书", enum: CANVAS_NODE_TYPES },
        includeDeprecated: { type: "boolean", description: "是否包含遗留/不要新建的节点，默认 false" },
      },
    },
  },
  {
    name: "canvas_get_playbook",
    description: "获取外部 Agent 操作手册：首选节点、硬规则、常用工作流配方。开始改画布前应先读。",
    inputSchema: {
      type: "object",
      properties: {
        recipeId: {
          type: "string",
          description: "只返回某一条配方。不传则返回完整手册。",
          enum: ["text-to-image", "image-to-video", "screenplay-to-shots", "reverse-then-generate", "3d-stage", "video-clip"],
        },
      },
    },
  },
  {
    name: "canvas_get_node_media",
    description: "读取当前画布某个节点的结果画面，并以 MCP image 回传给 Agent 显示。图片回结果图；视频回封面/首帧。成片不塞进对话，回执带 playableUrl/localPath。要点播放成片请再用 canvas_open_node_media。",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "节点 ID" },
        which: {
          type: "string",
          description: "latest=当前主图（默认）；all=最多 maxImages 张；也可传节点上已有的完整 url",
        },
        maxImages: {
          type: "number",
          description: "which=all 时最多回传几张，默认 1，最大 4",
        },
        maxEdge: {
          type: "number",
          description: "给 Agent 看的缩略图最长边，默认 1280，范围 256-2048",
        },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "canvas_wait_node_result",
    description: "等待指定节点生成结束，成功时以 MCP image 回传结果画面。图片回结果图，视频回封面/首帧。要播成片再用 canvas_open_node_media。trigger 之后用这个，不要只看 applied:true。",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "节点 ID" },
        timeoutMs: {
          type: "number",
          description: "最长等待毫秒，默认 90000，范围 5000-180000",
        },
        includeImage: {
          type: "boolean",
          description: "完成后是否回传图片，默认 true",
        },
        which: { type: "string", description: "同 canvas_get_node_media" },
        maxImages: { type: "number" },
        maxEdge: { type: "number" },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "canvas_open_node_media",
    description: "在 MirrorDraw 画布里打开节点媒体预览。图片全屏看图；视频打开播放器，可点击播放成片。不要把成片当 MCP image 回传。通常只传 nodeId。不要传 file://。",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "节点 ID" },
        url: { type: "string", description: "可选。不传则打开节点当前成片。只接受 https 或 mirrordraw-local://，不要传 file://" },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "canvas_trigger_node_task",
    description: "触发指定节点开始生成/执行任务（生图、生视频、音频等）。",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "要执行的节点 ID" },
        nodeType: { type: "string", description: "节点类型，建议与快照中的 type 一致", enum: CANVAS_NODE_TYPES },
      },
      required: ["nodeId", "nodeType"],
    },
  },
  {
    name: "canvas_run_group_nodes",
    description: "批量执行某个分区（group）内的可生成节点。按分区内连线依赖调度：上游节点产出新结果后才触发下游；上游失败则下游阻塞不跑；分区外的上游正在运行或排在其他分区执行中时先等它；无依赖的节点同时触发。返回只表示已开始调度，用 canvas_wait_node_result 等结果。同一分区执行中再次调用会报错。",
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "分区节点 ID" },
        mode: { type: "string", enum: ["resume", "rerun"], description: "resume（默认）跳过已有结果且无报错的节点；rerun 全部重跑" },
      },
      required: ["groupId"],
    },
  },
  {
    name: "canvas_ungroup_node",
    description: "解散指定分区，子节点回到画布顶层。",
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "要解散的分区节点 ID" },
      },
      required: ["groupId"],
    },
  },
  {
    name: "canvas_batch_update_positions",
    description: "批量移动多个节点的坐标，适合自动排版。",
    inputSchema: {
      type: "object",
      properties: {
        positions: {
          type: "array",
          description: "节点坐标列表",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
            },
            required: ["nodeId", "x", "y"],
          },
        },
      },
      required: ["positions"],
    },
  },
  {
    name: "canvas_open_workbench",
    description: "打开节点工作台。screenplay 打开写作台；director3d 进入 3D 片场；videoClip 进入剪辑时间线。进片场或剪辑后画布会切走，下一步遥控要等页面打开。",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "节点 ID" },
        kind: { type: "string", enum: ["screenplay", "director3d", "videoClip"], description: "不传则按节点类型判断" },
        stage: {
          type: "string",
          enum: ["brief", "logline", "synopsis", "bible", "outline", "scenes", "branches", "draft"],
          description: "仅写作台：打开后落在哪个阶段",
        },
      },
      required: ["nodeId"],
    },
  },
  {
    name: "canvas_screenplay_run",
    description: "遥控当前已打开的写作台。先 canvas_open_workbench。kind: setStage / runAiAction / applyPreview / discardPreview / applyStageText / updateBrief / branchifyScene / save / export。applyPreview 可带 mode=replace|append。export.format: fountain / md / aips / print。AI 动作白名单：refineCreativeBrief、generateStoryArchitecture、extractAdaptationStructure、generateLogline、expandSynopsis、generateBeats、buildBible、generateOutline、generateScenes、generateChapterDraft、discussChapterDraft、polishDraft、polishSelection、diagnoseStructure、diagnoseScenes、diagnoseCharacters、diagnoseDialogue、reviseCurrentStage、identifyDecisionPoints、proposeChoices、graftBranch、extractVariablesAndProps、deriveStoryFromAtlas、designEvents。",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["setStage", "runAiAction", "applyPreview", "discardPreview", "applyStageText", "updateBrief", "branchifyScene", "save", "export"],
        },
        stage: { type: "string", enum: ["brief", "logline", "synopsis", "bible", "outline", "scenes", "branches", "draft"] },
        action: { type: "string", description: "runAiAction 的动作名" },
        revisionInstruction: { type: "string" },
        chapterId: { type: "string" },
        text: { type: "string", description: "applyStageText 的正文" },
        sceneRef: { type: "string", description: "branchifyScene 的场次号、标题或 sceneId" },
        intent: { type: "string" },
        mode: { type: "string", enum: ["replace", "append"], description: "applyPreview / branchifyScene" },
        format: { type: "string", enum: ["fountain", "md", "aips", "print"], description: "export 格式" },
        patch: {
          type: "object",
          description: "updateBrief 的字段",
          properties: {
            premise: { type: "string" },
            genres: { type: "array", items: { type: "string" } },
            audience: { type: "string" },
            tone: { type: "string" },
            lengthHint: { type: "string" },
            notes: { type: "string" },
            title: { type: "string" },
          },
        },
      },
      required: ["kind"],
    },
  },
  {
    name: "canvas_director3d_run",
    description: "遥控当前已打开的 3D 导演台。先 canvas_open_workbench kind=director3d。kind: selectObject / selectObjects / addToSelection / deleteObject / deleteObjects / duplicateObject / addObject / addObjects / addLibraryModel / setTransform / setObjectProps / setShape / alignObjects / setParent / setActiveCamera / setEnvironment / addCameraMove / screenshot / undo / redo。objectKind: box/sphere/capsule/plane/cylinder/cone/torus/tree/leafy-tree/bush/rock/mountain/cloud/car/house/building/character/camera/light。",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "selectObject", "selectObjects", "addToSelection",
            "deleteObject", "deleteObjects", "duplicateObject",
            "addObject", "addObjects", "addLibraryModel",
            "setTransform", "setObjectProps", "setShape",
            "alignObjects", "setParent", "setActiveCamera",
            "setEnvironment", "addCameraMove", "screenshot", "undo", "redo",
          ],
        },
        objectId: { type: "string" },
        objectIds: { type: "array", items: { type: "string" } },
        objectKind: {
          type: "string",
          description: "addObject 的种类",
          enum: [
            "box", "sphere", "capsule", "plane", "cylinder", "cone", "torus",
            "tree", "leafy-tree", "bush", "rock", "mountain", "cloud",
            "car", "house", "building", "character", "camera", "light",
          ],
        },
        name: { type: "string" },
        visible: { type: "boolean" },
        locked: { type: "boolean" },
        cameraId: { type: "string" },
        targetObjectId: { type: "string" },
        parentId: { type: "string", description: "setParent 的父对象。省略或空字符串表示解除挂载" },
        axis: { type: "string", enum: ["x", "y", "z"] },
        mode: { type: "string", enum: ["min", "center", "max", "distribute"] },
        moveKind: {
          type: "string",
          enum: ["orbit", "dolly-in", "pull-back", "dolly-zoom", "crane", "flyby", "spiral", "reveal", "pan", "tracking", "top-down", "hero-low", "contra-zoom"],
        },
        preset: { type: "string", enum: ["studio", "daylight", "night", "neutral"] },
        backgroundColor: { type: "string" },
        position: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        rotation: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        scale: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        durationMs: { type: "number", description: "addCameraMove 时长，毫秒，建议 3000-15000" },
        modelId: { type: "string", description: "addLibraryModel 的模型库 ID" },
        objects: { type: "array", items: { type: "object" } },
        projectId: { type: "string", description: "可选。校验当前片场工程，必须是画布 projectId，不要传 scene= 场景 ID" },
        radialSegments: { type: "number", description: "setShape：径向分段 3-128" },
        heightSegments: { type: "number", description: "setShape：高度分段 1-128" },
        topRadiusRatio: { type: "number", description: "setShape：顶部半径比 0-1" },
        tubeRatio: { type: "number", description: "setShape：圆环管粗 0.02-1" },
        thickness: { type: "number", description: "setShape：厚度 0-1" },
        arrayCount: { type: "number", description: "setShape：阵列数量 1-64；设间距/抖动前需 ≥2" },
        arrayOffset: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3, description: "setShape：阵列偏移 [x,y,z]" },
        jitterPosition: { type: "number", description: "setShape：位置抖动 0-10" },
        jitterRotation: { type: "number", description: "setShape：旋转抖动 0-180" },
        jitterScale: { type: "number", description: "setShape：缩放抖动 0-1" },
        jitterSeed: { type: "number", description: "setShape：抖动种子 0-9999" },
        mirrorAxes: { type: "array", items: { type: "string", enum: ["x", "y", "z"] }, description: "setShape：镜像轴；空数组取消镜像。复合图元不支持" },
        direction: { type: "string", enum: ["clockwise", "counterclockwise"], description: "addCameraMove：环绕方向" },
        intensity: { type: "string", enum: ["subtle", "normal", "dramatic"], description: "addCameraMove：运镜幅度" },
        orbitDegrees: { type: "number", description: "addCameraMove：仅 orbit/spiral/hero-low。orbit/hero-low 15-360，spiral 90-1080" },
        elevation: { type: "string", enum: ["rise", "descend"], description: "addCameraMove：仅 crane/spiral" },
        shake: { type: "string", enum: ["none", "subtle", "handheld"], description: "addCameraMove：抖动" },
      },
      required: ["kind"],
      additionalProperties: true,
    },
  },
  {
    name: "canvas_video_clip_run",
    description: "遥控当前已打开的剪辑时间线。先 canvas_open_workbench kind=videoClip。kind: play / pause / stop / seek / split / deleteSelected / selectAll / undo / redo / snapshot / addTrack / addMedia / setTrim / setSpeed / setVolume / addText / addSubtitle / fadeIn / fadeOut / addEffect。先 snapshot 拿 trackId / elementId / mediaId。addMedia 只用已导入 mediaId。setTrim 用 inSeconds/outSeconds 或 trimStartSeconds/trimEndSeconds。fadeIn/fadeOut 是片段透明度关键帧，不是独立转场。addEffect 目前只有 blur。没有 dissolve/wipe，也没有亮度对比度调色。导出仍非 MCP。",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "play", "pause", "stop", "seek", "split", "deleteSelected", "selectAll", "undo", "redo", "snapshot",
            "addTrack", "addMedia", "setTrim", "setSpeed", "setVolume", "addText", "addSubtitle", "fadeIn", "fadeOut", "addEffect",
          ],
        },
        seconds: { type: "number", description: "seek 的绝对时间，单位秒" },
        trackType: { type: "string", enum: ["video", "text", "audio", "graphic", "effect"], description: "addTrack 的轨道类型" },
        index: { type: "number", description: "addTrack 可选插入位置，0-64" },
        mediaId: { type: "string", description: "addMedia：已导入素材 ID。先 snapshot 看 assets" },
        trackId: { type: "string", description: "addMedia / addText / addSubtitle 可选目标轨道。addSubtitle 传入已有 text 轨则追加字幕，不传则新建字幕轨" },
        elementId: { type: "string", description: "setTrim / setSpeed / setVolume / fadeIn / fadeOut / addEffect 的片段 ID" },
        startSeconds: { type: "number", description: "addMedia / addText / addSubtitle 的时间线上起点，秒" },
        durationSeconds: { type: "number", description: "addText / addSubtitle / fadeIn / fadeOut 时长，秒" },
        inSeconds: { type: "number", description: "setTrim：片源入点，秒" },
        outSeconds: { type: "number", description: "setTrim：片源出点，秒，必须大于 inSeconds" },
        trimStartSeconds: { type: "number", description: "setTrim：片源头裁掉多少秒" },
        trimEndSeconds: { type: "number", description: "setTrim：片源尾裁掉多少秒" },
        rate: { type: "number", description: "setSpeed：0.01-5" },
        maintainPitch: { type: "boolean", description: "setSpeed：是否保调" },
        volumeDb: { type: "number", description: "setVolume：-60 到 20 dB" },
        muted: { type: "boolean", description: "setVolume：静音" },
        text: { type: "string", description: "addText / addSubtitle 正文" },
        captions: {
          type: "array",
          description: "addSubtitle 多条字幕。每项 text + startSeconds + durationSeconds",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              startSeconds: { type: "number" },
              durationSeconds: { type: "number" },
            },
          },
        },
        effectType: { type: "string", enum: ["blur"], description: "addEffect 目前只支持 blur" },
        intensity: { type: "number", description: "addEffect blur 强度 0-100" },
      },
      required: ["kind"],
      additionalProperties: true,
    },
  },
];

// ==================== MCP Tool 调度实现 ====================

async function handleToolCall(name, args) {
  switch (name) {
    case "canvas_get_status": {
      const res = await callMirrorDrawApi("GET", "/api/status");
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
      };
    }

    case "canvas_get_snapshot": {
      const res = await callMirrorDrawApi("GET", "/api/canvas/snapshot");
      return {
        content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }],
      };
    }

    case "canvas_get_summary": {
      const res = await callMirrorDrawApi("GET", "/api/canvas/snapshot");
      const data = res.data || {};
      const nodes = data.nodes || [];
      const edges = data.edges || [];

      const typeCounts = {};
      const nodeSummaries = nodes.map((n) => {
        typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
        return {
          id: n.id,
          type: n.type,
          title: n.data?.title || n.data?.label || "(未命名)",
          prompt: n.data?.img2imgPrompt || n.data?.prompt || n.data?.content || undefined,
          model: n.data?.img2imgModel || n.data?.model || undefined,
          outputSize: n.data?.outputSize || undefined,
          img2imgAspectRatio: n.data?.img2imgAspectRatio || undefined,
          ratio: n.data?.ratio || undefined,
          negativePrompt: n.data?.negativePrompt || undefined,
          mediaStatus: summarizeMediaStatus(n),
          hasPreview: Boolean(n.data?.activeResultUrl || n.data?.url || n.data?.localModelUrl || n.data?.videoUrl),
          position: n.position,
        };
      });

      const summary = {
        projectId: data.projectId,
        projectName: data.projectName,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodeTypeDistribution: typeCounts,
        viewport: data.viewport,
        canvasMap: data.canvasMap,
        flows: data.flows,
        diagnosticsSummary: data.diagnostics?.summary,
        charactersCount: data.context?.characters?.length ?? 0,
        nodes: nodeSummaries,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    }

    case "canvas_get_map": {
      const res = await callMirrorDrawApi("GET", "/api/canvas/snapshot");
      const data = res.data || {};
      const canvasMap = data.canvasMap || (data.nodes ? `### Canvas Map (节点: ${data.nodes.length} | 连线: ${(data.edges || []).length})\n(暂无拓扑图)` : "画布为空");
      return {
        content: [{ type: "text", text: canvasMap }],
      };
    }

    case "canvas_find_nodes": {
      let data = null;
      try {
        const res = await callMirrorDrawApi("POST", "/api/canvas/nodes/find", {
          query: args.query,
          nodeType: args.nodeType,
          status: args.status,
          groupId: args.groupId,
          limit: args.limit,
        });
        data = res.data || res;
      } catch (err) {
        // 若端点未就绪或未重启，优雅降级为在快照上直接进行精准过滤
        const snapshotRes = await callMirrorDrawApi("GET", "/api/canvas/snapshot");
        const snap = snapshotRes.data || {};
        const nodes = snap.nodes || [];
        const keyword = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
        const wantedType = typeof args.nodeType === "string" ? args.nodeType.trim() : "";
        const wantedStatus = typeof args.status === "string" ? args.status.trim().toLowerCase() : "";
        const wantedGroup = typeof args.groupId === "string" ? args.groupId.trim() : "";
        const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

        const matched = nodes.filter((n) => {
          if (!n || typeof n.id !== "string") return false;
          const type = n.type || "default";
          const d = n.data && typeof n.data === "object" ? n.data : {};
          if (wantedType && type !== wantedType) return false;
          if (wantedGroup && n.parentId !== wantedGroup) return false;
          if (wantedStatus && summarizeMediaStatus(n) !== wantedStatus) return false;
          if (keyword) {
            const haystack = [n.id, type, d.title, d.label, d.name, d.prompt, d.img2imgPrompt, d.content, d.lyricsText, d.text, d.model]
              .filter(Boolean)
              .join("\n")
              .toLowerCase();
            if (!haystack.includes(keyword)) return false;
          }
          return true;
        });

        data = {
          total: matched.length,
          count: Math.min(matched.length, limit),
          nodes: matched.slice(0, limit).map((n) => ({
            id: n.id,
            type: n.type,
            title: n.data?.title || n.data?.label || n.data?.name || undefined,
            prompt: n.data?.img2imgPrompt || n.data?.prompt || n.data?.content || undefined,
            model: n.data?.img2imgModel || n.data?.model || undefined,
            outputSize: n.data?.outputSize || n.data?.ratio || undefined,
            status: summarizeMediaStatus(n),
            parentId: n.parentId,
            position: n.position,
            hasMedia: Boolean(n.data?.activeResultUrl || n.data?.url || n.data?.localModelUrl || n.data?.videoUrl),
            activeUrl: n.data?.activeResultUrl || n.data?.url || n.data?.localModelUrl || n.data?.videoUrl || undefined,
          })),
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    case "canvas_create_node": {
      const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nodePayload = {
        id: nodeId,
        type: args.type,
        data: parseToolObject(args.data, "data"),
        ...(args.position ? { position: args.position } : {}),
      };

      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "addNode",
          payload: { node: nodePayload },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Successfully created ${args.type} node`,
              nodeId,
              node: nodePayload,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_batch_create_nodes": {
      const createdNodes = [];
      const actions = [];
      const nodesInput = args.nodes || [];

      for (let i = 0; i < nodesInput.length; i++) {
        const item = nodesInput[i];
        const nodeId = `node_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        const nodePayload = {
          id: nodeId,
          type: item.type,
          data: parseToolObject(item.data, "data"),
          ...(item.position ? { position: item.position } : {}),
        };
        createdNodes.push(nodePayload);
        actions.push({
          surface: "canvas",
          op: "addNode",
          payload: { node: nodePayload },
        });
      }

      const res = await callMirrorDrawApi("POST", "/api/canvas/batch-actions", { actions });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              createdCount: createdNodes.length,
              nodes: createdNodes,
              result: res.results,
            }),
          },
        ],
      };
    }

    case "canvas_connect_nodes": {
      const edgeId = `edge_${args.sourceNodeId}_${args.targetNodeId}_${Date.now()}`;
      const edgePayload = {
        id: edgeId,
        source: args.sourceNodeId,
        target: args.targetNodeId,
        type: "editable",
        sourceHandle: args.sourceHandle || "output",
        targetHandle: args.targetHandle || "input",
        ...(["firstFrame", "lastFrame", "reference"].includes(args.frameRole) ? { data: { frameRole: args.frameRole } } : {}),
      };

      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "addEdge",
          payload: { edge: edgePayload },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Connected ${args.sourceNodeId} -> ${args.targetNodeId}`,
              edgeId,
              edge: edgePayload,
            }),
          },
        ],
      };
    }

    case "canvas_update_node": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "updateNode",
          payload: {
            nodeId: args.nodeId,
            data: parseToolObject(args.data, "data"),
            ...(args.position ? { position: args.position } : {}),
          },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              nodeId: args.nodeId,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_batch_update_nodes": {
      const updates = (args.updates || []).map((item) => ({
        nodeId: item.nodeId,
        data: parseToolObject(item.data, "data"),
        position: item.position,
      }));
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "batchUpdateNodes",
          payload: { updates },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              count: updates.length,
              result: res.result,
            }, null, 2),
          },
        ],
      };
    }

    case "canvas_auto_layout": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "autoLayout",
          payload: {
            nodeIds: args.nodeIds,
            direction: args.direction || "LR",
          },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              direction: args.direction || "LR",
              result: res.result,
            }, null, 2),
          },
        ],
      };
    }

    case "canvas_delete_nodes": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "deleteNodes",
          payload: {
            nodeIds: args.nodeIds || [],
          },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              deletedNodeIds: args.nodeIds,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_focus_node": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          op: "focusNode",
          nodeId: args.nodeId,
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              focusedNodeId: args.nodeId,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_undo": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "undo",
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              undone: true,
              message: "已撤销画布上一次修改操作。",
              result: res.result,
            }, null, 2),
          },
        ],
      };
    }

    case "canvas_revert_changeset": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "revertChangeset",
          payload: { changesetId: args.changesetId },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              reverted: true,
              message: "已精准回滚 Agent 变更集事务。",
              result: res.result,
            }, null, 2),
          },
        ],
      };
    }

    case "canvas_lint": {
      const res = await callMirrorDrawApi("GET", "/api/canvas/snapshot");
      const data = res.data || {};
      const diagnostics = data.diagnostics || {
        valid: true,
        errorsCount: 0,
        warningsCount: 0,
        diagnostics: [],
        summary: "未发现明显拓扑或配置异常",
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              valid: diagnostics.valid,
              errorsCount: diagnostics.errorsCount,
              warningsCount: diagnostics.warningsCount,
              summary: diagnostics.summary,
              diagnostics: diagnostics.diagnostics,
            }, null, 2),
          },
        ],
      };
    }

    case "canvas_get_context": {
      const res = await callMirrorDrawApi("GET", "/api/canvas/snapshot");
      const data = res.data || {};
      const context = data.context || {
        projectId: data.projectId,
        projectName: data.projectName,
        brief: undefined,
        characters: [],
        activeStyleRules: [],
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              projectId: context.projectId,
              projectName: context.projectName,
              brief: context.brief || "未提供剧本/世界观设定",
              characters: context.characters || [],
              activeStyleRules: context.activeStyleRules || [],
            }, null, 2),
          },
        ],
      };
    }

    case "canvas_list_models": {
      if (!args.nodeType) throw new Error("canvas_list_models 必须传 nodeType，例如 imageV2 / videoV2 / voiceV2");
      const params = new URLSearchParams();
      if (args.nodeType) params.set("nodeType", String(args.nodeType));
      if (args.modelKey) params.set("modelKey", String(args.modelKey));
      if (args.domain) params.set("domain", String(args.domain));
      if (args.includeHidden) params.set("includeHidden", "true");
      const query = params.toString();
      const res = await callMirrorDrawApi("GET", `/api/canvas/models${query ? `?${query}` : ""}`);
      const catalog = res.data || res;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(catalog, null, 2),
          },
        ],
      };
    }

    case "canvas_list_plugins": {
      const params = new URLSearchParams();
      if (args.pluginId) params.set("pluginId", String(args.pluginId));
      const query = params.toString();
      const res = await callMirrorDrawApi("GET", `/api/canvas/plugins${query ? `?${query}` : ""}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data || res, null, 2),
          },
        ],
      };
    }

    case "canvas_configure_model": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/models/configure", args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data || res, null, 2),
          },
        ],
      };
    }

    case "canvas_delete_model": {
      if (!args.modelKey) throw new Error("canvas_delete_model 必须传 modelKey");
      const res = await callMirrorDrawApi("POST", "/api/canvas/models/delete", { modelKey: args.modelKey });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data || res, null, 2),
          },
        ],
      };
    }

    case "canvas_list_node_types": {
      const includeDeprecated = Boolean(args.includeDeprecated);
      const wanted = args.type ? [args.type] : CANVAS_NODE_TYPES;
      const types = wanted
        .map((type) => getNodeTypeEntry(type))
        .filter((entry) => includeDeprecated || !entry.deprecated);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                preferred: PREFERRED_NODE_TYPES,
                types,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "canvas_get_playbook": {
      const recipeId = args.recipeId;
      const payload = recipeId
        ? {
            rules: AGENT_PLAYBOOK.rules,
            preferred: AGENT_PLAYBOOK.preferred,
            recipe: AGENT_PLAYBOOK.recipes.find((recipe) => recipe.id === recipeId) || null,
          }
        : AGENT_PLAYBOOK;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }

    case "canvas_get_node_media": {
      if (!args.nodeId) throw new Error("Missing nodeId");
      const res = await callMirrorDrawApi("GET", buildMediaQuery(args), undefined, 25000);
      return mediaToolContent(res);
    }

    case "canvas_wait_node_result": {
      if (!args.nodeId) throw new Error("Missing nodeId");
      const timeoutMs = clampWaitTimeout(args.timeoutMs);
      const includeImage = args.includeImage !== false;
      const started = Date.now();
      let last = null;

      // 1. 优先使用事件驱动长连接（Push-driven Long Wait），毫秒级唤醒，消灭轮询风暴
      try {
        last = await callMirrorDrawApi(
          "GET",
          buildMediaQuery({ ...args, wait: true, timeoutMs, includeImages: false }),
          undefined,
          timeoutMs + 4000,
        );
      } catch {
        // 网络抖动或超时降级
      }

      // 2. 若长连接未就绪或仍处于 generating，平滑回退
      while ((!last || last.status === "generating") && Date.now() - started < timeoutMs) {
        last = await callMirrorDrawApi(
          "GET",
          buildMediaQuery({ ...args, includeImages: false }),
          undefined,
          10000,
        );
        if (last.status === "ready" || last.status === "failed") break;
        const remaining = timeoutMs - (Date.now() - started);
        if (remaining <= 0) break;
        await sleep(Math.min(2500, remaining));
      }
      if (!last) throw new Error("等待生成结果失败");
      if (includeImage && last.status === "ready") {
        last = await callMirrorDrawApi("GET", buildMediaQuery(args), undefined, 25000);
      }
      if (last.status === "generating" && !last.message) {
        last = { ...last, message: "仍在生成，已到等待上限，请稍后再取" };
      }
      return mediaToolContent(last);
    }

    case "canvas_open_node_media": {
      if (!args.nodeId) throw new Error("Missing nodeId");
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "openNodeMedia",
          payload: {
            nodeId: args.nodeId,
            url: args.url,
          },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              nodeId: args.nodeId,
              url: args.url,
              opened: true,
              message: "已在画布打开媒体预览。视频可直接点击播放成片。",
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_trigger_node_task": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "triggerNodeTask",
          payload: {
            nodeId: args.nodeId,
            nodeType: args.nodeType,
          },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              nodeId: args.nodeId,
              nodeType: args.nodeType,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_run_group_nodes": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "runGroupNodes",
          payload: {
            groupId: args.groupId,
            mode: args.mode || "resume",
          },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              groupId: args.groupId,
              mode: args.mode || "resume",
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_ungroup_node": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "ungroupNode",
          payload: {
            groupId: args.groupId,
          },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              groupId: args.groupId,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_batch_update_positions": {
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "batchUpdatePositions",
          payload: {
            positions: args.positions || [],
          },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              count: Array.isArray(args.positions) ? args.positions.length : 0,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_open_workbench": {
      if (!args.nodeId) throw new Error("Missing nodeId");
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "canvas",
          op: "openWorkbench",
          payload: {
            nodeId: args.nodeId,
            kind: args.kind,
            stage: args.stage,
          },
        },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              nodeId: args.nodeId,
              kind: args.kind,
              stage: args.stage,
              message: args.kind === "director3d"
                ? "正在进入 3D 片场。打开后再用 canvas_director3d_run。"
                : args.kind === "videoClip"
                  ? "正在打开剪辑时间线。打开后再用 canvas_video_clip_run。"
                  : "写作台已打开。下一步用 canvas_screenplay_run。",
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_screenplay_run": {
      if (!args.kind) throw new Error("Missing kind");
      const runOp = { ...args };
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "screenplay",
          op: "runOp",
          payload: { runOp },
        },
      }, 65000);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              runOp,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_director3d_run": {
      if (!args.kind) throw new Error("Missing kind");
      const { projectId, ...runOp } = args;
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "director3d",
          op: "runOp",
          payload: { projectId, runOp },
        },
      }, 65000);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              runOp,
              result: res.result,
            }),
          },
        ],
      };
    }

    case "canvas_video_clip_run": {
      if (!args.kind) throw new Error("Missing kind");
      const runOp = { ...args };
      const res = await callMirrorDrawApi("POST", "/api/canvas/action", {
        action: {
          surface: "videoClip",
          op: "runOp",
          payload: { runOp },
        },
      }, 25000);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              runOp,
              result: res.result,
            }),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ==================== 标准 JSON-RPC 2.0 Stdio 处理 ====================
// MCP stdio 是按行分隔的 JSON（NDJSON）。Codex 的 rmcp 客户端按行 JSON.parse，
// 第一行如果是 Content-Length 就会握手失败，服务会被标成未就绪并跳过。

process.stdin.setEncoding("utf8");
let lineBuffer = "";

process.stdin.on("data", (chunk) => {
  lineBuffer += chunk;
  const lines = lineBuffer.split("\n");
  lineBuffer = lines.pop() || "";
  for (const line of lines) consumeJsonMessage(line);
});

process.stdin.on("end", () => {
  consumeJsonMessage(lineBuffer);
  process.exit(0);
});

function consumeJsonMessage(raw) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith("content-length:")) return;
  try {
    void handleMessage(JSON.parse(trimmed));
  } catch {
    // ignore malformed frames
  }
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    sendResponse({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "mirrordraw",
          version: "1.0.0",
        },
      },
    });
    return;
  }

  if (method === "notifications/initialized") {
    // 客户端确认初始化就绪
    return;
  }

  if (method === "tools/list") {
    sendResponse({
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS,
      },
    });
    return;
  }

  if (method === "tools/call") {
    const { name, arguments: toolArgs } = params || {};
    try {
      const outcome = await handleToolCall(name, toolArgs || {});
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: outcome,
      });
    } catch (err) {
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [
            {
              type: "text",
              text: `MirrorDraw Tool Execution Error: ${err.message || String(err)}`,
            },
          ],
        },
      });
    }
    return;
  }

  // 未知 RPC 方法处理
  if (id !== undefined) {
    sendResponse({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    });
  }
}

function sendResponse(response) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function sendHeartbeat() {
  if (!TOKEN) return;
  void callMirrorDrawApi("GET", "/api/status").catch(() => {});
}

sendHeartbeat();
setInterval(sendHeartbeat, 4000).unref();
