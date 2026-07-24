import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGitHub } from "../src/init-github.mjs";

test("creates the GitHub baseline using local configuration", async () => {
  const previousDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "orbi-dev-tools-"));
  writeFileSync(
    join(directory, ".orbi-dev-tools.json"),
    JSON.stringify({
      github: {
        owner: "example-owner",
        repositoryName: "example-repository",
        projectName: "Example Delivery",
      },
    }),
  );
  process.chdir(directory);
  try {
    await initializeGitHub([]);
    assert.equal(existsSync(join(directory, ".github/workflows/ci.yml")), true);
    assert.match(
      readFileSync(join(directory, ".github/CODEOWNERS"), "utf8"),
      /@example-owner/,
    );
    assert.match(
      readFileSync(join(directory, ".github/project.yml"), "utf8"),
      /Example Delivery/,
    );
  } finally {
    process.chdir(previousDirectory);
    rmSync(directory, { recursive: true, force: true });
  }
});
