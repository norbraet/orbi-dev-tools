import test from 'node:test';
import assert from 'node:assert/strict';
import { branchContainsIssue, conventionalCommitHeaderIsValid } from '../src/conventional-commits.mjs';

const types = ['feat', 'fix', 'chore'];

test('accepts conventional commit headers', () => {
  assert.equal(conventionalCommitHeaderIsValid('feat(game): add setup flow', types), true);
  assert.equal(conventionalCommitHeaderIsValid('fix!: remove legacy API', types), true);
});

test('rejects non-conventional commit headers', () => {
  assert.equal(conventionalCommitHeaderIsValid('add setup flow', types), false);
  assert.equal(conventionalCommitHeaderIsValid('docs: add guide', types), false);
});

test('recognizes issue branches for enabled types', () => {
  assert.equal(branchContainsIssue('feat/12-game-setup', types), true);
  assert.equal(branchContainsIssue('feature/12-game-setup', types), false);
});
