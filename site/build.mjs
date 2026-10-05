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
 * HTML. Three dependencies, and only one of them reaches the browser: marked
 * and shiki run here, at build time; minisearch is the search index's reader.
 *
 * The page is static HTML and works without script. src/client.js makes it
 * feel like an app -- every page prefetched and swapped from memory, search,
 * folding code -- but every link is still a link.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { marked } from "marked";
import { initHighlighter, codeBlock, highlightCss } from "./src/code.mjs";
import { buildSearchIndex, plain } from "./src/search-index.mjs";

import { publicBase, publicHtml } from "./src/public-paths.mjs";
const BASE = publicBase(process.env.LINTEL_BASE_PATH);

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

const STYLE = readFileSync(join(HERE, "src", "style.css"), "utf8");
const CLIENT = readFileSync(join(HERE, "src", "client.js"), "utf8");

// Every page, as rendered, for the search index.
const PAGES = [];

const ICON_SEARCH =
	'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>';

/**
 * A heading needs an id to be linked to, landed on by a search hit, and cited
 * from elsewhere in the spec. marked stopped generating them in v5 -- which
 * silently broke every "see §10" link on the spec page -- so they are added
 * here, for markdown and hand-written pages alike, GitHub-style so the
 * anchors match the ones the repo's own README links use.
 */
function withHeadingIds(html) {
	const seen = new Map();
	return html.replace(/<(h[23])(\s[^>]*)?>([\s\S]*?)<\/\1>/g, (whole, tag, attrs = "", inner) => {
		const existing = /\bid="([^"]+)"/.exec(attrs)?.[1];
		let id = existing;
		if (!id) {
			const base = plain(inner).toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "-") || "section";
			const n = seen.get(base) ?? 0;
			seen.set(base, n + 1);
			id = n ? `${base}-${n}` : base;
		}
		const anchor = `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a>`;
		return `<${tag}${existing ? attrs : `${attrs} id="${id}"`}>${anchor}${inner}</${tag}>`;
	});
}

