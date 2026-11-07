import { loadConfig } from "./config.mjs";
import { optionValue, run } from "./command.mjs";

export async function forbidProtectedBranch(arguments_) {
  const { config, root } = loadConfig();
  const operation = optionValue(arguments_, "--operation") ?? "change";
  const branch = run("git", ["branch", "--show-current"], {
    cwd: root,
    capture: true,
  });
  if (config.branches.protected.includes(branch)) {
    throw new Error(
      `Direct ${operation} on the ${branch} branch is forbidden. Create a feature branch first.`,
    );
  }
}
