/**
 * The search index, built from the rendered pages.
 *
 * A record per SECTION, not per page: a hit on "hostSetting" should land on
 * §9 Host guarding, not on the top of a 180-line spec. A section starts at an
 * h2/h3 with an id, or at any element carrying data-section (the preset cards,
 * which have no heading of their own but are exactly what someone searches for).
 *
 * The options travel inside the JSON, so the page and the build cannot disagree
 * about which fields exist.
 */

import MiniSearch from "minisearch";

const FIELDS = ["heading", "pageTitle", "text", "alt"];
const STORE = ["path", "anchor", "pageTitle", "heading", "text"];

const ENTITIES = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
	ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", middot: "·", rarr: "→", larr: "←",
	hellip: "…", sect: "§", times: "×",
};

export const decode = (s) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
		if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1));
		return ENTITIES[e.toLowerCase()] ?? m;
	});

export const plain = (html) =>
	decode(
		html
			// a code line is a block with no newline between it and the next
			.replace(/<span class="line/g, " $&")
			.replace(/<[^>]+>/g, ""),
	)
		.replace(/\s+/g, " ")
		.trim();

/** Things that are on the page but are not its content. */
const chrome = (html) =>
	html
		.replace(/<(script|style|figcaption|label|button)\b[\s\S]*?<\/\1>/g, "")
		.replace(/<a class="anchor"[\s\S]*?<\/a>/g, "");

/**
 * Words a reader would type that the default tokenizer would never produce:
 * the halves of a camelCase key ("setting" in hostSetting) and a key without
 * its sigil ("defs" in $defs).
 */
function alt(text) {
	const out = new Set();
	for (const tok of text.split(/[^\p{L}\p{N}$@_]+/u)) {
		if (!tok) continue;
		const bare = tok.replace(/^[$@_]+/, "");
		if (bare !== tok && bare) out.add(bare);
		const parts = bare.split(/(?<=\p{Ll})(?=\p{Lu})|_/u);
		if (parts.length > 1) parts.forEach((p) => p && out.add(p));
	}
	return [...out].join(" ");
}

const BOUNDARY =
	/<(h[23])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>|<[a-z]+\b[^>]*\bid="([^"]+)"[^>]*\bdata-section="([^"]*)"[^>]*>/g;

export function sections(page) {
	const html = chrome(page.body);
	const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html);
	const out = [];
	let current = { anchor: "", heading: h1 ? plain(h1[1]) : page.title, start: 0 };

	const push = (end) => {
		const text = plain(html.slice(current.start, end).replace(/<h1\b[\s\S]*?<\/h1>/, ""));
		if (text || current.anchor) out.push({ ...current, text });
	};

	for (const m of html.matchAll(BOUNDARY)) {
		push(m.index);
		current = m[1]
			? { anchor: m[2], heading: plain(m[3]), start: m.index + m[0].length }
			: { anchor: m[4], heading: decode(m[5]), start: m.index + m[0].length };
	}
	push(html.length);
	return out;
}

export function buildSearchIndex(pages) {
	const docs = [];
	for (const page of pages) {
		const pageTitle = page.navLabel ?? page.title;
		for (const s of sections(page)) {
			docs.push({
				id: `${page.path}#${s.anchor}`,
				path: page.path,
				anchor: s.anchor,
				pageTitle,
				heading: s.heading,
				text: s.text,
				alt: alt(`${s.heading} ${s.text}`),
			});
		}
	}
	const ms = new MiniSearch({ fields: FIELDS, storeFields: STORE });
	ms.addAll(docs);
	return { json: JSON.stringify({ options: { fields: FIELDS, storeFields: STORE }, index: ms.toJSON() }), count: docs.length };
}
