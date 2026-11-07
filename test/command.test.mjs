import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/command.mjs";

test("returns an empty string after a successful inherited-output command", () => {
  assert.equal(run(process.execPath, ["-e", "process.exit(0)"]), "");
});

test("returns trimmed captured output", () => {
  assert.equal(
    run(process.execPath, ["-e", 'console.log("  command output  ")'], {
      capture: true,
    }),
    "command output",
  );
});

for (const capture of [false, true]) {
  test(`reports nonzero exits with capture=${capture}`, () => {
    assert.throws(
      () => run(process.execPath, ["-e", "process.exit(7)"], { capture }),
      (error) => error.message === `${process.execPath} exited with status 7`,
    );
  });
}

test("reports executable launch failures", () => {
  const missingCommand = `${process.execPath}.orbi-nonexistent`;
  assert.throws(
    () => run(missingCommand, []),
    (error) =>
      error.message.startsWith(`Cannot run ${missingCommand}: `) &&
      error.message.includes("ENOENT"),
  );
});
