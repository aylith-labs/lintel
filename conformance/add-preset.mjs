#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log('Add a validated preset interactively: npm run preset:add\nOr: npm run preset:add -- --id unblocked-example --label "Task IDs" --integration unblocked --match text --example UNB-123 --description "Open coding tasks"\nFor a new integration also pass --pattern and --url (with named capture templates).\nUse --dry-run to validate without writing.');
    process.exit(0);
}
const options = {};
for (let i=0;i<args.length;i++) if(args[i].startsWith('--') && !['--dry-run'].includes(args[i])) { assert.ok(args[i+1] && !args[i+1].startsWith('--'), `missing ${args[i]} value`); options[args[i].slice(2)] = args[++i]; }
const reader = process.stdin.isTTY ? createInterface({input:process.stdin,output:process.stdout}) : null;
try {
    for (const [key,prompt] of [['id','Unique preset ID (lowercase-with-hyphens)'],['label','Display name'],['integration','Integration ID (blank for a custom pattern)'],['match','Match kind (text or link)'],['example','A real matching example'],['description','What this preset does']]) {
        if(options[key] === undefined && reader) options[key] = (await reader.question(`${prompt}: `)).trim();
    }
    const catalog = JSON.parse(readFileSync(join(root,'presets.json'),'utf8'));
    assert.ok(typeof options.id === 'string' && /^[a-z][a-z0-9-]*$/.test(options.id), 'id must use lowercase letters, digits and hyphens');
    assert.ok(!catalog.presets.some(p=>p.id===options.id), 'preset ID already exists');
    for(const key of ['label','example','description']) assert.ok(options[key], `${key} is required`);
    assert.ok(['text','link'].includes(options.match), 'match must be text or link');
    const integration = options.integration ?? '';
    assert.ok(!integration || /^[a-z][a-z0-9-]*$/.test(integration), 'invalid integration ID');
    let newManifest;
    if(integration) {
        const manifestPath = join(root,'integrations',`${integration}.json`);
        let manifest;
        if(existsSync(manifestPath)) manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
        else {
            if(reader && !options.pattern) options.pattern=await reader.question('Matcher regex, with named captures: ');
            if(reader && !options.url) options.url=await reader.question('Details URL template, e.g. https://example.com/task/{{task}}: ');
            assert.ok(options.pattern && options.url, 'new integration needs --pattern and --url');
            assert.ok(/^https?:\/\//.test(options.url), 'details URL must use http or https');
            const exampleMatch = new RegExp(options.pattern).exec(options.example);
            assert.ok(exampleMatch, 'pattern must match the example');
            const resolved = options.url.replace(/\{\{([^{}]+)\}\}/g, (_, key) => {
                assert.ok(Object.hasOwn(exampleMatch.groups ?? {}, key), `URL template names unknown capture: ${key}`);
                return exampleMatch.groups[key];
            });
            assert.ok(['http:', 'https:'].includes(new URL(resolved).protocol), 'details URL must resolve to an HTTP URL');
            manifest={id:integration,name:options.label,version:1,settings:[],credentials:[],matchers:[{kind:options.match,pattern:options.pattern,...(options.match==='text'?{link:options.url,suggested:true}:{}),description:options.description}],fetch:[],fields:[]};
            newManifest=manifest;
        }
        assert.equal(manifest.matchers.filter(m=>(m.kind??'link')===options.match && new RegExp(m.pattern).test(options.example)).length,1,'example must match exactly one integration matcher');
    } else {
        if(reader && !options.pattern) options.pattern=await reader.question('Matcher regex: ');
        assert.ok(options.pattern && new RegExp(options.pattern).test(options.example),'pattern must match the example');
    }
    const preset={id:options.id,integration,label:options.label,description:options.description,match:options.match,example:options.example,preview:!!integration,...(!integration?{pattern:options.pattern}:{})};
    console.log(JSON.stringify({preset,...(newManifest?{manifest:newManifest}:{})},null,4));
    if(!args.includes('--dry-run')) {
        if(newManifest) writeFileSync(join(root,'integrations',`${integration}.json`),JSON.stringify(newManifest,null,4)+'\n');
        catalog.presets.push(preset);
        writeFileSync(join(root,'presets.json'),JSON.stringify(catalog,null,4)+'\n');
        console.log('Saved. Run npm test, then open a pull request. See CONTRIBUTING.md for host synchronization.');
    }
} finally { reader?.close(); }
