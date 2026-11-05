import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const bootstrap = fileURLToPath(new URL("../scripts/bootstrap-github.sh", import.meta.url));
const template = fileURLToPath(new URL("../templates/github/labels.yml", import.meta.url));
const bash = process.platform === "win32"
  ? join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe")
  : "bash";
const bashAvailable = spawnSync(bash, ["--version"]).status === 0;

// Export shell functions so the actual bootstrap script runs with a fake gh.
// Node subprocess calls are mocked separately below, since they cannot use
// exported Bash functions.
const harness = `
node() { "$ORBI_TEST_NODE" --import "$ORBI_TEST_MOCK" "$@"; }
gh() {
  printf '%s\\t' "$@" >> "$ORBI_TEST_LOG"
  printf '\\n' >> "$ORBI_TEST_LOG"
  case "$1 $2" in
    'repo view')
      if [[ "$*" == *nameWithOwner* ]]; then printf 'example/repository\\n';
      else printf 'develop\\n'; fi ;;
    'project create') printf '1\\n' ;;
    'project view') printf 'project-id\\n' ;;
  esac
  return 0
}
export -f node gh
bash "$@"
`;

for (const mode of ["apply", "dry-run", "invalid"]) {
  test(`bootstrap labels: ${mode} with mocked GitHub CLI`, { skip: !bashAvailable }, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "orbi bootstrap-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const labels = join(directory, "labels.yml");
    writeFileSync(labels, mode === "invalid" ? "labels: [{}]\n" : readFileSync(template, "utf8"));
    const milestones = join(directory, "milestones.yml");
    writeFileSync(milestones, "milestones: []\n");
    const project = join(directory, "project.yml");
    writeFileSync(project, "title: Example Delivery\ndescription: Example\nreadme: |\n  Example\nfields:\nworkflows:\n");
    const log = join(directory, "gh.log");
    const mock = join(directory, "mock-gh.mjs");
    writeFileSync(mock, `
import childProcess from "node:child_process";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
childProcess.spawnSync = (command, args) => {
  if (command !== "gh") throw new Error("Unexpected subprocess: " + command);
  appendFileSync(process.env.ORBI_TEST_LOG, args.join("\\t") + "\\n");
  return { status: 0, stdout: "", stderr: "" };
};
syncBuiltinESMExports();
`);
    const result = spawnSync(bash, ["-c", harness, "orbi-test", bootstrap, ...(mode === "dry-run" ? ["--dry-run"] : [])], {
      encoding: "utf8",
      env: {
        ...process.env,
        ORBI_TEST_NODE: process.execPath.replaceAll("\\", "/"),
        ORBI_TEST_MOCK: pathToFileURL(mock).href,
        ORBI_TEST_LOG: log.replaceAll("\\", "/"),
        ORBI_DEV_TOOLS_LABELS_FILE: labels.replaceAll("\\", "/"),
        ORBI_DEV_TOOLS_MILESTONES_FILE: milestones.replaceAll("\\", "/"),
        ORBI_DEV_TOOLS_PROJECT_FILE: project.replaceAll("\\", "/"),
      },
    });
    const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
    if (mode === "invalid") {
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /labels\[0\]\.name/);
      assert.deepEqual(calls, []);
    } else {
      assert.equal(result.status, 0, result.stderr);
      const labelCalls = calls.filter((line) => line.startsWith("label\tcreate\t"));
      if (mode === "apply") {
        assert.equal(labelCalls.length, 13);
        assert.ok(labelCalls[0].includes("status: needs-triage\t"));
        assert.ok(labelCalls[12].includes("area: devx-ci\t"));
      } else {
        assert.deepEqual(labelCalls, []);
        assert.equal(result.stdout.split("[dry-run] gh label create ").length - 1, 13);
        assert.ok(calls.every((line) => !line.includes("--method\t")));
      }
    }
  });
}
