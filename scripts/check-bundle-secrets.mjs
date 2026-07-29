#!/usr/bin/env node
/**
 * Fails the build if a credential ends up in the client bundle.
 *
 * Vite inlines every VITE_-prefixed variable into the JS it ships, so adding one
 * innocuous-looking env read is enough to publish a secret to every visitor.
 * That is exactly how the project's Gemini key ended up recoverable from
 * production with a single curl. This makes the same mistake fail loudly in CI
 * instead of silently shipping.
 *
 * Runs against dist/ after `npm run build`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

const PATTERNS = [
  { name: 'Google API key',            re: /AIza[0-9A-Za-z_\-]{30,}/ },
  { name: 'Postgres connection string', re: /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/ },
  { name: 'Neon DB password',          re: /npg_[A-Za-z0-9]{10,}/ },
  { name: 'Anthropic/MiniMax key',     re: /sk-(?:api|ant)-[A-Za-z0-9_\-]{20,}/ },
  { name: 'AWS access key id',         re: /AKIA[0-9A-Z]{16}/ },
];

// Deliberately no generic /password\s*[:=]\s*"…"/ rule. It matched
// autoComplete="current-password" in the sign-in form, and a check that fires
// on benign code is one people learn to ignore. Real credentials have
// recognisable prefixes; match those precisely instead.

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|mjs|cjs|css|html|map)$/.test(entry)) out.push(full);
  }
  return out;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`check-bundle-secrets: ${DIST}/ not found — run \`npm run build\` first.`);
  process.exit(1);
}

const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const { name, re } of PATTERNS) {
    const m = text.match(re);
    // Report the match redacted — never print a live credential into CI logs.
    if (m) findings.push({ file, name, preview: `${m[0].slice(0, 6)}…${m[0].slice(-4)}` });
  }
}

if (findings.length > 0) {
  console.error('\ncheck-bundle-secrets: FAILED — credentials found in the client bundle:\n');
  for (const f of findings) console.error(`  ${f.name}  in ${f.file}  (${f.preview})`);
  console.error(
    '\nA VITE_-prefixed variable is almost certainly being read from client code.\n' +
    'Move the secret to a non-VITE env var and use it only under api/.\n',
  );
  process.exit(1);
}

console.log(`check-bundle-secrets: OK — scanned ${files.length} files, no credentials found.`);
