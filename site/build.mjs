#!/usr/bin/env node
/**
 * lintel.aylith.com
 *
 * Every page is rendered from the repo's own files at build time. Nothing here
 * restates the standard, because a page that can disagree with the spec is a
 * fifth dialect -- and drifting copies are the problem this whole repo exists
 * to solve. If you want to change what the site says, change SPEC.md.
 *
 * No framework. The sibling site (aylith.com) is SvelteKit, and that is right
 * for a page with a catalog it collects, a design system route and motion
 * preferences. This is seven documents and a table; a static emitter has no
 * install step, no lockfile to age, and nothing between the markdown and the
 * HTML. One dependency, for markdown.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { marked } from "marked";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(HERE, "dist");

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

const esc = (s) =>
	String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------------------------------------------------------------------

const NAV = [
	["/", "Overview"],
	["/spec/", "Spec"],
	["/schemes/", "Schemes"],
	["/presets/", "Presets"],
	["/schema/", "Schema"],
	["/conformance/", "Conformance"],
	["/hosts/", "Hosts"],
];

const STYLE = `
/* Light is the base. Every colour is a token defined here, so a theme block
   below only ever redefines tokens -- never introduces one. */
:root {
  color-scheme: light;
  --bg: #faf8f5;
  --panel: #fffefc;
  --ink: #1c1917;
  --ink-soft: #57534e;
  --ink-faint: #8b857f;
  --rule: #e7e2db;
  --accent: #7c4a2d;
  --accent-soft: #f0e6dd;
  --code-bg: #f4f0ea;
  --ok: #2f6f4f;
  --warn: #8a6d1f;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #171614;
    --panel: #1f1e1b;
    --ink: #ece7e0;
    --ink-soft: #b3aca3;
    --ink-faint: #857e75;
    --rule: #322f2a;
    --accent: #d9a273;
    --accent-soft: #2b241d;
    --code-bg: #232120;
    --ok: #7fc0a0;
    --warn: #d9bb6a;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #171614;
  --panel: #1f1e1b;
  --ink: #ece7e0;
  --ink-soft: #b3aca3;
  --ink-faint: #857e75;
  --rule: #322f2a;
  --accent: #d9a273;
  --accent-soft: #2b241d;
  --code-bg: #232120;
  --ok: #7fc0a0;
  --warn: #d9bb6a;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-text-size-adjust: 100%;
}
.wrap { max-width: 47rem; margin: 0 auto; padding: 0 1.25rem 6rem; }

header.site { border-bottom: 1px solid var(--rule); margin-bottom: 2.5rem; }
header.site .wrap { padding-top: 1.5rem; padding-bottom: 0; }
.brand { display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
.brand a.name {
  font: 600 1.35rem/1 ui-serif, Georgia, "Times New Roman", serif;
  letter-spacing: .01em; color: var(--ink); text-decoration: none;
}
.brand .sub { color: var(--ink-faint); font-size: .9rem; }
nav { display: flex; gap: .25rem 1.1rem; flex-wrap: wrap; margin: 1.15rem 0 0; padding-bottom: .35rem; }
nav a {
  color: var(--ink-soft); text-decoration: none; font-size: .9rem;
  padding: .3rem 0 .55rem; border-bottom: 2px solid transparent;
}
nav a:hover { color: var(--ink); }
nav a[aria-current="page"] { color: var(--accent); border-bottom-color: var(--accent); }

h1 { font: 600 2rem/1.2 ui-serif, Georgia, serif; margin: 0 0 1rem; letter-spacing: -.01em; }
h2 { font: 600 1.3rem/1.3 ui-serif, Georgia, serif; margin: 2.5rem 0 .75rem; }
h3 { font: 600 1.05rem/1.35 ui-sans-serif, system-ui, sans-serif; margin: 1.75rem 0 .5rem; }
h2, h3 { scroll-margin-top: 1rem; }
p, li { color: var(--ink-soft); }
li { margin: .3rem 0; }
strong { color: var(--ink); font-weight: 620; }
a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 2.5rem 0; }