function page({ path, title, description, body }) {
	body = withHeadingIds(body);
	PAGES.push({ path, title, body, navLabel: NAV.find(([href]) => href === path)?.[1] });
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
<style>${STYLE}/*@TOKENS@*/</style>
<script src="@CLIENT@" defer></script>
</head>
<body>
<header class="site"><div class="wrap">
  <div class="brand">
    <a class="name" href="/">Lintel</a>
    <span class="sub">One manifest, every terminal.</span>
    <button type="button" class="search-trigger" data-search-open aria-label="Search the site" aria-keyshortcuts="Control+K Meta+K /">
      ${ICON_SEARCH}<span class="label">Search</span><kbd data-kbd-mod>Ctrl K</kbd>
    </button>
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
<dialog id="search" class="search" aria-label="Search the site">
  <div class="search-box">
    ${ICON_SEARCH}
    <input id="search-input" type="search" placeholder="Search the spec, schemes, presets, schema…" autocomplete="off"
      autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"
      role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list">
    <kbd>esc</kbd>
  </div>
  <div id="search-results" class="search-results" role="listbox" aria-label="Results"></div>
  <div class="search-foot">
    <span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span><span><kbd>esc</kbd> to close</span>
    <span class="spacer">Matches stay highlighted on the page</span>
  </div>
</dialog>
<div id="findbar" class="findbar" role="toolbar" aria-label="Search matches on this page" hidden>
  <span class="q"></span><span class="count" aria-live="polite"></span>
  <button type="button" data-find="prev" aria-label="Previous match" title="Previous (Shift+Enter)">↑</button>
  <button type="button" data-find="next" aria-label="Next match" title="Next (Enter)">↓</button>
  <button type="button" data-find="close" aria-label="Clear highlights" title="Clear (Esc)">✕</button>
</div>
</body>
</html>
`;
}

marked.use({
	renderer: {
		code({ text, lang }) {
			return codeBlock(text, lang);
		},
	},
});

/** Markdown, minus the H1 the page supplies itself. */
function md(source) {
	const withoutTitle = source.replace(/^#\s+.*\n+/, "");
	const html = marked.parse(withoutTitle);
	// Every table scrolls in its own box rather than widening the page.
	return html.replace(/<table>/g, '<div class="scroll"><table>').replace(/<\/table>/g, "</table></div>");
}

// Pages are held until the end: the stylesheet they inline includes a class for
// every token colour, and that set is only known once the last code block has
// been highlighted.
const PENDING = [];
function write(path, html) {
	PENDING.push({ path, html });
}
function flushPages(tokenCss, clientSrc) {
	for (const { path, html } of PENDING) {
		const dir = join(OUT, path === "/" ? "." : path.replace(/^\/|\/$/g, ""));
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "index.html"),
			publicHtml(html.replace("/*@TOKENS@*/", () => tokenCss).replace("@CLIENT@", () => clientSrc), BASE),
		);
	}
}

// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
await initHighlighter();

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
<p class="kicker">a build log prints</p>
${codeBlock("FAILED  CAB-8209  attribute-tagging-service  (3 tests)", "text", { compact: true })}
<p class="kicker" style="margin-top:1.1rem">and this is the whole of what makes it hoverable</p>
${codeBlock(JSON.stringify(exampleMatcher, null, 2), "json", { title: "integrations/jira.json · matchers[]" })}
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
			? codeBlock(pattern, "regexp", { compact: true })
			: p.extensions?.length
				? `<p class="mono-sm">extension &mdash; ${esc(p.extensions.join(", "))}</p>`
				: p.fileTypeGroup
					// These match by what a link RESOLVES TO rather than by what it
					// looks like, so there is no pattern to show and none missing.
					? `<p class="mono-sm">file type &mdash; ${esc(p.fileTypeGroup)}</p>`
					: `<p class="warn">nothing claims this example</p>`;
		// What the filter above searches: the card's words, not its button labels.
		const searchable = [p.label, p.match, p.id, p.integration, p.description, p.example, pattern, ...(p.extensions ?? []), p.fileTypeGroup]
			.filter(Boolean).join(" ");
		return `<div class="card" id="preset-${esc(p.id)}" data-section="${esc(p.label)}" data-preset="${esc(searchable)}">
<p style="margin:0"><strong>${esc(p.label)}</strong>
  <span class="pill" style="margin-left:.4rem">${esc(p.match)}</span></p>
<p class="mono-sm" style="margin:.15rem 0 .6rem">${esc(p.id)}${p.integration ? " &middot; " + esc(p.integration) : " &middot; standalone"}</p>
<p style="margin:0 0 .1rem">${esc(p.description)}</p>
<dl class="kv">
<dt>claims</dt><dd>${codeBlock(p.example, "text", { compact: true })}</dd>
<dt>${pattern ? "with" : "by"}</dt><dd>${criterion}</dd>
</dl>
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
${codeBlock(schema, "json", { title: "schema/lintel-1.json", href: "/schema/lintel-1.json" })}
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
${codeBlock("node conformance/run.mjs", "bash", { compact: true })}
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
${codeBlock(suiteOut.trim() || "(no output)", "text", { title: "conformance/run.mjs — output" })}
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
		(e) => `<div class="card" id="${esc(`${host}-${e.manifest}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}" data-section="${esc(`${host} · ${e.manifest}`)}">
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

// -- search ------------------------------------------------------------------
// Built from the pages exactly as rendered, so a hit can only ever point at text
// that is really on the page it names.

mkdirSync(join(OUT, "assets"), { recursive: true });
const search = buildSearchIndex(PAGES.map(page => ({ ...page, path: BASE + page.path })));
writeFileSync(join(OUT, "assets", "search.json"), search.json);
// minisearch's `exports` map hides its UMD build from require.resolve, so walk
// to the package directory from the entry it does export.
const require = createRequire(import.meta.url);
const minisearchDir = require.resolve("minisearch").replace(/[\\/]dist[\\/].*$/, "");
cpSync(join(minisearchDir, "dist", "umd", "index.js"), join(OUT, "assets", "minisearch.js"));
console.log(`search index: ${search.count} sections, ${(search.json.length / 1024).toFixed(0)} KB`);

// The client is one file for every page, named by its content: cached forever,
// and a new build is a new name rather than a stale copy.
const clientHash = createHash("sha256").update(CLIENT).digest("hex").slice(0, 10);
const clientPath = `/assets/site.${clientHash}.js`;
writeFileSync(join(OUT, clientPath), CLIENT);
const overview = PENDING.find(page => page.path === "/");
if (!overview) throw new Error("Full overview homepage missing");
write("/home/", overview.html);
flushPages(highlightCss(), clientPath);

console.log(`built ${NAV.length} pages into site/dist${suitePassed ? "" : "  (conformance FAILING)"}`);
