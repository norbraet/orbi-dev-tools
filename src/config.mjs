import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const defaultConfig = Object.freeze({
  branches: { integration: 'develop', release: 'main', protected: ['main', 'master', 'develop'] },
  commits: {
    allowedTypes: ['feat', 'fix', 'deps', 'docs', 'refactor', 'perf', 'test', 'chore', 'build', 'ci', 'style', 'revert'],
  },
  pullRequests: { template: '.github/PULL_REQUEST_TEMPLATE.md', requireIssueBranchPrefix: true },
  github: {
    labelsFile: '.github/labels.yml', milestonesFile: '.github/milestones.yml', projectFile: '.github/project.yml',
  },
});

function mergeConfig(defaults, override) {
  return {
    ...defaults,
    ...override,
    branches: { ...defaults.branches, ...override.branches },
    commits: { ...defaults.commits, ...override.commits },
    pullRequests: { ...defaults.pullRequests, ...override.pullRequests },
    github: { ...defaults.github, ...override.github },
  };
}

export function loadConfig(startDirectory = process.cwd()) {
  let directory = resolve(startDirectory);
  while (true) {
    const file = resolve(directory, '.orbi-dev-tools.json');
    if (existsSync(file)) {
      try {
        return { root: directory, config: mergeConfig(defaultConfig, JSON.parse(readFileSync(file, 'utf8'))) };
      } catch (error) {
        throw new Error(`Cannot read ${file}: ${error.message}`);
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return { root: resolve(startDirectory), config: defaultConfig };
    directory = parent;
  }
}
