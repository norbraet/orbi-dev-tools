import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli || !npmCli.endsWith("npm-cli.js")) {
  throw new Error("Run this smoke check with npm run test:package.");
}

function execute(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}` },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), "orbi-package-"));
try {
  const npm = (args, cwd) => execute(process.execPath, [npmCli, ...args], cwd);
  const [packed] = JSON.parse(npm([
    "pack", "--json", "--ignore-scripts", "--pack-destination", temporaryDirectory,
  ], root));
  const tarball = resolve(temporaryDirectory, packed.filename);
  const consumer = join(temporaryDirectory, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "orbi-smoke-consumer", private: true }));
  npm([
    "install", "--save-dev", "--save-exact", "--ignore-scripts", "--no-audit", "--no-fund",
    "--package-lock=false", tarball,
  ], consumer);

  const installed = join(consumer, "node_modules", "@norbraet", "orbi-dev-tools");
  for (const asset of [
    "bin/orbi-dev-tools.mjs", "scripts/bootstrap-github.sh", "scripts/sync-github-labels.mjs",
    "scripts/required-status-checks.mjs", "templates/orbi-dev-tools.json",
    "templates/github/workflows/ci.yml", "templates/github/labels.yml",
  ]) {
    assert.ok(existsSync(join(installed, asset)), `Missing packaged asset: ${asset}`);
  }
  const binary = process.platform === "win32" ? "orbi-dev-tools.cmd" : "orbi-dev-tools";
  assert.ok(existsSync(join(consumer, "node_modules", ".bin", binary)));
  const cli = (args) => npm(["exec", "--offline", "--", "orbi-dev-tools", ...args], consumer);
  assert.match(cli(["--help"]), /Usage:.*orbi-dev-tools/);
  cli(["validate-commit-message", "--message", "feat(1): verify packaged CLI"]);
  writeFileSync(join(consumer, ".orbi-dev-tools.json"), JSON.stringify({
    branches: { integration: "next", release: "stable" },
    github: { owner: "example-owner", repositoryName: "example-repository", projectName: "Smoke Delivery" },
  }));
  cli(["init-github"]);
  assert.match(readFileSync(join(consumer, ".github/project.yml"), "utf8"), /title: Smoke Delivery/);
  assert.match(readFileSync(join(consumer, ".github/workflows/ci.yml"), "utf8"), /branches: \["stable", "next"\]/);
  const output = execute(process.execPath, [join(installed, "scripts/sync-github-labels.mjs"),
    join(consumer, ".github/labels.yml"), "example-owner/example-repository", "--dry-run"], consumer);
  assert.equal(output.split("[dry-run] gh label create ").length - 1, 13);
  console.log(`Package smoke check passed: ${packed.name}@${packed.version}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
