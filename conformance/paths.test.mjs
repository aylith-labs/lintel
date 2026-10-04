import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathCandidates, selectPathCandidate } from '../paths/pathResolution.ts';
const cases = JSON.parse(readFileSync(new URL('../paths/cases.json', import.meta.url), 'utf8'));
for (const c of cases) assert.deepEqual(pathCandidates(c.text,c.windows,c.source,c.distros,c.homes ?? {}).map(p=>p.path), c.paths, c.text);
const candidates = pathCandidates('/tmp/a.md', true, null, ['Ubuntu','Debian']);
assert.equal(selectPathCandidate(candidates,[true,true]),null);
assert.equal(selectPathCandidate(candidates,[false,false]),null);
assert.equal(selectPathCandidate(candidates,[false,true]).distro,'Debian');
const patterns = JSON.parse(readFileSync(new URL('../paths/patterns.json', import.meta.url), 'utf8'));
const text = 'read /tmp/shefrd-e05e0c5b-handoff.md and Z:\\home\\stevenp\\x.png';
assert.deepEqual([...text.matchAll(new RegExp(patterns.posix,'g'))].map(m=>m[0]), ['/tmp/shefrd-e05e0c5b-handoff.md']);
assert.deepEqual([...text.matchAll(new RegExp(patterns.windows,'g'))].map(m=>m[0]), ['Z:\\home\\stevenp\\x.png']);
assert.equal([...('https://example.org/tmp/a.md').matchAll(new RegExp(patterns.posix,'g'))].length,0);
// A leading ~ belongs to the path, so the home is not lost and the rest is not read as an absolute path.
const home = 'Read ~/.claude/plans/notes-tui-handoff-prompt.md and do what it says.';
assert.deepEqual([...home.matchAll(new RegExp(patterns.posix,'g'))].map(m=>m[0]), ['~/.claude/plans/notes-tui-handoff-prompt.md']);
assert.equal([...('a~/b c:~/d https://h/~u/x').matchAll(new RegExp(patterns.posix,'g'))].length,0);
// Sentence punctuation never ends a path, though it may appear inside one.
const ends = (re, s) => [...s.matchAll(new RegExp(patterns[re],'g'))].map(m=>m[0]);
assert.deepEqual(ends('posix', 'Prompt ready at ~/.claude/plans/notes-tui-handoff-prompt.md.'), ['~/.claude/plans/notes-tui-handoff-prompt.md']);
assert.deepEqual(ends('posix', 'is it /tmp/a.tar.gz? or /etc/hosts! or /srv/x: yes'), ['/tmp/a.tar.gz', '/etc/hosts', '/srv/x']);
assert.deepEqual(ends('posix', 'keep /tmp/a.b/c and /tmp/x.d'), ['/tmp/a.b/c', '/tmp/x.d']);
assert.deepEqual(ends('windows', String.raw`see C:\Users\steve\a.md. and Z:\x\y.png?`), [String.raw`C:\Users\steve\a.md`, String.raw`Z:\x\y.png`]);
console.log(`${cases.length} path cases plus ambiguity and detection checks passed.`);

for (const text of ["file:///C:/Users/a.md", "https://host/C:/a.txt"]) assert.equal([...text.matchAll(new RegExp(patterns.windows, "g"))].length, 0);
