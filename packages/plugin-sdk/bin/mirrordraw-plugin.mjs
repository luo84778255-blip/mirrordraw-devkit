#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const ID_REGEX = /^[a-z0-9]+(\.[a-z0-9-]+){2,}$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const PARAM_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
const INPUT_KINDS = ["image", "video", "audio", "text", "model3d"];
const OUTPUT_KINDS = ["image", "video", "audio", "text"];
const PARAM_TYPES = ["text", "textarea", "number", "slider", "select", "switch"];
const MAX_FILES = 500;
const MAX_BYTES = 100 * 1024 * 1024;

const USAGE = `用法:
  mirrordraw-plugin validate <插件目录>
  mirrordraw-plugin pack <插件目录> [-o 输出文件.mdplugin]`;

function readManifest(dir) {
  const file = path.join(dir, "manifest.json");
  if (!fs.existsSync(file)) throw new Error(`缺少 ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error("manifest.json 不是合法 JSON");
  }
}

// errors 与客户端安装校验一致，warnings 是客户端当前不拦截但规范要求的项。
function validateManifest(m, dir) {
  const errors = [];
  const warnings = [];

  if (!m || typeof m !== "object" || Array.isArray(m)) return { errors: ["manifest.json 必须是 JSON 对象"], warnings };
  if (typeof m.id !== "string" || !ID_REGEX.test(m.id)) errors.push("id 需为形如 com.developer.plugin 的小写命名空间标识");
  if (typeof m.name !== "string" || !m.name.trim()) errors.push("缺少 name");
  if (typeof m.version !== "string" || !SEMVER_REGEX.test(m.version)) errors.push("version 必须是语义化版本，如 1.0.0");
  if (typeof m.runner !== "string" || !m.runner.trim()) {
    errors.push("缺少 runner（如 dist/runner.js）");
  } else if (!fs.existsSync(path.join(dir, m.runner))) {
    errors.push(`runner 文件不存在: ${m.runner}`);
  }
  if (!Array.isArray(m.nodes) || m.nodes.length === 0) {
    errors.push("nodes 至少声明一个节点");
    return { errors, warnings };
  }

  for (const node of m.nodes) {
    const label = node?.type || "(未命名)";
    if (!node || typeof node.type !== "string") errors.push("节点缺少 type");
    if (!node || typeof node.title !== "string") errors.push(`节点 ${label} 缺少 title`);
    if (!node?.output?.kind) errors.push(`节点 ${label} 必须声明 output.kind`);
    else if (!OUTPUT_KINDS.includes(node.output.kind)) warnings.push(`节点 ${label} 的 output.kind 无效: ${node.output.kind}`);

    for (const input of node?.inputs ?? []) {
      if (!INPUT_KINDS.includes(input.kind)) warnings.push(`节点 ${label} 的 inputs.kind 无效: ${input.kind}`);
    }
    if (node?.timeoutSec > 1800) warnings.push(`节点 ${label} 的 timeoutSec 上限为 1800`);

    const seen = new Set();
    for (const param of node?.params ?? []) {
      if (!PARAM_KEY_REGEX.test(param.key ?? "")) warnings.push(`节点 ${label} 的参数 key 不合法: ${param.key}`);
      if (seen.has(param.key)) warnings.push(`节点 ${label} 的参数 key 重复: ${param.key}`);
      seen.add(param.key);
      if (!PARAM_TYPES.includes(param.type)) warnings.push(`节点 ${label} 参数 ${param.key} 的 type 无效: ${param.type}`);
    }
  }

  for (const host of m.network?.allow ?? []) {
    const local = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(host);
    if (/^http:\/\//.test(host) && !local) warnings.push(`network.allow 中的远程地址必须使用 https: ${host}`);
    if (/:\*/.test(host)) warnings.push(`network.allow 不支持端口通配 :*，请写明端口（如 http://127.0.0.1:8188），或不带端口以放行该主机全部端口: ${host}`);
  }
  return { errors, warnings };
}

function loadAndValidate(dir) {
  const manifest = readManifest(dir);
  const { errors, warnings } = validateManifest(manifest, dir);
  for (const w of warnings) console.warn(`警告: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`错误: ${e}`);
    process.exit(1);
  }
  return manifest;
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return walk(full, base);
    return [path.relative(base, full).split(path.sep).join("/")];
  });
}

async function pack(dir, outFile) {
  const manifest = loadAndValidate(dir);
  const files = new Set(["manifest.json", path.posix.normalize(manifest.runner)]);
  for (const optional of ["icon.png", "README.md"]) {
    if (fs.existsSync(path.join(dir, optional))) files.add(optional);
  }
  if (fs.existsSync(path.join(dir, "dist"))) {
    for (const rel of walk(path.join(dir, "dist"), dir)) files.add(rel);
  }

  if (files.size > MAX_FILES) throw new Error(`文件数超过 ${MAX_FILES}`);

  const zip = new JSZip();
  let total = 0;
  for (const rel of [...files].sort()) {
    const buffer = fs.readFileSync(path.join(dir, rel));
    total += buffer.length;
    zip.file(rel, buffer);
  }
  if (total > MAX_BYTES) throw new Error("解压后总大小超过 100MB");

  const out = outFile ?? `${manifest.id}-${manifest.version}.mdplugin`;
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`已生成 ${out}（${files.size} 个文件，${(total / 1024).toFixed(1)} KB）`);
}

async function main() {
  const [command, dirArg, ...rest] = process.argv.slice(2);
  if (!command || !dirArg || !["validate", "pack"].includes(command)) {
    console.error(USAGE);
    process.exit(1);
  }
  const dir = path.resolve(dirArg);

  if (command === "validate") {
    const manifest = loadAndValidate(dir);
    console.log(`校验通过: ${manifest.id}@${manifest.version}`);
    return;
  }

  const outIndex = rest.indexOf("-o");
  await pack(dir, outIndex >= 0 ? rest[outIndex + 1] : undefined);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
