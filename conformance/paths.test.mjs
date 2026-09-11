import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathCandidates, selectPathCandidate } from '../paths/pathResolution.ts';
const cases = JSON.parse(readFileSync(new URL('../paths/cases.json', import.meta.url), 'utf8'));
for (const c of cases) assert.deepEqual(pathCandidates(c.text,c.windows,c.source,c.distros).map(p=>p.path), c.paths, c.text);
const candidates = pathCandidates('/tmp/a.md', true, null, ['Ubuntu','Debian']);
assert.equal(selectPathCandidate(candidates,[true,true]),null);
assert.equal(selectPathCandidate(candidates,[false,false]),null);
assert.equal(selectPathCandidate(candidates,[false,true]).distro,'Debian');
const patterns = JSON.parse(readFileSync(new URL('../paths/patterns.json', import.meta.url), 'utf8'));
const text = 'read /tmp/shefrd-e05e0c5b-handoff.md and Z:\\home\\stevenp\\x.png';
assert.deepEqual([...text.matchAll(new RegExp(patterns.posix,'g'))].map(m=>m[0]), ['/tmp/shefrd-e05e0c5b-handoff.md']);
assert.deepEqual([...text.matchAll(new RegExp(patterns.windows,'g'))].map(m=>m[0]), ['Z:\\home\\stevenp\\x.png']);
assert.equal([...('https://example.org/tmp/a.md').matchAll(new RegExp(patterns.posix,'g'))].length,0);
console.log(`${cases.length} path cases plus ambiguity and detection checks passed.`);

for (const text of ["file:///C:/Users/a.md", "https://host/C:/a.txt"]) assert.equal([...text.matchAll(new RegExp(patterns.windows, "g"))].length, 0);