code {
  font: .875em/1.5 ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace;
  background: var(--code-bg); padding: .1em .35em; border-radius: 4px;
  color: var(--ink); overflow-wrap: anywhere;
}
pre {
  background: var(--code-bg); border: 1px solid var(--rule); border-radius: 8px;
  padding: .9rem 1rem; overflow-x: auto; margin: 1rem 0;
}
pre code { background: none; padding: 0; font-size: .82rem; line-height: 1.55; }

/* Wide content scrolls inside its own box; the page never scrolls sideways. */
.scroll { overflow-x: auto; margin: 1.15rem 0; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); }
table { border-collapse: collapse; width: 100%; font-size: .9rem; }
th, td { text-align: left; padding: .55rem .8rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { color: var(--ink); font-weight: 600; white-space: nowrap; background: var(--code-bg); }
tr:last-child td { border-bottom: 0; }
td code { white-space: nowrap; }

blockquote { margin: 1.2rem 0; padding: .1rem 0 .1rem 1rem; border-left: 3px solid var(--accent-soft); color: var(--ink-faint); }

.lede { font-size: 1.08rem; color: var(--ink-soft); }
.card { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px; padding: 1.1rem 1.25rem; margin: 1.25rem 0; }
.pill { display: inline-block; font-size: .72rem; letter-spacing: .04em; text-transform: uppercase;
        padding: .2rem .5rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.ok { color: var(--ok); } .warn { color: var(--warn); }
.mono-sm { font: .8rem/1.5 ui-monospace, Menlo, Consolas, monospace; color: var(--ink-faint); }
footer.site { border-top: 1px solid var(--rule); margin-top: 4rem; padding-top: 1.25rem; color: var(--ink-faint); font-size: .85rem; }
footer.site a { color: var(--ink-faint); }

@media (max-width: 34rem) {
  h1 { font-size: 1.6rem; }
  .wrap { padding: 0 1rem 4rem; }
}
`;

function page({ path, title, description, body }) {
	const nav = NAV.map(
		([href, label]) =>
			`<a href="${href}"${href === path ? ' aria-current="page"' : ""}>${label}</a>`,
	).join("");
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<link rel="canonical" href="https://lintel.aylith.com${path}">
<style>${STYLE}</style>
</head>
<body>
<header class="site"><div class="wrap">
  <div class="brand">
    <a class="name" href="/">Lintel</a>
    <span class="sub">One manifest, every terminal.</span>
  </div>
  <nav>${nav}</nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer class="site"><div class="wrap">
  Built from the repo at
  <a href="https://github.com/aylith-labs/lintel">aylith-labs/lintel</a> &mdash;
  every page on this site is rendered from those files, so it cannot disagree with them.
</div></footer>
</body>
</html>
`;
}

/** Markdown, minus the H1 the page supplies itself. */
function md(source) {
	const withoutTitle = source.replace(/^#\s+.*\n+/, "");
	const html = marked.parse(withoutTitle, { mangle: false, headerIds: true });
	// Every table scrolls in its own box rather than widening the page.
	return html.replace(/<table>/g, '<div class="scroll"><table>').replace(/<\/table>/g, "</table></div>");
}

function write(path, html) {
	const dir = join(OUT, path === "/" ? "." : path.replace(/^\/|\/$/g, ""));
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "index.html"), html);
}

// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });

// -- / ----------------------------------------------------------------------

const jira = readJson("integrations/jira.json");
const exampleMatcher = jira.matchers.find((m) => m.kind === "text");

