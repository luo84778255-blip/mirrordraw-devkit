import { build } from "esbuild";

// 客户端要求 runner 是不含外部 import 的单文件 ES Module
await build({
  entryPoints: ["src/runner.ts"],
  outfile: "dist/runner.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
});
