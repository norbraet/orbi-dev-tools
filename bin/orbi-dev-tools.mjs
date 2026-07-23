#!/usr/bin/env node

import { basename } from 'node:path';
import { validateCommitMessage } from '../src/validate-commit-message.mjs';
import { forbidProtectedBranch } from '../src/forbid-protected-branch.mjs';
import { createPullRequest } from '../src/create-pr.mjs';
import { promoteRelease } from '../src/promote-release.mjs';
import { bootstrapGitHub } from '../src/bootstrap-github.mjs';

const commands = {
  'validate-commit-message': validateCommitMessage,
  'forbid-protected-branch': forbidProtectedBranch,
  'create-pr': createPullRequest,
  'promote-release': promoteRelease,
  'bootstrap-github': bootstrapGitHub,
};

function printUsage() {
  console.log(`Usage: ${basename(process.argv[1])} <command> [options]

Commands:
  validate-commit-message <file> | --message <message>
  forbid-protected-branch [--operation <name>]
  create-pr [--base <branch>] [gh pr create options]
  promote-release [gh pr create options]
  bootstrap-github [--dry-run]

Configuration: .orbi-dev-tools.json in the current project or a parent directory.`);
}

const [command, ...arguments_] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  printUsage();
  process.exitCode = command ? 0 : 2;
} else if (!(command in commands)) {
  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exitCode = 2;
} else {
  try {
    await commands[command](arguments_);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
