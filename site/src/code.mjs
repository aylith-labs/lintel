/**
 * Code blocks: highlighted at build time, folded to their most important lines.
 *
 * Highlighting happens here and never in the browser. Shiki emits every token
 * with BOTH theme colours as CSS variables (--shiki-light / --shiki-dark), so
 * the page switches with the OS theme without re-highlighting and without
 * shipping a highlighter.
 *
 * Folding is the other half. A 150-line schema dumped in full is a wall; the
 * reader wants its shape first and a detail on request. So a long JSON block
 * opens with the structure that fits a line budget -- shallow containers
 * expanded before deep ones, small before large -- and everything else folded
 * behind a row that says what is inside it ("kind, pattern, hostSetting +3 ·
 * 14 lines"). Nothing is dropped: every line is in the page, hidden or not, so
 * copy, search and find-in-page all see the whole source.
 */

import { createHighlighter } from "shiki";
import { transformerStyleToClass } from "@shikijs/transformers";

const THEMES = { light: "vitesse-light", dark: "vitesse-dark" };

// Every token carries two colours; inline, that is ~60 bytes a token and put
// the 439-line schema page at 230 KB. As classes, each distinct colour pair is
// written once, in the stylesheet.
const toClass = transformerStyleToClass({ classPrefix: "t" });

/** The CSS for every token class emitted so far -- call after the last block. */
export const highlightCss = () => toClass.getCSS();

const ALIASES = {
	"": "text", txt: "text", plaintext: "text", plain: "text", log: "text",
	sh: "bash", shell: "bash", console: "bash", zsh: "bash",
	regex: "regexp", re: "regexp",
	js: "javascript", mjs: "javascript", ts: "typescript",
	yml: "yaml", md: "markdown", rs: "rust",
};

const LABELS = {
	json: "JSON", jsonc: "JSONC", bash: "Shell", regexp: "Regex", toml: "TOML",
	yaml: "YAML", javascript: "JavaScript", typescript: "TypeScript", rust: "Rust",
	markdown: "Markdown", text: "",
};

// A block this short is shown whole: folding four lines saves nothing and
// costs a click.
const FOLD_THRESHOLD = 24;
// How many lines a folded block opens with.
const LINE_BUDGET = 40;
// A JSON container folds onto ONE line -- `"id": {⋯ type, minLength},` -- so
// even a small one is worth folding: closed, it costs no more than a scalar.
const MIN_BODY = 2;
// Non-JSON blocks have no structure to fold by, so a long one keeps its head
// and tail and folds the middle.
const GENERIC_HEAD = 12;
const GENERIC_TAIL = 6;

let highlighter;

export async function initHighlighter() {
	highlighter = await createHighlighter({
		themes: Object.values(THEMES),
		langs: ["json", "jsonc", "bash", "regexp", "toml", "yaml", "javascript", "typescript", "rust", "markdown"],
	});
}

const esc = (s) =>
	String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function normalizeLang(lang) {
	const key = String(lang ?? "").trim().toLowerCase().split(/\s+/)[0];
	const name = ALIASES[key] ?? key;
	return name in LABELS ? name : "text";
}

/** One HTML string per source line, each a `<span class="line">`. */
function highlightLines(source, lang) {
	const lines = source.split("\n");
	if (lang !== "text") {
		try {
			const html = highlighter.codeToHtml(source, { lang, themes: THEMES, defaultColor: false, transformers: [toClass] });
			const inner = html.slice(html.indexOf("<code>") + 6, html.lastIndexOf("</code>"));
			const out = inner.split("\n");
			if (out.length === lines.length) return out;
		} catch {
			// fall through to plain -- an unhighlighted block beats a failed build
		}
	}
	return lines.map((line) => `<span class="line">${esc(line)}</span>`);
}

// ---- where a JSON block can fold ------------------------------------------

/**
 * Every container that spans more than one line, as { open, close, type }.
 * A scanner rather than JSON.parse, because JSONC has comments and a fold
 * needs line numbers, which a parsed value no longer has.
 */
