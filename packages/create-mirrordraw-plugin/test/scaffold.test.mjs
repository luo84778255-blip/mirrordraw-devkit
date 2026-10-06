import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaffold } from "../lib/scaffold.mjs";

function tempDir() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "md-scaffold-")), "my-plugin");
}

test("生成项目并替换全部占位符", () => {
  const dir = tempDir();
  const { pluginId } = scaffold({ dir, name: "我的插件" });

  assert.equal(pluginId, "com.example.my-plugin");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  assert.equal(manifest.id, "com.example.my-plugin");
  assert.equal(manifest.name, "我的插件");

  for (const rel of ["package.json", "src/runner.ts", "build.mjs", "tsconfig.json", "test/runner.test.mjs", "README.md", ".gitignore"]) {
    assert.ok(fs.existsSync(path.join(dir, rel)), `缺少 ${rel}`);
    if (rel !== ".gitignore") assert.ok(!fs.readFileSync(path.join(dir, rel), "utf8").includes("{{"), `${rel} 残留占位符`);
  }
});

test("拒绝非法 ID 与非空目录", () => {
  assert.throws(() => scaffold({ dir: tempDir(), id: "bad id" }), /插件 ID 不合法/);

  const dir = tempDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "x"), "");
  assert.throws(() => scaffold({ dir }), /目录不为空/);
});
