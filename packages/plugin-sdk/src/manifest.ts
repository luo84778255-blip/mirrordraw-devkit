// 由 mirrordraw pro 的 electron/plugins/types.ts 自动生成，请勿手改。
// 更新方式：在客户端仓库运行 node scripts/sync-public.mjs
export interface PluginManifestParam {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "slider" | "select" | "switch";
  default?: unknown;
  options?: Array<{ label: string; value: string } | string>;
  min?: number;
  max?: number;
  step?: number;
}

export interface PluginManifestNode {
  type: string;
  title: string;
  category?: string;
  defaultSize?: { width: number; height: number };
  inputs: Array<{
    kind: "image" | "video" | "audio" | "text" | "model3d";
    min?: number;
    max?: number;
  }>;
  output: {
    kind: "image" | "video" | "audio" | "text";
  };
  timeoutSec?: number;
  maxConcurrency?: number;
  params: PluginManifestParam[];
}

export interface PluginManifestConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "switch";
  default?: unknown;
  secret?: boolean;
  required?: boolean;
}

export interface PluginManifest {
  manifestVersion: number;
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  author?: string;
  description?: string;
  runner: string;
  network?: {
    allow?: string[];
  };
  configSchema?: PluginManifestConfigField[];
  nodes: PluginManifestNode[];
}