function jsonContainers(lines) {
	const ranges = [];
	const stack = [];
	let inString = false;
	let inBlockComment = false;
	for (let ln = 0; ln < lines.length; ln++) {
		const line = lines[ln];
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (inBlockComment) {
				if (c === "*" && line[i + 1] === "/") { inBlockComment = false; i++; }
				continue;
			}
			if (inString) {
				if (c === "\\") i++;
				else if (c === '"') inString = false;
				continue;
			}
			if (c === '"') inString = true;
			else if (c === "/" && line[i + 1] === "/") break;
			else if (c === "/" && line[i + 1] === "*") { inBlockComment = true; i++; }
			else if (c === "{" || c === "[") stack.push({ open: ln, type: c });
			else if (c === "}" || c === "]") {
				const top = stack.pop();
				if (top && ln > top.open + 1) ranges.push({ open: top.open, close: ln, type: top.type, depth: stack.length });
			}
		}
	}
	// Two containers opening on one line ("[{") cannot both fold from it; keep
	// the outer one.
	const byOpen = new Map();
	for (const r of ranges) {
		const seen = byOpen.get(r.open);
		if (!seen || r.close > seen.close) byOpen.set(r.open, r);
	}
	return [...byOpen.values()];
}

/** Nest ranges into a tree; returns the top-level ones. */
function nest(ranges) {
	const sorted = [...ranges].sort((a, b) => a.open - b.open || b.close - a.close);
	const roots = [];
	const stack = [];
	for (const r of sorted) {
		r.children = [];
		while (stack.length && !(stack.at(-1).open < r.open && r.close <= stack.at(-1).close)) stack.pop();
		if (stack.length) { r.parent = stack.at(-1); stack.at(-1).children.push(r); }
		else roots.push(r);
		stack.push(r);
	}
	return roots;
}

const bodyLen = (f) => f.close - f.open - 1;

/** What a closed fold says about itself: its keys, or how many items. */
function describe(f, lines) {
	// Direct members only: the lines at the body's own indentation. A nested
	// object that is too small to fold still has keys, and they are not this
	// container's keys -- counting them is how "type" appeared five times.
	const indentOf = (l) => /^\s*/.exec(l)[0].length;
	const own = indentOf(lines[f.open + 1] ?? "");
	const direct = [];
	for (let i = f.open + 1; i < f.close; i++) if (indentOf(lines[i]) === own && lines[i].trim()) direct.push(lines[i]);

	const n = bodyLen(f);
	const count = `${n} line${n === 1 ? "" : "s"}`;
	if (f.type === "lines") return { summary: "", count: `${n} more line${n === 1 ? "" : "s"}` };
	if (f.type === "[") {
		const items = direct.filter((l) => !/^\s*[\]}],?\s*$/.test(l) && l.trim() !== "").length;
		return { summary: `${items} item${items === 1 ? "" : "s"}`, count };
	}
	const keys = direct.map((l) => /^\s*"((?:[^"\\]|\\.)*)"\s*:/.exec(l)?.[1]).filter(Boolean);
	let summary = "";
	let shown = 0;
	for (const k of keys) {
		if (summary.length + k.length > 44) break;
		summary += (shown ? ", " : "") + k;
		shown++;
	}
	if (keys.length > shown) summary += ` +${keys.length - shown}`;
	return { summary, count };
}

/**
 * Which folds start open. All start closed; then, shallowest first and
 * cheapest first, open whatever still fits the line budget. The top of the
 * structure is what a reader needs to orient, so it wins over detail.
 */
function chooseOpen(roots, totalLines) {
	const all = [];
	const walk = (fs) => fs.forEach((f) => { all.push(f); walk(f.children); });
	walk(roots);
	for (const f of all) f.open_ = false;

	// A closed container is one line (open, summary and close together); an
	// open one is its own two bracket lines plus its body, with each closed
	// child in that body also down to one line.
	const saved = (c) => bodyLen(c) + 1;
	const openLines = (f) => bodyLen(f) + 2 - f.children.reduce((s, c) => s + saved(c), 0);
	let visible = totalLines - roots.reduce((s, f) => s + saved(f), 0);

	for (;;) {
		const candidates = all.filter((f) => !f.open_ && (!f.parent || f.parent.open_));
		let best = null;
		for (const f of candidates) {
			const cost = openLines(f) - 1;
			if (visible + cost > LINE_BUDGET) continue;
			if (!best || f.depth < best.f.depth || (f.depth === best.f.depth && cost < best.cost)) best = { f, cost };
		}
		if (!best) break;
		best.f.open_ = true;
		visible += best.cost;
	}
}

function foldsFor(lines, lang) {
	if (lines.length <= FOLD_THRESHOLD) return [];
	if (lang === "json" || lang === "jsonc") {
		// A short list reads faster than its summary ("2 items") would, so an
		// array has to be longer than an object before it earns a fold.
		const containers = jsonContainers(lines).filter(
			(r) => r.depth >= 1 && bodyLen(r) >= (r.type === "[" ? MIN_BODY + 2 : MIN_BODY),
		);
		const roots = nest(containers);
		chooseOpen(roots, lines.length);
		return roots;
	}
	const open = GENERIC_HEAD - 1;
	const close = lines.length - GENERIC_TAIL;
	if (close - open - 1 < MIN_BODY) return [];
	return [{ open, close, type: "lines", depth: 0, children: [], open_: false }];
}

