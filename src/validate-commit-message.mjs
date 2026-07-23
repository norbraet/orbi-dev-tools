import { readFileSync } from 'node:fs';
import { loadConfig } from './config.mjs';
import { conventionalCommitHeaderIsValid } from './conventional-commits.mjs';

export async function validateCommitMessage(arguments_) {
  const { config } = loadConfig();
  const messageIndex = arguments_.indexOf('--message');
  const message = messageIndex === -1
    ? readFileSync(arguments_[0] ?? '', 'utf8').split(/\r?\n/, 1)[0]
    : arguments_[messageIndex + 1];
  if (!message) throw new Error('Expected a commit-message file path or --message.');
  if (conventionalCommitHeaderIsValid(message.replace(/\r$/, ''), config.commits.allowedTypes)) return;
  throw new Error(`Invalid commit message. Use type(optional-scope)!?: description. Allowed types: ${config.commits.allowedTypes.join(', ')}.`);
}
