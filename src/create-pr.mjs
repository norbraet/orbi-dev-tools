import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import {
  branchContainsIssue,
  conventionalCommitHeaderIsValid,
} from "./conventional-commits.mjs";
import { optionValue, run } from "./command.mjs";

export async function createPullRequest(arguments_) {
  const { config, root } = loadConfig();
  const branch = run("git", ["branch", "--show-current"], {
    cwd: root,
    capture: true,
  });
  if (!branch)
    throw new Error("Cannot create a pull request from a detached HEAD.");
  const subject = run("git", ["log", "-1", "--pretty=%s"], {
    cwd: root,
    capture: true,
  });
  const title = conventionalCommitHeaderIsValid(
    subject,
    config.commits.allowedTypes,
  )
    ? subject
    : `${branch.split("/")[0]}: ${branch.replace(/^[^/]+\/\d+-/, "")}`;
  if (!conventionalCommitHeaderIsValid(title, config.commits.allowedTypes)) {
    throw new Error(
      `The latest commit does not have a Conventional Commit title: ${subject}`,
    );
  }
  if (
    config.pullRequests.requireIssueBranchPrefix &&
    !branchContainsIssue(branch, config.commits.allowedTypes)
  ) {
    throw new Error(
      `Branch ${branch} must use type/<issue-number>-<description> format.`,
    );
  }
  const base = optionValue(arguments_, "--base") ?? config.branches.integration;
  const templateFile = join(root, config.pullRequests.template);
  if (!existsSync(templateFile))
    throw new Error(`Pull request template not found: ${templateFile}`);
  const issueNumber = branch.match(/^[^/]+\/(\d+)-/)?.[1];
  const commits =
    run("git", ["log", "--reverse", "--format=- %s", `${base}..HEAD`], {
      cwd: root,
      capture: true,
    }) || "- No commits found.";
  const body = readFileSync(templateFile, "utf8")
    .replace(
      "<!-- LINKED_ISSUE -->",
      issueNumber ? `Closes #${issueNumber}` : "",
    )
    .replace("<!-- COMMIT_LIST -->", commits);
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "orbi-dev-tools-pr-"));
  const bodyFile = join(temporaryDirectory, "body.md");
  try {
    writeFileSync(bodyFile, body);
    const forwarded = arguments_.filter(
      (value, index) =>
        value !== "--base" && arguments_[index - 1] !== "--base",
    );
    run(
      "gh",
      [
        "pr",
        "create",
        "--base",
        base,
        "--title",
        title,
        "--body-file",
        bodyFile,
        ...forwarded,
      ],
      { cwd: root },
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
