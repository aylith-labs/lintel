import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'lintel-contributions-'));
try {
    mkdirSync(join(temp, 'conformance'));
    for (const script of ['add-preset.mjs', 'sync-file-types.mjs']) {
        cpSync(join(root, 'conformance', script), join(temp, 'conformance', script));
    }
    for (const item of ['presets.json', 'file-types.json', 'integrations', 'icons']) {
        cpSync(join(root, item), join(temp, item), { recursive: true });
    }
    const run = (script, ...args) => spawnSync(process.execPath, [join(temp, 'conformance', script), ...args], { encoding: 'utf8' });
    const original = readFileSync(join(temp, 'presets.json'), 'utf8');
    const flags = ['--id', 'example-tasks', '--label', 'Example tasks', '--integration', 'example', '--match', 'text', '--example', 'EX-123', '--description', 'Open a task', '--pattern', '\\b(?<task>EX-\\d+)\\b'];
    const url = ['--url', 'https://example.com/tasks/{{task}}'];
    assert.equal(run('add-preset.mjs', ...flags, ...url, '--dry-run').status, 0);
    assert.equal(readFileSync(join(temp, 'presets.json'), 'utf8'), original, 'dry run leaves catalog untouched');
    assert.ok(!existsSync(join(temp, 'integrations/example.json')), 'dry run creates no manifest');
    assert.notEqual(run('add-preset.mjs', ...flags, '--url', 'https://example.com/{{missing}}').status, 0, 'unknown capture rejected');
    assert.notEqual(run('add-preset.mjs', ...flags, '--url', 'file:///tmp/{{task}}').status, 0, 'non-web details URL rejected');
    assert.notEqual(run('add-preset.mjs', ...flags.slice(2), ...url).status, 0, 'missing ID rejected');
    assert.equal(run('add-preset.mjs', ...flags, ...url).status, 0);
    const manifest = JSON.parse(readFileSync(join(temp, 'integrations/example.json'), 'utf8'));
    assert.equal(manifest.matchers[0].link, url[1]);
    const saved = JSON.parse(readFileSync(join(temp, 'presets.json'), 'utf8'));
    assert.equal(saved.presets.at(-1).integration, 'example');
    assert.notEqual(run('add-preset.mjs', ...flags, ...url).status, 0, 'duplicate ID rejected');
    assert.equal(run('add-preset.mjs', '--id', 'unblocked-alternate', '--label', 'Unblocked tasks', '--integration', 'unblocked', '--match', 'text', '--example', 'UNB-456', '--description', 'Open task', '--dry-run').status, 0, 'existing matcher reused');

    const terminal = join(temp, 'terminal'), torbie = join(temp, 'torbie');
    const sync = (...args) => run('sync-file-types.mjs', '--terminal', terminal, '--torbie', torbie, ...args);
    assert.equal(sync().status, 0);
    assert.equal(sync('--check').status, 0);
    writeFileSync(join(terminal, 'src/cascadia/CascadiaPackage/IntegrationIcons/files/typescript.png'), 'drift');
    assert.notEqual(sync('--check').status, 0, 'stale native icon rejected');
    assert.equal(sync().status, 0);
    writeFileSync(join(torbie, 'tabby-links/src/fileTypes.generated.ts'), 'drift');
    assert.notEqual(sync('--check').status, 0, 'stale TypeScript metadata rejected');
    const types = JSON.parse(readFileSync(join(temp, 'file-types.json'), 'utf8'));
    types.types[1].extensions.push(types.types[0].extensions[0]);
    writeFileSync(join(temp, 'file-types.json'), JSON.stringify(types));
    assert.notEqual(sync().status, 0, 'ambiguous extension rejected');
    console.log('Contribution wizard, URL resolution, file metadata and icon parity regression tests passed.');
} finally {
    assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep));
    rmSync(temp, { recursive: true, force: true });
}
