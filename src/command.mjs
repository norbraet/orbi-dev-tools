import { spawnSync } from "node:child_process";

export function run(
  command,
  arguments_,
  { cwd = process.cwd(), dryRun = false, capture = false, env } = {},
) {
  if (dryRun) {
    console.log(
      `[dry-run] ${[command, ...arguments_].map(shellQuote).join(" ")}`,
    );
    return "";
  }
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    env: { ...process.env, ...env },
  });
  if (result.error)
    throw new Error(`Cannot run ${command}: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${command} exited with status ${result.status}`);
  return result.stdout.trim();
}

function shellQuote(value) {
  return /[^A-Za-z0-9_./:=@+-]/.test(value) ? JSON.stringify(value) : value;
}

export function optionValue(arguments_, name) {
  const index = arguments_.indexOf(name);
  if (index === -1) return undefined;
  if (!arguments_[index + 1]) throw new Error(`${name} requires a value.`);
  return arguments_[index + 1];
}
