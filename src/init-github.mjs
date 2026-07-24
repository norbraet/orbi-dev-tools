import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const templateDirectory = join(packageDirectory, "../templates/github");

function copyDirectory(source, target, replacements, force) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath, replacements, force);
      continue;
    }
    if (existsSync(targetPath) && !force) {
      console.log(`Skipped existing ${relative(process.cwd(), targetPath)}`);
      continue;
    }
    const content = Object.entries(replacements).reduce(
      (result, [placeholder, value]) =>
        result.replaceAll(`{{${placeholder}}}`, value),
      readFileSync(sourcePath, "utf8"),
    );
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content);
    console.log(`Created ${relative(process.cwd(), targetPath)}`);
  }
}

export async function initializeGitHub(arguments_) {
  const { config, root } = loadConfig();
  const owner = config.github.owner;
  if (!owner)
    throw new Error(
      "Set github.owner in .orbi-dev-tools.json before running init-github.",
    );
  copyDirectory(
    templateDirectory,
    join(root, ".github"),
    {
      OWNER: owner,
      INTEGRATION_BRANCH: config.branches.integration,
      RELEASE_BRANCH: config.branches.release,
      PROJECT_NAME: config.github.projectName ?? "Project Delivery",
      REPOSITORY: config.github.repositoryName ?? "repository-name",
    },
    arguments_.includes("--force"),
  );
}