write(
	"/",
	page({
		path: "/",
		title: "Lintel — one manifest, every terminal",
		description:
			"A standard for teaching a terminal what the text in it means. A JSON manifest says how to recognise a reference, how to look it up and how to show it.",
		body: `
<h1>A terminal shows you text.</h1>
<p class="lede">Almost all of it is a reference to something that lives somewhere else &mdash; an
issue key, a session id, a pull request, a pane address. The terminal knows none of it, so you copy
the string into a browser to find out what it is.</p>

<p><strong>Lintel closes that loop with a file.</strong> A manifest is JSON that says how to
recognise a reference, how to look it up, and how to show it. Hover the text, get a card. Click it,
land on the thing. No plugin code, no process, no extension host &mdash; a manifest is data, and the
terminal is the only thing that executes.</p>

<div class="card">
<p class="mono-sm" style="margin:0 0 .5rem">a build log prints</p>
<pre><code>FAILED  CAB-8209  attribute-tagging-service  (3 tests)</code></pre>
<p class="mono-sm" style="margin:.9rem 0 .5rem">and this is the whole of what makes it hoverable</p>
<pre><code>${esc(JSON.stringify(exampleMatcher, null, 2))}</code></pre>
</div>

<h2>Who implements it</h2>
<div class="scroll"><table>
<tr><th>Host</th><th>Built on</th></tr>
<tr><td><strong>Windows Terminal</strong> <span class="mono-sm">(aylith fork)</span></td><td>C++/WinRT, ICU regex, credentials in the Windows vault</td></tr>
<tr><td><strong>Torbie</strong></td><td>TypeScript/Angular, JS <code>RegExp</code>, credentials via Electron <code>safeStorage</code></td></tr>
<tr><td><strong>shefrd</strong></td><td>Rust &mdash; the multiplexer's own hover and click surface</td></tr>
</table></div>

<p>The compatibility test is not a promise, it is a command. <a href="/conformance/">The suite</a>
reads each host's manifests off disk and reports any key that differs from the canonical copy. A
divergence that is written down, with a reason about the host, is a decision. One that is not is
drift, and the suite fails on it.</p>

<h2>Why it has a name</h2>
<p>Because &ldquo;integration manifest&rdquo; is a description, and a description cannot be cited,
versioned or refused. A lintel is the beam over an opening: it is what lets you put a door in a wall
without the wall coming down, and it is the piece nobody looks at once it is in.</p>

<p style="margin-top:2rem"><a href="/spec/">Read the standard &rarr;</a></p>
`,
	}),
);

// -- /spec, /schemes ---------------------------------------------------------

write(
	"/spec/",
	page({
		path: "/spec/",
		title: "The Lintel standard, version 1",
		description: "The normative Lintel specification: manifests, matchers, fetch steps, templates, host guarding and conformance.",
		body: `<h1>The Lintel standard</h1>\n${md(read("SPEC.md"))}`,
	}),
);

write(
	"/schemes/",
	page({
		path: "/schemes/",
		title: "URI registry — Lintel",
		description: "The schemes a Lintel manifest can own: stith:// and shefrd://, their verbs, and what a host does with one.",
		body: `<h1>The URI registry</h1>\n${md(read("schemes.md"))}`,
	}),
);

// -- /presets ----------------------------------------------------------------

const { presets } = readJson("presets.json");
const manifests = new Map(
	readdirSync(join(ROOT, "integrations")).filter(file => file.endsWith(".json")).sort()
		.map(file => { const manifest = readJson(`integrations/${file}`); return [manifest.id, manifest]; }),
);

const claimingPattern = (preset) => {
	if (!preset.integration) return preset.pattern ?? null;
	const m = manifests.get(preset.integration);
	if (!m) return null;
	const found = (m.matchers ?? []).find((matcher) => {
		if (matcher.kind !== preset.match) return false;
		const re = new RegExp(matcher.pattern);
		if (matcher.kind !== "text") return re.test(preset.example);
		const hit = re.exec(preset.example);
		return hit !== null && hit.index === 0 && hit[0].length === preset.example.length;
	});
	return found?.pattern ?? null;
};

