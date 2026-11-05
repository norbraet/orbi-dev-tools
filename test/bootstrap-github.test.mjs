import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";

const workflowChecks = ["ci.yml", "pr-title.yml"].flatMap((file) => {
  const workflow = parse(readFileSync(
    new URL(`../templates/github/workflows/${file}`, import.meta.url), "utf8",
  ));
  return Object.entries(workflow.jobs).map(([id, job]) => job.name ?? id);
});

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
  if [[ "$*" == *rulesets* && "$*" == *'--input -'* ]]; then
    cat > "$ORBI_TEST_RULESET"
  fi
  case "$1 $2" in
    'repo view')
      if [[ "$*" == *nameWithOwner* ]]; then printf 'example/repository\\n';
      else printf 'develop\\n'; fi ;;
    'project create') printf '1\\n' ;;
    'project view') printf 'project-id\\n' ;;
    'project list')
      if [[ "$ORBI_TEST_MODE" == existing ]]; then printf '4\\n'; fi ;;
    'project field-list')
      if [[ "$ORBI_TEST_MODE" == existing ]]; then printf 'Existing field\\n'; fi ;;
    'api --paginate')
      if [[ "$ORBI_TEST_MODE" == existing ]]; then
        if [[ "$*" == *milestones* ]]; then printf '7\\n';
        elif [[ "$*" == *rulesets* ]]; then printf '8\\n'; fi
      fi ;;
  esac
  return 0
}
export -f node gh
bash "$@"
`;

for (const mode of ["apply", "dry-run", "invalid", "custom-checks", "invalid-checks", "existing"]) {
  test(`bootstrap: ${mode} with mocked GitHub CLI`, { skip: !bashAvailable }, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "orbi bootstrap-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const labels = join(directory, "labels.yml");
    writeFileSync(labels, mode === "invalid" ? "labels: [{}]\n" : readFileSync(template, "utf8"));
    const milestones = join(directory, "milestones.yml");
    const milestoneTemplate = readFileSync(new URL("../templates/github/milestones.yml", import.meta.url), "utf8");
    writeFileSync(milestones, milestoneTemplate.replace(/\r?\n/g, "\r\n"));
    const project = join(directory, "project.yml");
    const projectTemplate = readFileSync(new URL("../templates/github/project.yml", import.meta.url), "utf8")
      .replace("{{PROJECT_NAME}}", "Example Delivery");
    writeFileSync(project, projectTemplate.replace(/\r?\n/g, "\r\n"));
    const log = join(directory, "gh.log");
    const ruleset = join(directory, "ruleset.json");
    const customChecks = ['Build "production"', "Integration tests"];
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
        ORBI_TEST_MODE: mode,
        ORBI_TEST_MOCK: pathToFileURL(mock).href,
        ORBI_TEST_LOG: log.replaceAll("\\", "/"),
        ORBI_TEST_RULESET: ruleset.replaceAll("\\", "/"),
        ...(mode === "custom-checks"
          ? { ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS: JSON.stringify(customChecks) }
          : mode === "invalid-checks"
            ? { ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS: '[""]' }
            : { ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS: JSON.stringify(workflowChecks) }),
        ORBI_DEV_TOOLS_LABELS_FILE: labels.replaceAll("\\", "/"),
        ORBI_DEV_TOOLS_MILESTONES_FILE: milestones.replaceAll("\\", "/"),
        ORBI_DEV_TOOLS_PROJECT_FILE: project.replaceAll("\\", "/"),
      },
    });
    const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
    if (mode === "invalid" || mode === "invalid-checks") {
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, mode === "invalid" ? /labels\[0\]\.name/ : /github.requiredStatusChecks/);
      assert.deepEqual(calls, []);
    } else {
      assert.equal(result.status, 0, result.stderr);
      const labelCalls = calls.filter((line) => line.startsWith("label\tcreate\t"));
      if (mode !== "dry-run") {
        assert.equal(labelCalls.length, 13);
        assert.ok(labelCalls[0].includes("status: needs-triage\t"));
        assert.ok(labelCalls[12].includes("area: devx-ci\t"));
        const payload = JSON.parse(readFileSync(ruleset, "utf8"));
        const statusRule = payload.rules.find((rule) => rule.type === "required_status_checks");
        assert.deepEqual(
          statusRule.parameters.required_status_checks.map((check) => check.context),
          mode === "custom-checks" ? customChecks : workflowChecks,
        );
        const milestoneCalls = calls.filter((line) => line.startsWith("api\t--method\t") && line.includes("/milestones"));
        assert.equal(milestoneCalls.length, 3);
        const milestoneDefinitions = parse(milestoneTemplate).milestones;
        milestoneDefinitions.forEach(({ title, description }, index) => {
          assert.ok(milestoneCalls[index].includes(`title=${title}\t`));
          assert.ok(milestoneCalls[index].includes(`description=${description}\t`));
          assert.ok(milestoneCalls[index].includes(mode === "existing" ? "PATCH\t" : "POST\t"));
        });
        assert.ok(calls.some((line) => line.startsWith("project\tlink\t")));
        const metadata = calls.find((line) => line.startsWith("api\tgraphql\t"));
        assert.ok(metadata.includes("title=Example Delivery\t"));
        assert.ok(metadata.includes("shortDescription=Product and engineering delivery tracking.\t"));
        assert.ok(metadata.includes("readme=Track outcomes, keep work small enough to review, and attach observable acceptance criteria."));
        assert.ok(!metadata.includes("\r"));
        const fieldCalls = calls.filter((line) => line.startsWith("project\tfield-create\t"));
        if (mode === "existing") {
          assert.deepEqual(fieldCalls, []);
          assert.ok(!calls.some((line) => line.startsWith("project\tcreate\t")));
          assert.ok(calls.some((line) => line.includes("PUT\trepos/example/repository/rulesets/8")));
        } else {
          assert.equal(fieldCalls.length, 3);
          assert.ok(fieldCalls[0].includes("--name\tDelivery status\t"));
          assert.ok(fieldCalls[0].includes("--single-select-options\tInbox,Ready,In progress,In review,Done"));
          assert.ok(fieldCalls[1].includes("--name\tPriority\t"));
          assert.ok(fieldCalls[2].includes("--name\tEffort\t"));
        }
      } else {
        assert.deepEqual(labelCalls, []);
        assert.equal(result.stdout.split("[dry-run] gh label create ").length - 1, 13);
        assert.ok(calls.every((line) => !line.includes("--method\t")));
        assert.equal(existsSync(ruleset), false);
        const payloadStart = result.stdout.indexOf('{\n  "name":');
        const payloadEnd = result.stdout.indexOf("\n}\n", payloadStart) + 2;
        const payload = JSON.parse(result.stdout.slice(payloadStart, payloadEnd));
        const statusRule = payload.rules.find((rule) => rule.type === "required_status_checks");
        assert.deepEqual(
          statusRule.parameters.required_status_checks.map((check) => check.context),
          workflowChecks,
        );
      }
    }
  });
}
