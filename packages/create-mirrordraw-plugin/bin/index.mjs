#!/usr/bin/env node
import path from "node:path";
import { scaffold } from "../lib/scaffold.mjs";

const USAGE = `用法: npm create mirrordraw-plugin <目录> [-- --id com.example.my-plugin --name "插件名称"]

  --id    插件 ID，形如 com.developer.plugin；默认 com.example.<目录名>
  --name  插件显示名称；默认取目录名`;

function parseArgs(argv) {
  const args = { dir: undefined, id: undefined, name: undefined, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--id") args.id = argv[++i];
    else if (arg === "--name") args.name = argv[++i];
    else if (arg === "-h" || arg === "--help") args.help = true;
    else if (!arg.startsWith("-") && !args.dir) args.dir = arg;
    else throw new Error(`无法识别的参数: ${arg}`);
  }
  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const { target, pluginId } = scaffold(args);
  const fromCwd = path.relative(process.cwd(), target);
  const relative = !fromCwd ? "." : fromCwd.startsWith("..") ? target : fromCwd;
  console.log(`已创建插件项目: ${relative}（ID: ${pluginId}）

下一步:
  cd ${relative}
  npm install
  npm run build       # 打包为 dist/runner.js
  npm test            # 用测试桩运行 runner
  npm run pack        # 生成 .mdplugin 安装包

联调: 在客户端「插件中心」选择「添加本地开发目录」，指向 ${relative}。`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
