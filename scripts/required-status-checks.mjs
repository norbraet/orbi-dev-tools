import { defaultConfig } from "../src/config.mjs";

try {
  const checks = process.env.ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS === undefined
    ? defaultConfig.github.requiredStatusChecks
    : JSON.parse(process.env.ORBI_DEV_TOOLS_REQUIRED_STATUS_CHECKS);
  if (
    !Array.isArray(checks) ||
    checks.some((check) => typeof check !== "string" || !check.trim()) ||
    new Set(checks).size !== checks.length
  ) {
    throw new Error("Expected an array of unique, nonempty check names.");
  }
  console.log(JSON.stringify(checks.map((context) => ({ context }))));
} catch (error) {
  console.error(`Invalid github.requiredStatusChecks: ${error.message}`);
  process.exitCode = 1;
}
