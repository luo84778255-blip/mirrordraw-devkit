import test from "node:test";
import assert from "node:assert/strict";
import { runRunner } from "@mirrordraw/plugin-sdk/testing";
import runner from "../dist/runner.js";

test("在上游文本前加上前缀", async () => {
  const { results, progress } = await runRunner(runner, {
    params: { prefix: ">> " },
    inputs: { texts: [{ text: "hello", sourceNodeId: "n1" }] },
  });

  assert.deepEqual(results, [{ kind: "text", text: ">> hello" }]);
  assert.ok(progress.length > 0);
});

test("没有上游文本时报错", async () => {
  await assert.rejects(runRunner(runner, {}), /文本节点/);
});
