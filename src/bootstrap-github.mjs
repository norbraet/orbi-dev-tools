import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.mjs";
import { run } from "./command.mjs";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const script = resolve(packageDirectory, "../scripts/bootstrap-github.sh");

export async function bootstrapGitHub(arguments_) {
  const { config, root } = loadConfig();
  run("bash", [script, ...arguments_], {
    cwd: root,
    env: {
      ORBI_DEV_TOOLS_LABELS_FILE: config.github.labelsFile,
      ORBI_DEV_TOOLS_MILESTONES_FILE: config.github.milestonesFile,
      ORBI_DEV_TOOLS_PROJECT_FILE: config.github.projectFile,
      ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS: JSON.stringify(config.github.requiredStatusChecks),
      ORBI_DEV_TOOLS_RELEASE_BRANCH: config.branches.release,
      ORBI_DEV_TOOLS_INTEGRATION_BRANCH: config.branches.integration,
    },
  });
}
