import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { run } from "./command.mjs";

export function readLabels(file) {
  try {
    const document = parse(readFileSync(file, "utf8"));
    if (!Array.isArray(document?.labels)) {
      throw new Error("Expected a labels array.");
    }
    const names = new Set();
    for (const [index, label] of document.labels.entries()) {
      const location = `labels[${index}]`;
      if (typeof label?.name !== "string" || !label.name.trim()) {
        throw new Error(`${location}.name must be a nonempty string.`);
      }
      if (typeof label.color !== "string" || !/^[0-9a-f]{6}$/i.test(label.color)) {
        throw new Error(`${location}.color must be a six-digit hex string.`);
      }
      if (typeof label.description !== "string") {
        throw new Error(`${location}.description must be a string.`);
      }
      const name = label.name.toLowerCase();
      if (names.has(name)) {
        throw new Error(`${location}.name duplicates label ${label.name}.`);
      }
      names.add(name);
    }
    return document.labels;
  } catch (error) {
    throw new Error(`Cannot read labels from ${file}: ${error.message}`, { cause: error });
  }
}

export function synchronizeLabels(
  file,
  repository,
  { dryRun = false, runCommand = run } = {},
) {
  const labels = readLabels(file);
  for (const { name, color, description } of labels) {
    runCommand(
      "gh",
      [
        "label",
        "create",
        name,
        "--repo",
        repository,
        "--color",
        color,
        "--description",
        description,
        "--force",
      ],
      { dryRun },
    );
  }
}
