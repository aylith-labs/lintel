import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const patterns = JSON.parse(readFileSync(join(root, 'paths/patterns.json'), 'utf8'));
const args = process.argv.slice(2);
const check = args.includes('--check');
if (!args.includes('--terminal') && !args.includes('--torbie')) throw new Error('Pass --terminal <checkout> and/or --torbie <checkout>.');
const banner = '// Shared from Lintel paths/. Run conformance/sync-paths.mjs to update.\n';
for (const [flag, dest, source] of [
    ['--terminal', 'src/inc/LintelPaths.h', 'PathResolution.h'],
    ['--torbie', 'tabby-links/src/pathResolution.ts', 'pathResolution.ts'],
]) {
    const index = args.indexOf(flag); if (index < 0) continue;
    const target = join(args[index + 1], dest);
    const text = banner + readFileSync(join(root, 'paths', source), 'utf8').replace(/\r\n/g, '\n');
    mkdirSync(dirname(target), { recursive: true });
    if (check) assert.equal(readFileSync(target, 'utf8').replace(/\r\n/g, '\n'), text);
    else writeFileSync(target, text);
}
for (const [flag, dest, text] of [
    ['--terminal','src/inc/LintelPathPatterns.h', '#pragma once\n#include <string_view>\nnamespace Lintel {\n' + ['windows','posix'].map(key => 'inline constexpr std::wstring_view ' + key + 'PathPattern = LR"lintel(' + patterns[key] + ')lintel";').join('\n') + '\n}\n'],
    ['--torbie','tabby-links/src/pathPatterns.ts', 'export const pathPatterns = ' + JSON.stringify(patterns,null,4) + ' as const\n'],
]) {
    const index = args.indexOf(flag); if (index < 0) continue;
    const target = join(args[index + 1], dest);
    mkdirSync(dirname(target), { recursive: true });
    if (check) assert.equal(readFileSync(target,'utf8').replace(/\r\n/g,'\n'),banner+text);
    else writeFileSync(target,banner+text);
}
console.log('Shared path policy and detection patterns are synchronized.');
