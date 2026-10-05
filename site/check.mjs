import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { publicBase } from './src/public-paths.mjs';

const base = publicBase(process.env.LINTEL_BASE_PATH);
const root = resolve('dist');
const overview = readFileSync(join(root, 'index.html'), 'utf8');
if (overview !== readFileSync(join(root, 'home/index.html'), 'utf8')) throw new Error('/home must retain the full original overview');
let targets = 0;
for (const page of ['', 'home', 'spec', 'schemes', 'presets', 'schema', 'conformance', 'hosts']) {
	const html = readFileSync(join(root, page, 'index.html'), 'utf8');
	for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
		const href = match[1];
		if (/^(?:https?:|data:|mailto:|#)/.test(href)) continue;
		if (!href.startsWith(base + '/')) throw new Error('Incorrect public base: ' + href);
		const path = new URL(href, 'https://lintel.aylith.com').pathname.slice(base.length);
		let file = join(root, path);
		if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
		if (!existsSync(file)) throw new Error('Missing exported target: ' + href);
		targets++;
	}
}
for (const file of ['assets/search.json', 'assets/minisearch.js', 'schema/lintel-1.json']) {
	if (!existsSync(join(root, file))) throw new Error('Missing actual document/search asset: ' + file);
}
console.log(JSON.stringify({ base, targets, fullHome: true }));
