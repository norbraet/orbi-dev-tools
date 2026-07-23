import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCommitMessage } from '../src/validate-commit-message.mjs';

test('validates a commit-message file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orbi-dev-tools-'));
  const file = join(directory, 'COMMIT_EDITMSG');
  writeFileSync(file, 'feat(game): add setup flow\n\nBody text is unrestricted.\n');
  try {
    await validateCommitMessage([file]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects invalid inline commit messages', async () => {
  await assert.rejects(validateCommitMessage(['--message', 'add setup flow']), /Invalid commit message/);
});
