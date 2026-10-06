import type { PluginRunner, PluginTaskContext, PluginTaskResult } from "./runner.js";

export interface MockRunOptions {
  nodeType?: string;
  params?: PluginTaskContext["params"];
  config?: PluginTaskContext["config"];
  inputs?: Partial<PluginTaskContext["inputs"]>;
  signal?: AbortSignal;
  /** 传入时模拟应用重启后的恢复流程：runner 有 resume 则调用 resume，否则回退到 run */
  externalRef?: string;
}

export interface MockRunReport {
  results: PluginTaskResult[];
  progress: Array<{ percent: number; message?: string }>;
  checkpoints: string[];
}

/** 在 Node 中用假上下文运行 runner，行为与客户端宿主一致（结果统一为数组）。 */
export async function runRunner(runner: PluginRunner, options: MockRunOptions = {}): Promise<MockRunReport> {
  const progress: MockRunReport["progress"] = [];
  const checkpoints: string[] = [];

  const ctx: PluginTaskContext = {
    nodeType: options.nodeType ?? "",
    params: options.params ?? {},
    config: options.config ?? {},
    inputs: { media: options.inputs?.media ?? [], texts: options.inputs?.texts ?? [] },
    signal: options.signal ?? new AbortController().signal,
    progress(percent, message) {
      progress.push({ percent, message });
    },
    checkpoint(ref) {
      checkpoints.push(ref);
    },
  };

  const output =
    options.externalRef !== undefined && runner.resume
      ? await runner.resume(ctx, options.externalRef)
      : await runner.run(ctx);

  return { results: Array.isArray(output) ? output : [output], progress, checkpoints };
}
