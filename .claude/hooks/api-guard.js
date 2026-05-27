#!/usr/bin/env node
/**
 * Pasal 27 Auto-Guard — API Auth Check Hook
 * Runs after Write|Edit on any app/api/...route.ts file.
 * Fast grep scan (<200ms). Wakes model (exit 2) if admin-gated
 * route is missing its auth check.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJ = path.resolve(__dirname, '..', '..');

// Routes that MUST have auth — any POST/PUT/DELETE on these needs isAdmin/checkToken
const ADMIN_ROUTES = [
  'app/api/admin/route.ts',
  'app/api/waitlist/list/route.ts',
  'app/api/quests/route.ts',
];

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const file = input.tool_input?.file_path || '';

    // Only scan if an API route was edited
    if (!/app[\\/]api[\\/].*route\.ts$/.test(file)) process.exit(0);

    const issues = [];

    for (const rel of ADMIN_ROUTES) {
      const abs = path.join(PROJ, rel);
      if (!fs.existsSync(abs)) continue;
      const src = fs.readFileSync(abs, 'utf8');

      // Check for mutating methods
      const hasMutating = /^export\s+async\s+function\s+(POST|PUT|DELETE|PATCH)/m.test(src);
      if (!hasMutating) continue;

      // Check for auth guard
      const hasAuth = /isAdmin|checkToken|timingSafeEqual|ADMIN_TOKEN|ADMIN_SECRET/.test(src);
      if (!hasAuth) {
        issues.push(`⚠ ${rel} — POST/DELETE/PUT found but no auth check`);
      }
    }

    if (issues.length > 0) {
      process.stdout.write(
        JSON.stringify({
          systemMessage: `🔐 API auth guard (pasal-27):\n${issues.join('\n')}\nFix before proceeding.`,
        })
      );
      process.exit(2); // Wake model
    }

    process.exit(0);
  } catch (_) {
    process.exit(0);
  }
});
