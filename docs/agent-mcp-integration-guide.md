# MirrorDraw Pro - 外部 Agent 接入

本地 Agent 只有一种接入方式：**复制 MCP 配置，粘贴到 Agent 的 MCP 设置**。

适用于 Claude Desktop、Cursor、Codex 以及任何支持 MCP 的本机 Agent。不需要安装插件，也不按产品分别配置。

---

## 怎么用

1. 打开 MirrorDraw，进入要操控的画布。
2. 点顶部 **Agent**，复制 MCP 配置。
3. 粘贴到本地 Agent 的 MCP 设置，重启该 Agent。
4. 保持画布打开，直接说要改画布。Agent 会自己发现并调用 `canvas_*` 工具。

示例：

> 帮我在 MirrorDraw 画布中创建一个四幕剧本节点，并按顺序生成分镜和生图节点并连接起来。

云端网页 Bot（豆包网页、扣子等）打不到本机 `127.0.0.1`，不在这套方式里。

---

## 工具列表

Agent 启动后通过 `tools/list` 自动获取，用户不用手填工具名。

| Tool | 作用 |
| :--- | :--- |
| `canvas_get_status` | 检查客户端与画布窗口状态 |
| `canvas_get_snapshot` | 获取完整节点、边与视口 |
| `canvas_get_summary` | 获取节点数量、类型和精简信息 |
| `canvas_get_map` | 获取工作流拓扑骨架图（Canvas DSL，低 Token 摸底拓扑链路） |
| `canvas_find_nodes` | 按关键词/类型/状态/分区精准检索节点（避免大画布拉取全量快照） |
| `canvas_list_node_types` | 节点说明书：用途、何时用、关键字段、上下游 |
| `canvas_list_models` | 当前可用模型表：modelKey、适用节点、可填参数 params、素材输入 |
| `canvas_list_plugins` | 已安装本地插件目录：pluginId、pluginNodeType、输入/输出 kind、参数表（`field` 为写入 data 的 `p_<key>`） |
| `canvas_configure_model` | 为客户端配置或更新本地/私有 AI 模型（支持直接传 cURL 命令行智能解析，或传 url/apiKey/modelName 等参数） |
| `canvas_delete_model` | 从客户端中移除指定的本地 AI 模型（需传 modelKey） |
| `canvas_get_playbook` | 操作手册：首选节点、硬规则、常用工作流 |
| `canvas_create_node` | 创建节点（含图片、视频、剧本、分镜、音频、3D、分区等） |
| `canvas_batch_create_nodes` | 批量创建节点 |
| `canvas_connect_nodes` | 连接两个节点；图片→视频可传 `frameRole`（`firstFrame` / `lastFrame` / `reference`），写入 `edge.data.frameRole`，不传则按连接顺序推断首尾帧 |
| `canvas_update_node` | 更新节点数据 |
| `canvas_batch_update_nodes` | 批量原子更新多个节点的数据或坐标（原子生效，无中间态闪烁） |
| `canvas_delete_nodes` | 删除节点 |
| `canvas_undo` | 撤销上一步修改操作（一键回退到修改前状态） |
| `canvas_revert_changeset` | 精准回滚 Agent 最近一次批量事务（只拔除/还原该批次卡片，不影响用户手动编辑） |
| `canvas_lint` | 对当前画布进行静态规则检查与自愈诊断（检测死连线/环路/空提示词/非法参数） |
| `canvas_get_context` | 获取当前项目的世界观基调（Brief）、已知角色库（含人脸参考图）与风格记忆 |
| `canvas_focus_node` | 对焦到指定节点 |
| `canvas_trigger_node_task` | 触发节点开始生成 |
| `canvas_get_node_media` | 读取节点结果画面并以 MCP image 回传（图=结果图，视频=封面/首帧；回执含 playableUrl） |
| `canvas_wait_node_result` | 等待节点生成结束，成功时回传画面 |
| `canvas_open_node_media` | 在画布打开媒体预览；视频可点击播放成片 |
| `canvas_run_group_nodes` | 批量执行分区内节点：按分区内连线依赖调度，上游产出新结果才触发下游，上游失败则下游阻塞；分区外上游正在运行或排在其他分区执行中时先等它；`mode=resume`（默认）跳过已有结果的节点，`rerun` 全部重跑 |
| `canvas_ungroup_node` | 解散分区 |
| `canvas_batch_update_positions` | 批量移动节点 |
| `canvas_auto_layout` | 基于 DAG 拓扑分层（Sugiyama 算法）自动平行排版，消除连线交叉与重叠 |
| `canvas_open_workbench` | 打开写作台 / 3D 导演台 / 剪辑时间线 |
| `canvas_screenplay_run` | 遥控已打开的写作台（切阶段、跑 AI、写 brief/正文、导出） |
| `canvas_director3d_run` | 遥控已打开的 3D 片场。先 `canvas_open_workbench kind=director3d`，等 `canvas_get_snapshot` 的 `director3d.open` 后再 run（`canvas_get_status` 不含此字段）。`addObject` / `duplicateObject` / `addLibraryModel` 成功回执带 `objectId`；`addObjects` 带 `objectIds`。`setShape` 可传径向/高度分段、阵列、抖动、镜像；`addCameraMove` 可传 `direction` / `intensity` / `orbitDegrees` / `elevation` / `shake`。`projectId` 必须是画布工程 ID，不要传 `scene=` 场景 ID。`parentId` 省略或空字符串表示解除挂载。 |
| `canvas_video_clip_run` | 遥控已打开的剪辑时间线。先 `canvas_open_workbench kind=videoClip`。`snapshot` 回轨道/片段/`mediaId`。可 `addTrack` / `addMedia` / `setTrim` / `setSpeed` / `setVolume` / `addText` / `addSubtitle`（支持传 `trackId` 追加进已有文字轨，不传则新建字幕轨）。`fadeIn`/`fadeOut` 是片段透明度关键帧，不是独立转场。`addEffect` 目前只有 `blur`。没有 dissolve/wipe，也没有亮度对比度调色。导出仍非 MCP。 |

