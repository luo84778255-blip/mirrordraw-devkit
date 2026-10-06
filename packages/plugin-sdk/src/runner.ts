import type { PluginManifestNode } from "./manifest.js";

export type PluginInputKind = PluginManifestNode["inputs"][number]["kind"];
export type PluginOutputKind = PluginManifestNode["output"]["kind"];
export type PluginParamValue = string | number | boolean;

export interface PluginMediaInput {
  kind: Exclude<PluginInputKind, "text">;
  bytes: ArrayBuffer;
  mimeType: string;
  fileName: string;
  sourceNodeId: string;
}

export interface PluginTextInput {
  text: string;
  sourceNodeId: string;
}

export interface PluginTaskContext {
  /** manifest.nodes[].type */
  nodeType: string;
  /** 节点参数，键为 manifest 中 params[].key */
  params: Record<string, PluginParamValue | undefined>;
  /** configSchema 配置，含已解密的 secret 字段 */
  config: Record<string, PluginParamValue | undefined>;
  inputs: {
    media: PluginMediaInput[];
    texts: PluginTextInput[];
  };
  /** 用户取消任务时触发 abort */
  signal: AbortSignal;
  progress(percent: number, message?: string): void;
  /** 记录外部任务 ID；resume 为预留接口，当前客户端版本不会在重启后自动调用 */
  checkpoint(externalRef: string): void;
}

export type PluginTaskResult =
  | {
      kind: Exclude<PluginOutputKind, "text">;
      bytes: ArrayBuffer | ArrayBufferView;
      mimeType?: string;
      fileName?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: Exclude<PluginOutputKind, "text">;
      /** http(s) 地址由客户端下载并落盘为本地资产 */
      url: string;
      metadata?: Record<string, unknown>;
    }
  | { kind: "text"; text: string };

export interface PluginRunner {
  run(ctx: PluginTaskContext): Promise<PluginTaskResult | PluginTaskResult[]>;
  resume?(ctx: PluginTaskContext, externalRef: string): Promise<PluginTaskResult | PluginTaskResult[]>;
}

export function defineRunner(runner: PluginRunner): PluginRunner {
  return runner;
}