write(
	"/presets/",
	page({
		path: "/presets/",
		title: "Presets — Lintel",
		description: "The preset catalogue: ready-made rules, each joined to the manifest matcher that claims its example.",
		body: `
<h1>Presets</h1>
<p><a href="https://github.com/aylith-labs/lintel/issues/new?template=preset.yml">Suggest a preset</a> · <a href="https://github.com/aylith-labs/lintel/blob/main/CONTRIBUTING.md">Contribute one yourself</a></p>
<label for="preset-search">Search presets</label>
<input id="preset-search" type="search" placeholder="Search names, services, descriptions or examples" style="display:block;width:100%;box-sizing:border-box;padding:.8rem;margin:.5rem 0 1rem;background:var(--panel);color:var(--ink);border:1px solid var(--rule);border-radius:6px">
<p id="preset-empty" hidden>No presets match your search.</p>
<script>document.addEventListener('DOMContentLoaded',()=>{const input=document.getElementById('preset-search');input.addEventListener('input',()=>{const query=input.value.trim().toLowerCase();let count=0;document.querySelectorAll('[data-preset]').forEach(card=>{card.hidden=!card.textContent.toLowerCase().includes(query);if(!card.hidden)count++;});document.getElementById('preset-empty').hidden=count!==0;});});</script>
<p class="lede">Ready-made rules, so adding one does not start with writing a regex.</p>
<p>A preset is metadata plus a criterion, and the two come from different places on purpose. The
name and description are prose, and no manifest has anywhere to put them. The <strong>pattern</strong>
is <em>taken</em> from the manifest rather than copied beside it &mdash; a second copy of a regex is
a second copy that can drift.</p>
<p>The join is by <strong>example</strong>: a preset names a string its matcher must claim, and the
matcher is selected by running the manifest's own patterns against it. If nothing claims the example,
or more than one thing does, the preset is not offered rather than shipping a pattern nobody vouches
for. Each entry below shows the pattern that join actually resolved.</p>
${presets
	.map((p) => {
		const pattern = claimingPattern(p);
		const criterion = pattern
			? `<pre style="margin:.6rem 0 0"><code>${esc(pattern)}</code></pre>`
			: p.extensions?.length
                ? `<p class="mono-sm">matched by extension &mdash; ${esc(p.extensions.join(", "))}</p>`
            : p.fileTypeGroup
				// These two match by what a link RESOLVES TO rather than by what it
				// looks like, so there is no pattern to show and none missing.
				? `<p class="mono-sm" style="margin:.6rem 0 0">matched by file type &mdash; ${esc(p.fileTypeGroup)}</p>`
				: `<p class="warn" style="margin:.6rem 0 0">nothing claims this example</p>`;
		return `<div class="card" data-preset>
<p style="margin:0"><strong>${esc(p.label)}</strong>
  <span class="pill" style="margin-left:.4rem">${esc(p.match)}</span></p>
<p class="mono-sm" style="margin:.15rem 0 .6rem">${esc(p.id)}${p.integration ? " &middot; " + esc(p.integration) : " &middot; standalone"}</p>
<p style="margin:0 0 .1rem">${esc(p.description)}</p>
<p class="mono-sm" style="margin:.7rem 0 0">claims</p>
<pre style="margin:.25rem 0 0"><code>${esc(p.example)}</code></pre>
<p class="mono-sm" style="margin:.7rem 0 0">${pattern ? "with" : "by"}</p>
${criterion}
</div>`;
	})
	.join("\n")}
`,
	}),
);

// -- /schema -----------------------------------------------------------------

const schema = read("schema/lintel-1.json");
write(
	"/schema/",
	page({
		path: "/schema/",
		title: "JSON Schema — Lintel",
		description: "The published JSON Schema for a Lintel manifest, so an editor can validate one before a terminal ever sees it.",
		body: `
<h1>JSON Schema</h1>
<p class="lede">So an editor can complete and validate a manifest before a terminal ever sees it.</p>
<p>Point your editor at <code>https://lintel.aylith.com/schema/lintel-1.json</code>, or add
<code>"$schema"</code> to the manifest itself.</p>
<div class="card">
<p style="margin-top:0"><strong>Unknown keys are allowed, deliberately.</strong> The spec requires a
host to ignore keys it does not recognise, so a schema that rejected them would contradict the
versioning rule it exists to police. It catches the shapes that are wrong, not the ones that are
merely new.</p>
</div>
<pre><code>${esc(schema)}</code></pre>
`,
	}),
);
mkdirSync(join(OUT, "schema"), { recursive: true });
writeFileSync(join(OUT, "schema", "lintel-1.json"), schema);
writeFileSync(join(OUT, "schema", "presets-1.json"), read("schema/presets-1.json"));
writeFileSync(join(OUT, "schema", "file-types-1.json"), read("schema/file-types-1.json"));
writeFileSync(join(OUT, "file-types.json"), read("file-types.json"));
cpSync(join(ROOT, "icons"), join(OUT, "icons"), { recursive: true });

