import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { defaultConfig } from "../src/config.mjs";

const script = fileURLToPath(new URL("../scripts/required-status-checks.mjs", import.meta.url));

function generateChecks(value) {
  const env = { ...process.env };
  delete env.ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS;
  if (value !== undefined) env.ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS = value;
  return spawnSync(process.execPath, [script], { encoding: "utf8", env });
}

test("default required checks match jobs emitted by the generated workflows", () => {
  const emittedChecks = ["ci.yml", "pr-title.yml"].flatMap((file) => {
    const workflow = parse(readFileSync(
      new URL(`../templates/github/workflows/${file}`, import.meta.url), "utf8",
    ));
    return Object.entries(workflow.jobs).map(([id, job]) => job.name ?? id);
  });
  const result = generateChecks();
  assert.equal(result.status, 0, result.stderr);
  const checks = JSON.parse(result.stdout).map((check) => check.context);
  assert.deepEqual(checks, emittedChecks);
  assert.deepEqual(defaultConfig.github.requiredStatusChecks, emittedChecks);
  const template = JSON.parse(readFileSync(new URL("../templates/orbi-dev-tools.json", import.meta.url), "utf8"));
  assert.deepEqual(template.github.requiredStatusChecks, emittedChecks);
});

test("custom names are JSON escaped and replace the default checks", () => {
  const names = ['Build "production"', "Tests\\Windows"];
  const result = generateChecks(JSON.stringify(names));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), names.map((context) => ({ context })));
});

test("an empty list intentionally disables required checks", () => {
  const result = generateChecks("[]");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

for (const value of ["", "null", "{}", '[1]', '[""]', '["  "]', '["CI", "CI"]']) {
  test(`rejects invalid required checks: ${JSON.stringify(value)}`, () => {
    const result = generateChecks(value);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid github.requiredStatusChecks/);
    assert.equal(result.stdout, "");
  });
}