---

## 通信路径

```
本地 Agent
  → MCP（复制的那段 JSON）
  → mcp-server/index.mjs
  → 127.0.0.1 本地服务
  → 当前画布
```


---

## 给 Agent 的操作手册

用户不用读。Agent 在改画布前应调用 `canvas_get_playbook`、`canvas_list_node_types`；创建生成节点前再调 `canvas_list_models`。

首选类型：

- 生图 `imageV2`
- 生视频 `videoV2`
- 音频 `voiceV2`
- 剧本 `screenplay`
- 拆分镜 `scriptSplit`
- 成片拆分 `videoSplitMax`（切分+反推后派生角色/生图/视频三列，不要再当内嵌大表用）
- 本地扩展插件 `plugin`（仅限本地离线画布，执行已安装的第三方扩展工具，如滤镜、水印、ComfyUI 桥接等）

硬规则：不要新建遗留节点；`group` 只做分区；参考关系用连线；生成类节点创建后再 `canvas_trigger_node_task`。创作人物/连续分镜前调 `canvas_get_context` 感知世界观和已有角色；批量操作不满意可 `canvas_undo` 一键撤销，或用 `canvas_revert_changeset` 靶向回退特定 Agent 事务；操作完成后可调用 `canvas_lint` 进行规则自愈排查。写作台 / 导演台 / 剪辑先 `canvas_open_workbench`。写作台用 `canvas_screenplay_run`，导演台用 `canvas_director3d_run`，剪辑用 `canvas_video_clip_run`。

写节点时：

