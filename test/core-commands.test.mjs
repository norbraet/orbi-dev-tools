import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createPullRequest } from "../src/create-pr.mjs";
import { promoteRelease } from "../src/promote-release.mjs";
import { forbidProtectedBranch } from "../src/forbid-protected-branch.mjs";

function project(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "orbi commands-"));
  const previousDirectory = process.cwd();
  const config = {
    branches: { integration: "integration", release: "release", protected: ["release", "integration"] },
    ...options.config,
  };
  writeFileSync(join(directory, ".orbi-dev-tools.json"), JSON.stringify(config));
  mkdirSync(join(directory, ".github"));
  const template = join(directory, ".github/PULL_REQUEST_TEMPLATE.md");
  writeFileSync(template, "## Commits\n<!-- COMMIT_LIST -->\n<!-- LINKED_ISSUE -->\n");
  const existingBody = join(directory, ".orbi-dev-tools-pr-body.md");
  writeFileSync(existingBody, "Project-owned content\n");
  process.chdir(directory);
  const calls = [];
  const bodies = [];
  const originalSpawn = childProcess.spawnSync;
  t.after(() => {
    childProcess.spawnSync = originalSpawn;
    syncBuiltinESMExports();
    process.chdir(previousDirectory);
    rmSync(directory, { recursive: true, force: true });
  });
  childProcess.spawnSync = (command, args, executionOptions) => {
    calls.push({ command, args, cwd: executionOptions.cwd });
    assert.equal(executionOptions.cwd, directory);
    let stdout = "";
    let status = 0;
    if (command === "git") {
      switch (args[0]) {
        case "branch": stdout = options.branch ?? "feat/12-add-feature"; break;
        case "log": stdout = args.includes("--pretty=%s")
          ? options.subject ?? "feat(12): add feature"
          : "- feat(12): add feature\n- test(12): cover feature\n"; break;
        case "fetch": status = options.fetchStatus ?? 0; break;
        case "rev-list": stdout = options.ahead ?? "2"; break;
        default: assert.fail(`Unexpected git command: ${args.join(" ")}`);
      }
    } else if (command === "gh") {
      const bodyIndex = args.indexOf("--body-file");
      if (bodyIndex !== -1) {
        const file = args[bodyIndex + 1];
        bodies.push({ file, content: readFileSync(file, "utf8") });
        assert.notEqual(dirname(file), directory);
      }
      status = options.ghStatus ?? 0;
    } else {
      assert.fail(`Unexpected subprocess: ${command}`);
    }
    return { status, stdout, stderr: "" };
  };
  syncBuiltinESMExports();
  return { directory, template, existingBody, calls, bodies };
}

test("creates a PR with the configured base, issue link, commit list, and forwarded options", async (t) => {
  const fixture = project(t);
  await createPullRequest(["--draft"]);
  const gh = fixture.calls.find((call) => call.command === "gh");
  assert.equal(gh.args[gh.args.indexOf("--base") + 1], "integration");
  assert.equal(gh.args[gh.args.indexOf("--title") + 1], "feat(12): add feature");
  assert.ok(gh.args.includes("--draft"));
  assert.match(fixture.bodies[0].content, /Closes #12/);
  assert.match(fixture.bodies[0].content, /- test\(12\): cover feature/);
  assert.doesNotMatch(fixture.bodies[0].content, /<!-- (COMMIT_LIST|LINKED_ISSUE) -->/);
  assert.equal(existsSync(dirname(fixture.bodies[0].file)), false);
  assert.equal(readFileSync(fixture.existingBody, "utf8"), "Project-owned content\n");
});

test("PRs use unique temporary directories and honor an explicit base", async (t) => {
  const fixture = project(t, { subject: "unstructured commit" });
  await createPullRequest(["--base", "release", "--draft"]);
  await createPullRequest([]);
  assert.notEqual(fixture.bodies[0].file, fixture.bodies[1].file);
  assert.ok(fixture.bodies.every(({ file }) => !existsSync(dirname(file))));
  const gh = fixture.calls.find((call) => call.command === "gh");
  assert.equal(gh.args.filter((arg) => arg === "--base").length, 1);
  assert.equal(gh.args[gh.args.indexOf("--base") + 1], "release");
  assert.equal(gh.args[gh.args.indexOf("--title") + 1], "feat: add-feature");
  assert.ok(fixture.calls.some(({ args }) => args.includes("release..HEAD")));
});

test("cleans up PR temporary files when GitHub CLI fails", async (t) => {
  const fixture = project(t, { ghStatus: 1 });
  await assert.rejects(createPullRequest([]), /gh exited with status 1/);
  assert.equal(existsSync(dirname(fixture.bodies[0].file)), false);
  assert.equal(readFileSync(fixture.existingBody, "utf8"), "Project-owned content\n");
});

for (const [name, options, pattern] of [
  ["detached HEAD", { branch: "" }, /detached HEAD/],
  ["branch without an issue", { branch: "feat/add-feature" }, /must use type/],
  ["invalid title", { branch: "unknown/12-description", subject: "unstructured" }, /Conventional Commit title/],
]) {
  test(`rejects ${name} before creating a PR`, async (t) => {
    const fixture = project(t, options);
    await assert.rejects(createPullRequest([]), pattern);
    assert.ok(fixture.calls.every(({ command }) => command !== "gh"));
  });
}

test("rejects a missing PR template before invoking GitHub CLI", async (t) => {
  const fixture = project(t);
  rmSync(fixture.template);
  await assert.rejects(createPullRequest([]), /Pull request template not found/);
  assert.ok(fixture.calls.every(({ command }) => command !== "gh"));
});

test("allows issue-free PR branches when configured", async (t) => {
  const fixture = project(t, {
    branch: "feat/add-feature",
    config: { pullRequests: { requireIssueBranchPrefix: false } },
  });
  await createPullRequest([]);
  assert.doesNotMatch(fixture.bodies[0].content, /Closes #/);
});

test("promotes the configured remote branches with forwarded options", async (t) => {
  const fixture = project(t);
  await promoteRelease(["--draft"]);
  assert.deepEqual(fixture.calls.map(({ command, args }) => [command, ...args]), [
    ["git", "fetch", "origin", "release", "integration", "--quiet"],
    ["git", "rev-list", "--count", "origin/release..origin/integration"],
    ["gh", "pr", "create", "--base", "release", "--head", "integration",
      "--title", "chore: promote integration to release", "--body",
      "Promotes integration to release. Merging this pull request triggers release-please.", "--draft"],
  ]);
});

for (const [name, options, pattern] of [
  ["no commits to promote", { ahead: "0" }, /nothing to promote/],
  ["failed fetch", { fetchStatus: 1 }, /git exited with status 1/],
]) {
  test(`stops release promotion after ${name}`, async (t) => {
    const fixture = project(t, options);
    await assert.rejects(promoteRelease([]), pattern);
    assert.ok(fixture.calls.every(({ command }) => command !== "gh"));
  });
}

test("blocks configured protected branches with the requested operation", async (t) => {
  project(t, { branch: "release" });
  await assert.rejects(forbidProtectedBranch(["--operation", "push"]), /Direct push on the release branch is forbidden/);
});

test("allows feature branches", async (t) => {
  project(t);
  await forbidProtectedBranch(["--operation", "commit"]);
});
