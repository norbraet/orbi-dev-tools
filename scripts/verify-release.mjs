import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/command.mjs";

export function verifyRelease(tag, cwd = process.cwd()) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? "")) {
    throw new Error("Expected a stable release tag such as v0.1.0.");
  }
  const git = (args) => run("git", args, { cwd, capture: true });
  const commit = git(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);

  // Only publish commits that have reached the repository's main branch.
  git(["merge-base", "--is-ancestor", commit, "origin/main"]);

  const readAtRelease = (file) => git(["show", `${commit}:${file}`]);
  const manifest = JSON.parse(readAtRelease(".release-please-manifest.json"));
  const pkg = JSON.parse(readAtRelease("package.json"));
  const versionPattern = pkg.version.replaceAll(".", "\\.");

  if (tag !== `v${pkg.version}`) {
    throw new Error(
      `Tag ${tag} does not match package version ${pkg.version}.`,
    );
  }

  if (
    pkg.name !== "@norbraet/orbi-dev-tools" ||
    pkg.private === true ||
    pkg.publishConfig?.access !== "public" ||
    pkg.publishConfig?.registry !== "https://registry.npmjs.org/" ||
    pkg.repository?.url !== "git+https://github.com/norbraet/orbi-dev-tools.git"
  ) {
    throw new Error(
      "Release metadata must identify the public npm package and its GitHub repository.",
    );
  }

  if (manifest["."] !== pkg.version) {
    throw new Error("Release manifest and package versions do not match.");
  }

  if (
    !new RegExp(`^## (?:\\[)?${versionPattern}(?:\\]|\\s|$)`, "m").test(
      readAtRelease("CHANGELOG.md"),
    )
  ) {
    throw new Error(`CHANGELOG.md has no release entry for ${pkg.version}.`);
  }
  return { commit, version: pkg.version };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const release = verifyRelease(process.argv[2]);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `commit=${release.commit}\n`);
    }
    console.log(`Verified ${process.argv[2]} at ${release.commit}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
