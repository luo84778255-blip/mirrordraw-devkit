import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ID_REGEX = /^[a-z0-9]+(\.[a-z0-9-]+){2,}$/;
const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "template");
// npm 发布时会丢弃 .gitignore，模板里用 _gitignore 存放
const RENAMES = { _gitignore: ".gitignore" };

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function copyTemplate(from, to, values) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, RENAMES[entry.name] ?? entry.name);
    if (entry.isDirectory()) {
      copyTemplate(source, target, values);
      continue;
    }
    let content = fs.readFileSync(source, "utf8");
    for (const [key, value] of Object.entries(values)) content = content.replaceAll(`{{${key}}}`, value);
    fs.writeFileSync(target, content);
  }
}

export function scaffold({ dir, id, name }) {
  const target = path.resolve(dir);
  const base = path.basename(target);
  const pluginId = id ?? (slugify(base) ? `com.example.${slugify(base)}` : undefined);
  const pluginName = name ?? base;

  if (!pluginId) throw new Error("目录名无法生成插件 ID，请用 --id 指定");
  if (!ID_REGEX.test(pluginId)) throw new Error(`插件 ID 不合法: ${pluginId}（需形如 com.developer.plugin，仅小写字母、数字、连字符）`);
  if (/["\\]/.test(pluginName)) throw new Error('插件名称不能包含 " 或 \\');
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) throw new Error(`目录不为空: ${target}`);

  const slug = pluginId.split(".").pop();
  copyTemplate(TEMPLATE_DIR, target, { id: pluginId, name: pluginName, slug });
  return { target, pluginId, pluginName };
}