// ---- rendering --------------------------------------------------------------

const chevron = (open) =>
	`<button type="button" class="fold-chev" aria-label="Toggle this block" aria-expanded="${open}" data-fold-chev></button>`;

/**
 * Move a line's first `n` spaces into a span of their own, so a closing
 * bracket drawn inline beside its summary -- `{⋯ id, name}` -- can drop the
 * indentation it needs when it stands on a line by itself.
 */
function splitLead(lineHtml, n) {
	const head = '<span class="line">';
	if (!lineHtml.startsWith(head) || n <= 0) return lineHtml;
	let rest = "";
	let lead = "";
	let i = head.length;
	while (i < lineHtml.length) {
		if (lineHtml[i] === "<") {
			const j = lineHtml.indexOf(">", i);
			rest += lineHtml.slice(i, j + 1);
			i = j + 1;
		} else if (lineHtml[i] === " " && lead.length < n) {
			lead += " ";
			i++;
		} else break;
	}
	return `${head}<span class="lead">${lead}</span>${rest}${lineHtml.slice(i)}`;
}

function renderRange(start, end, folds, source, html) {
	const opening = new Map(folds.map((f) => [f.open, f]));
	let out = "";
	let i = start;
	while (i <= end) {
		const f = opening.get(i);
		if (!f) { out += html[i]; i++; continue; }

		const inline = f.type !== "lines";
		if (inline) html[f.close] = splitLead(html[f.close], /^\s*/.exec(source[f.close])[0].length);
		out += html[i].replace('<span class="line">', `<span class="line has-fold${inline ? " inl" : ""}${f.open_ ? "" : " closed"}">${chevron(f.open_)}`);
		const { summary, count } = describe(f, source);
		const indent = /^\s*/.exec(source[f.open + 1] ?? "")[0].length;
		const label = `${summary ? `<span class="fold-keys">${esc(summary)}</span>` : ""}<span class="fold-count">${esc(count)}</span>`;
		out +=
			`<span class="fold" data-open="${f.open_}">` +
			`<span class="fold-row"${f.open_ ? " hidden" : ""} style="--indent:${inline ? 0 : indent}">` +
			`<button type="button" class="fold-btn" data-fold-open aria-label="Show ${esc(count)}">` +
			`<span class="fold-dots" aria-hidden="true">&#8943;</span>${label}</button></span>` +
			`<span class="fold-body"${f.open_ ? "" : " hidden"}>${renderRange(f.open + 1, f.close - 1, f.children, source, html)}</span>` +
			`</span>`;
		i = f.close;
	}
	return out;
}

/**
 * A code block, as a <figure>.
 *
 *   title    shown in the header instead of the language
 *   href     a "Raw" link, for a block that is a published file
 *   compact  one-liners: no header, a floating copy button
 */
export function codeBlock(source, lang, { title = "", href = "", compact = false } = {}) {
	const name = normalizeLang(lang);
	const src = String(source).replace(/\s+$/, "");
	const lines = src.split("\n");
	const html = highlightLines(src, name);
	const folds = compact ? [] : foldsFor(lines, name);
	const anyClosed = (fs) => fs.some((f) => !f.open_ || anyClosed(f.children));
	const body = renderRange(0, lines.length - 1, folds, lines, html);
	const heading = title || LABELS[name];

	const copy = `<button type="button" class="code-btn" data-code-copy>Copy</button>`;
	const toggle = folds.length
		? `<button type="button" class="code-btn" data-code-toggle>${anyClosed(folds) ? "Expand all" : "Collapse all"}</button>`
		: "";
	const raw = href ? `<a class="code-btn" href="${esc(href)}" data-no-route>Raw</a>` : "";

	return compact
		? `<figure class="code compact" data-lang="${name}" data-src="${esc(src)}"><pre tabindex="0"><code>${body}</code></pre>${copy.replace('class="code-btn"', 'class="code-btn copy-float"')}</figure>`
		: `<figure class="code" data-lang="${name}" data-src="${esc(src)}">` +
				`<figcaption><span class="code-title">${esc(heading)}</span><span class="code-actions">${toggle}${raw}${copy}</span></figcaption>` +
				`<pre tabindex="0"><code>${body}</code></pre></figure>`;
}
