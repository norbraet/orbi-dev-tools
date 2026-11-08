import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/command.mjs";

for (const directory of ["bin", "src", "scripts"]) {
  const root = fileURLToPath(new URL(`../${directory}/`, import.meta.url));
  for (const file of readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (file.isFile() && file.name.endsWith(".mjs")) {
      run(process.execPath, ["--check", join(file.parentPath, file.name)]);
    }
  }
}
