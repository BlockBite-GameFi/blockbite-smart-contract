#!/usr/bin/env node
/**
 * Pasal 27 Auto-Guard — TypeScript Check Hook
 * Runs after every Write|Edit on a .ts/.tsx file.
 * Async + asyncRewake: runs in background; exits 2 on error → wakes the model.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const PROJ = path.resolve(__dirname, '..', '..');

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const file = input.tool_input?.file_path || input.tool_response?.filePath || '';

    // Only check TypeScript/TSX files
    if (!/\.(ts|tsx)$/.test(file)) process.exit(0);

    const tsc = path.join(PROJ, 'node_modules', 'typescript', 'lib', 'tsc.js');
    const result = spawnSync(process.execPath, [tsc, '--noEmit'], {
      cwd: PROJ,
      encoding: 'utf8',
      timeout: 120_000,
    });

    if (result.status !== 0) {
      const raw_out = (result.stdout || result.stderr || 'Unknown TypeScript error');
      // Show first 15 error lines to keep message concise
      const lines = raw_out.split('\n').filter(l => l.trim()).slice(0, 15).join('\n');
      process.stdout.write(
        JSON.stringify({ systemMessage: `⚠️ TypeScript errors (pasal-27 guard):\n${lines}` })
      );
      process.exit(2); // exit 2 = asyncRewake triggers model wake-up
    }

    // Success — silent, don't print anything
    process.exit(0);
  } catch (_) {
    process.exit(0); // Never block on parse failure
  }
});