// -- /conformance and /hosts -------------------------------------------------

let suiteOut = "";
let suitePassed = true;
try {
	suiteOut = execFileSync(process.execPath, [join(ROOT, "conformance", "run.mjs")], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
} catch (e) {
	suitePassed = false;
	suiteOut = `${e.stdout ?? ""}${e.stderr ?? ""}`;
}

const allowances = readJson("conformance/allowances.json").hosts;

write(
	"/conformance/",
	page({
		path: "/conformance/",
		title: "Conformance — Lintel",
		description: "What conformant means, executably: manifests well formed, preset examples claimed, hosts shipping the canonical files.",
		body: `
<h1>Conformance</h1>
<p class="lede">&ldquo;One format, many terminals&rdquo; is a claim about files on disk, so it is
checked against files on disk.</p>
<pre><code>node conformance/run.mjs</code></pre>
<h2>What it asks</h2>
<ol>
<li><strong>Is every manifest well formed?</strong> Patterns compile; <code>hostSetting</code> names
a real setting and is not on a text matcher; <code>open</code> names an action or a built-in; a
field path is qualified when the manifest has more than one fetch step.</li>
<li><strong>Does every preset's example land on exactly one matcher?</strong> This is the one that
pays for itself. The bug that started this repo was a rule matching a bare session id that no
matcher could resolve: the card appeared, named the rule, and the click failed with
<em>&ldquo;this link is invalid&rdquo;</em>. A preset whose example nothing claims is that bug,
found before anyone hovers it.</li>
<li><strong>Does every host ship the canonical manifests?</strong> Compared as parsed values, so
formatting is free and content is not.</li>
</ol>
<h2>Last run</h2>
<p class="${suitePassed ? "ok" : "warn"}"><span class="pill">${suitePassed ? "passing" : "failing"}</span></p>
<pre><code>${esc(suiteOut.trim() || "(no output)")}</code></pre>
`,
	}),
);

write(
	"/hosts/",
	page({
		path: "/hosts/",
		title: "Hosts — Lintel",
		description: "Which host implements what, and where each one is allowed to differ, generated from the conformance run.",
		body: `
<h1>Hosts</h1>
<p class="lede">Generated from the conformance run, not asserted here &mdash; so a divergence
appears on this page the day it appears in the file.</p>
${Object.entries(allowances)
	.map(
		([host, entries]) => `
<h2>${esc(host)}</h2>
${entries
	.map(
		(e) => `<div class="card">
<p style="margin-top:0"><strong>${esc(e.manifest)}</strong> may differ at
${e.keys.map((k) => `<code>${esc(k)}</code>`).join(", ")}</p>
<p style="margin-bottom:0">${esc(e.reason)}</p>
</div>`,
	)
	.join("\n")}`,
	)
	.join("\n")}
<h2>Everything else</h2>
<p>Anything not listed above must match the canonical manifest exactly, as a parsed value.
&ldquo;Not synced yet&rdquo; is not an allowance; it is the finding.</p>
`,
	}),
);

// -- agent-facing files ------------------------------------------------------

writeFileSync(
	join(OUT, "llms.txt"),
	`# Lintel

One manifest, every terminal. A standard for teaching a terminal what the text in it means: a JSON
manifest says how to recognise a reference in terminal output, how to look it up, and how to show
it. The terminal executes; the manifest only describes.

- Specification: https://lintel.aylith.com/spec/
- JSON Schema:   https://lintel.aylith.com/schema/lintel-1.json
- URI registry:  https://lintel.aylith.com/schemes/
- Presets:       https://lintel.aylith.com/presets/
- Conformance:   https://lintel.aylith.com/conformance/
- Source:        https://github.com/aylith-labs/lintel

Implemented by the aylith Windows Terminal fork, Torbie, and shefrd.
An implementation is conformant if \`node conformance/run.mjs\` passes against its manifest directory.
`,
);

if (existsSync(join(HERE, "static"))) {
	cpSync(join(HERE, "static"), OUT, { recursive: true });
}

console.log(`built ${NAV.length} pages into site/dist${suitePassed ? "" : "  (conformance FAILING)"}`);
