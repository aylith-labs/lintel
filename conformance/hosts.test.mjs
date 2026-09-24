import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(root, '.hosts-test-'));
const run = path => spawnSync(process.execPath, [join(root, 'conformance/run.mjs'), '--torbie', path], { encoding: 'utf8' });

try {
  const unpinned = spawnSync(process.execPath, [join(root, 'conformance/run.mjs')], { encoding: 'utf8' });
  if (unpinned.stdout.includes('not checked out here, skipped')) {
    assert.match(unpinned.stdout, /Canonical data validated; no hosts checked/);
  }
  cpSync(join(root, 'integrations'), temp, { recursive: true });
  const matching = run(temp);
  assert.equal(matching.status, 0, matching.stderr);
  assert.match(matching.stdout, /Torbie: checked \d+ manifests/);
  assert.doesNotMatch(matching.stdout, /Windows Terminal/);

  const missing = run(join(temp, 'absent'));
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Torbie: manifest directory does not exist/);

  const jira = join(temp, 'jira.json');
  const drifted = JSON.parse(await (await import('node:fs/promises')).readFile(jira, 'utf8'));
  drifted.matchers = [];
  writeFileSync(jira, JSON.stringify(drifted));
  const drift = run(temp);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /Torbie: jira.json differs at matchers/);
  console.log('Pinned host conformance passed.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
