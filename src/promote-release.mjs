import { loadConfig } from './config.mjs';
import { run } from './command.mjs';

export async function promoteRelease(arguments_) {
  const { config, root } = loadConfig();
  const { integration, release } = config.branches;
  run('git', ['fetch', 'origin', release, integration, '--quiet'], { cwd: root });
  const ahead = run('git', ['rev-list', '--count', `origin/${release}..origin/${integration}`], { cwd: root, capture: true });
  if (ahead === '0') throw new Error(`${integration} has no commits ahead of ${release}; nothing to promote.`);
  run('gh', [
    'pr', 'create', '--base', release, '--head', integration,
    '--title', `chore: promote ${integration} to ${release}`,
    '--body', `Promotes ${integration} to ${release}. Merging this pull request triggers release-please.`,
    ...arguments_,
  ], { cwd: root });
}
