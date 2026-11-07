import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig } from "../src/config.mjs";

function directory(t) {
  const root = mkdtempSync(join(tmpdir(), "orbi-config-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("uses defaults when no project configuration is present", (t) => {
  const root = directory(t);
  const result = loadConfig(root);
  assert.equal(result.root, root);
  assert.deepEqual(result.config, defaultConfig);
});

test("discovers parent configuration and merges partial overrides without changing defaults", (t) => {
  const root = directory(t);
  const child = join(root, "packages", "app");
  mkdirSync(child, { recursive: true });
  writeFileSync(join(root, ".orbi-dev-tools.json"), JSON.stringify({
    branches: { integration: "next" },
    commits: { allowedTypes: ["custom"] },
    github: { owner: "example", requiredStatusChecks: ["Application tests"] },
  }));
  const { config, root: foundRoot } = loadConfig(child);
  assert.equal(foundRoot, root);
  assert.equal(config.branches.integration, "next");
  assert.equal(config.branches.release, "main");
  assert.deepEqual(config.commits.allowedTypes, ["custom"]);
  assert.deepEqual(config.github.requiredStatusChecks, ["Application tests"]);
  assert.equal(config.github.labelsFile, ".github/labels.yml");
  assert.equal(defaultConfig.branches.integration, "develop");
});

test("nearest configuration takes precedence over a parent configuration", (t) => {
  const root = directory(t);
  const child = join(root, "app");
  mkdirSync(child);
  writeFileSync(join(root, ".orbi-dev-tools.json"), '{"github":{"owner":"parent"}}');
  writeFileSync(join(child, ".orbi-dev-tools.json"), '{"github":{"owner":"child"}}');
  const result = loadConfig(child);
  assert.equal(result.root, child);
  assert.equal(result.config.github.owner, "child");
});

test("malformed JSON identifies the offending configuration file", (t) => {
  const root = directory(t);
  const file = join(root, ".orbi-dev-tools.json");
  writeFileSync(file, "{");
  assert.throws(() => loadConfig(root), (error) => error.message.startsWith(`Cannot read ${file}:`));
});
