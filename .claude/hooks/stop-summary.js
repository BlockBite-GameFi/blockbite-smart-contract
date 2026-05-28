#!/usr/bin/env node
/**
 * Pasal 27 Auto-Guard — Session Stop Summary Hook
 * Runs when Claude session ends. Shows a git summary so the
 * developer always knows what changed — zero manual inspection needed.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const PROJ = path.resolve(__dirname, '..', '..');

function git(...args) {
  const r = spawnSync('git', args, { cwd: PROJ, encoding: 'utf8', timeout: 8000 });
  return (r.stdout || '').trim();
}

const log  = git('log', '--oneline', '-6');
const stat = git('diff', '--stat', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');

const lines = [];
lines.push(`🛡️  Pasal 27 Guard — Session Selesai`);
lines.push(`Branch: ${branch || 'unknown'}`);

if (stat) {
  lines.push('');
  lines.push('Unstaged changes:');
  lines.push(stat);
}

if (log) {
  lines.push('');
  lines.push('Last 6 commits:');
  lines.push(log);
}

if (!stat && !log) {
  lines.push('Nothing changed this session.');
}

process.stdout.write(JSON.stringify({ systemMessage: lines.join('\n') }));
process.exit(0);
