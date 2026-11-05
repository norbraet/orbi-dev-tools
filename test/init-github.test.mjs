import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGitHub } from "../src/init-github.mjs";

async function withProject(callback) {
  const previousDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "orbi-dev-tools-"));
  writeFileSync(
    join(directory, ".orbi-dev-tools.json"),
    JSON.stringify({
      branches: {
        integration: "integration",
        release: "release/stable",
      },
      github: {
        owner: "example-owner",
        repositoryName: "example-repository",
        projectName: "Example Delivery",
      },
    }),
  );
  process.chdir(directory);
  try {
    await callback(directory);
  } finally {
    process.chdir(previousDirectory);
    rmSync(directory, { recursive: true, force: true });
  }
}

test("creates the GitHub baseline using local configuration", async () => {
  await withProject(async (directory) => {
    await initializeGitHub([]);
    assert.equal(existsSync(join(directory, ".github/workflows/ci.yml")), true);
    assert.match(
      readFileSync(join(directory, ".github/CODEOWNERS"), "utf8"),
      /@example-owner/,
    );
    assert.match(
      readFileSync(join(directory, ".github/project.yml"), "utf8"),
      /^title: Example Delivery$/m,
    );
    assert.match(
      readFileSync(join(directory, ".github/ISSUE_TEMPLATE/config.yml"), "utf8"),
      /https:\/\/github\.com\/example-owner\/example-repository\/discussions/,
    );

    const ci = readFileSync(join(directory, ".github/workflows/ci.yml"), "utf8");
    assert.match(ci, /branches: \["release\/stable", "integration"\]/);
    assert.ok(ci.includes("ci-${{ github.workflow }}-${{ github.ref }}"));

    const release = readFileSync(
      join(directory, ".github/workflows/release-please.yml"),
      "utf8",
    );
    assert.match(release, /branches: \["release\/stable"\]/);
    assert.match(release, /target-branch: "release\/stable"/);
    assert.ok(release.includes("${{ secrets.RELEASE_PLEASE_TOKEN }}"));
    assert.ok(
      readFileSync(join(directory, ".github/workflows/pr-title.yml"), "utf8")
        .includes("${{ github.event.pull_request.title }}"),
    );

    for (const file of readdirSync(join(directory, ".github"), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!file.isFile()) continue;
      const content = readFileSync(join(file.parentPath, file.name), "utf8");
      assert.doesNotMatch(content, /\{\s*\{\s*[A-Z_]+\s*\}\s*\}/, file.name);
    }
  });
});

test("preserves existing files unless --force is supplied", async () => {
  await withProject(async (directory) => {
    await initializeGitHub([]);
    const file = join(directory, ".github/workflows/ci.yml");
    const original = readFileSync(file, "utf8");
    const customized = "# Project-owned workflow\n";
    writeFileSync(file, customized);

    await initializeGitHub([]);
    assert.equal(readFileSync(file, "utf8"), customized);

    await initializeGitHub(["--force"]);
    assert.equal(readFileSync(file, "utf8"), original);
  });
});
