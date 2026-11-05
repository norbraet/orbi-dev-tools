import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readLabels, synchronizeLabels } from "../src/github-labels.mjs";

const template = fileURLToPath(new URL("../templates/github/labels.yml", import.meta.url));
const script = fileURLToPath(new URL("../scripts/sync-github-labels.mjs", import.meta.url));

function labelFile(t, content) {
  const directory = mkdtempSync(join(tmpdir(), "orbi-labels-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "labels.yml");
  writeFileSync(file, content);
  return file;
}

test("synchronizes every label in the shipped multiline template", () => {
  const calls = [];
  synchronizeLabels(template, "example/repository", {
    runCommand: (...args) => calls.push(args),
  });
  const names = [
    "status: needs-triage", "status: ready", "status: blocked", "status: in-progress",
    "type: bug", "type: feature", "type: technical", "type: docs",
    "priority: critical", "priority: high", "priority: medium", "priority: low",
    "area: devx-ci",
  ];
  assert.deepEqual(calls.map(([, args]) => args[2]), names);
  assert.deepEqual(calls[0], [
    "gh",
    ["label", "create", "status: needs-triage", "--repo", "example/repository",
      "--color", "D4C5F9", "--description", "Awaiting initial review and classification", "--force"],
    { dryRun: false },
  ]);
});

test("supports inline mappings, block mappings, comments, and special characters", (t) => {
  const file = labelFile(t, `# Project labels
labels:
  - { description: 'Contains | and "quotes"', color: "123456", name: "type: bug" }
  - name: 'team: tools'
    description: "Uses \\u00fc and $HOME"
    color: "abcdef"
`);
  const calls = [];
  synchronizeLabels(file, "example/repository", {
    runCommand: (...args) => calls.push(args),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1][2], "type: bug");
  assert.equal(calls[0][1][8], 'Contains | and "quotes"');
  assert.equal(calls[1][1][8], "Uses ü and $HOME");
});

for (const [name, content, message] of [
  ["malformed YAML", "labels: [", /Cannot read labels from/],
  ["missing labels", "other: []", /Expected a labels array/],
  ["non-array labels", "labels: {}", /Expected a labels array/],
  ["null entry", "labels: [null]", /labels\[0\]\.name/],
  ["empty name", 'labels: [{name: " ", color: abcdef, description: ok}]', /labels\[0\]\.name/],
  ["invalid color", 'labels: [{name: bug, color: "#123456", description: ok}]', /labels\[0\]\.color/],
  ["numeric color", 'labels: [{name: bug, color: 123456, description: ok}]', /labels\[0\]\.color/],
  ["missing description", 'labels: [{name: bug, color: abcdef}]', /labels\[0\]\.description/],
  ["duplicate names", 'labels: [{name: bug, color: abcdef, description: ok}, {name: BUG, color: abcdef, description: ok}]', /duplicates label/],
  ["invalid later entry", 'labels: [{name: bug, color: abcdef, description: ok}, {}]', /labels\[1\]\.name/],
]) {
  test(`rejects ${name} before running any commands`, (t) => {
    const file = labelFile(t, content);
    const calls = [];
    assert.throws(
      () => synchronizeLabels(file, "example/repository", {
        runCommand: (...args) => calls.push(args),
      }),
      message,
    );
    assert.deepEqual(calls, []);
  });
}

test("allows an explicitly empty label array", (t) => {
  const file = labelFile(t, "labels: []\n");
  assert.deepEqual(readLabels(file), []);
});

test("dry-run prints all label operations without needing GitHub CLI", () => {
  const result = spawnSync(process.execPath, [script, template, "example/repository", "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, PATH: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 13);
  assert.ok(lines.every((line) => line.startsWith("[dry-run] gh label create ")));
  assert.ok(lines[0].includes('"status: needs-triage"'));
  assert.ok(lines[12].includes('"area: devx-ci"'));
});

test("validation entry point exits unsuccessfully for invalid labels", (t) => {
  const file = labelFile(t, "labels: [{}]\n");
  const result = spawnSync(process.execPath, [script, file, "--validate"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(file));
  assert.match(result.stderr, /labels\[0\]\.name/);
});
