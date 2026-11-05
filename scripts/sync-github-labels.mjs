import { readLabels, synchronizeLabels } from "../src/github-labels.mjs";

const [file, repository, ...options] = process.argv.slice(2);
try {
  if (repository === "--validate") {
    readLabels(file);
  } else {
    synchronizeLabels(file, repository, {
      dryRun: options.includes("--dry-run"),
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