- `data` 必须是 JSON 对象，不能是字符串。
- 插件节点（`plugin`）：先 `canvas_list_plugins` 取 `pluginId`、`pluginNodeType` 与参数表，不要猜。创建时写 `pluginId`、`pluginNodeType`、`title`。连线固定使用 `input` 与 `output`；参数平铺写 `p_<key>`（如 `p_pointPromptX`、`p_segmentMode`），不要包 `params`（嵌套的 `params` 会被展开为 `p_<key>`）。插件输出 `video` 时结果同时写入 `data.videoUrl`，输出 `image` 时写入 `data.imageUrl`，下游节点按这些字段取素材。
- 生图比例用 `outputSize`，例如 `2K|16:9`。不要写 `aspect_ratio`。
- 选模型先 `canvas_list_models`，必须传 `nodeType`。生图写 `data.model` 或 `data.img2imgModel`；视频/音频/3D 写 `data.model`。只写表里的 `modelKey`。生视频写文生视频 key，有参考图时节点会自动切到配对模型。
- 剧本拆分节点（`scriptSplit`）可配置 `splitLlmModel`（总控语言模型，未填则跟随平台后台绑定）；亦支持高级专家模式 `splitStageModels`（`{ bible?, segments?, shots?, costume?, world?, seam? }` 精细化分阶段配置模型）；分镜生图与生视频模型可分别配置 `shotImageModel` / `shotVideoModel`。`seamFixEnabled=true`（段界接缝「校正 + 尾帧接力」）时，导出会为相邻镜组全链建立尾帧节点并按 `linkPrev` 连线：接续用 `frameRole=firstFrame`，硬切与换场用 `reference`，全链路时序单向依赖保证整组执行严格串行推进。
- 尾帧接力：生图节点写 `data.frameCaptureFrom=<视频节点ID>`（落地为 `_frameCapture.fromNodeId`）即成尾帧节点，触发时截取该视频最后一帧，不生图；上游视频换了新结果后尾帧视为过期，`canvas_run_group_nodes mode=resume` 会重截并重跑下游。
- 模型参数按 `params[].key` 平铺写入 `data`，不要包一层 `params`。有 `options` 时用表里的 `value`。
- 生图提示词可写 `prompt`，会落到 `img2imgPrompt`。
- 视频提示词可写 `prompt`（亦兼容 `videoPrompt`）。
- 音乐节点提示词可写 `prompt`（亦兼容 `sunoDescription`），歌词写 `lyricsText`（亦兼容 `sunoLyrics`）。
- `negativePrompt` 创建和更新都会写入。
- 批量修改多个节点（统一模型、比例、参数）时，使用 `canvas_batch_update_nodes` 一次性原子更新，不要多次串行调用 `canvas_update_node`。
- 大画布查找特定节点或按状态排查时，优先使用 `canvas_find_nodes`，避免全量快照消耗大量 Token。
- 成功回执会带回落地后的 `data`，不要只看 `applied: true`。

看生成图：

- 必须用 `canvas_get_node_media`。工具会回传 MCP `image`，Codex 才能显示。
- 不要用 `canvas_get_snapshot` / `canvas_get_summary` 里的 `url` 当图片。协同画布是带签名的 OSS 地址，本地画布是 `mirrordraw-local://`，Agent 都打不开。
- `canvas_trigger_node_task` 只表示已开始生成。完成后用 `canvas_wait_node_result`；已有结果直接 `canvas_get_node_media`。`status=generating` 表示还在跑。
- 协同画布不会为了 Agent 把结果改成本地路径。MCP 只临时读画面回传，不改节点存储。
- 视频回封面/首帧，不成片。云端走截帧 URL，本地用 ffmpeg 抽帧。回执带 `playableUrl` / `localPath`。
- 要点播放成片：再调 `canvas_open_node_media`，通常只传 `nodeId`。会聚焦节点并打开画布播放器（带播放控件）。不要把 mp4 当 MCP image 回传，也不要传 `file://`。
- 引导视口或定位节点：调用 `canvas_focus_node`（传入 `nodeId`），画布将平移视口居中并高亮该节点。

正式安装包会把 `mcp-server` 放进应用资源目录。复制配置后，`args` 指向该脚本，不要改成源码仓库路径。
