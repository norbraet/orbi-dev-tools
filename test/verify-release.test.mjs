import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { verifyRelease } from "../scripts/verify-release.mjs";

function repository(t, { version = "0.1.0", manifest = version, changelog = `## [${version}](https://example.com)`, access = "public" } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "orbi-release-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Release test");
  git("config", "user.email", "release-test@example.com");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(directory, "package.json"), JSON.stringify({
    name: "@norbraet/orbi-dev-tools", version,
    publishConfig: { access, registry: "https://registry.npmjs.org/" },
    repository: { url: "git+https://github.com/norbraet/orbi-dev-tools.git" },
  }));
  writeFileSync(join(directory, ".release-please-manifest.json"), JSON.stringify({ ".": manifest }));
  writeFileSync(join(directory, "CHANGELOG.md"), changelog);
  git("add", ".");
  git("commit", "-m", "feat: initial release");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("tag", "v0.1.0");
  return { directory, git };
}

test("accepts a stable tag with matching metadata on main", (t) => {
  const { directory, git } = repository(t);
  assert.deepEqual(verifyRelease("v0.1.0", directory), { commit: git("rev-parse", "HEAD"), version: "0.1.0" });
});

test("rejects a tag on an unmerged commit", (t) => {
  const { directory, git } = repository(t);
  writeFileSync(join(directory, "unmerged.txt"), "not on origin/main");
  git("add", ".");
  git("commit", "-m", "feat: unmerged change");
  git("tag", "v0.1.1");
  assert.throws(() => verifyRelease("v0.1.1", directory), /git exited with status 1/);
});

for (const [name, options, expected] of [
  ["mismatched tag", { version: "0.2.0" }, /does not match package version/],
  ["mismatched manifest", { manifest: "0.0.1" }, /manifest and package versions/],
  ["missing release notes", { changelog: "# Changelog\n## 0.0.1\n" }, /no release entry/],
  ["restricted publication", { access: "restricted" }, /public npm package/],
]) {
  test(`rejects ${name}`, (t) => {
    const { directory } = repository(t, options);
    assert.throws(() => verifyRelease("v0.1.0", directory), expected);
  });
}

test("rejects missing tags", (t) => {
  const { directory } = repository(t);
  assert.throws(() => verifyRelease("v9.9.9", directory), /git exited with status/);
});

test("rejects branch names, prereleases, and malformed tag inputs before running git", () => {
  for (const tag of [undefined, "main", "v01.0.0", "v1.0.0-beta.1", "--help", "v1.0.0; echo unsafe"]) {
    assert.throws(() => verifyRelease(tag, "nonexistent-directory"), /Expected a stable release tag/);
  }
});
