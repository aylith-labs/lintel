#!/usr/bin/env node
/**
 * The Lintel conformance suite.
 *
 * Three questions, in the order they stop being cheap to answer:
 *
 *   1. Is every manifest well formed?
 *   2. Does every preset's example land on exactly one matcher?
 *   3. Does every host ship the manifests this repo says are canonical?
 *
 * (2) is the one that pays for itself. The bug that started this repo was a
 * hand-written rule matching a bare session id that NO matcher in stith.json
 * could resolve: the card appeared, named the rule, and the click failed. A
 * preset whose example nothing claims is that bug, before anyone hovers it.
 *
 * (3) is the compatibility test. "One format, many terminals" is a claim about
 * files on disk, so it is checked against files on disk.
 *
 * Patterns are compiled with JS RegExp here. The C++ host uses ICU. Named
 * groups, lookahead and the character classes these manifests use mean the same
 * thing in both; anything that does not belong in a manifest anyway.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const notes = [];
const fail = (m) => failures.push(m);

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// ---- 1. manifests are well formed -----------------------------------------

const MATCH_KINDS = new Set(["link", "text"]);
const FIELD_KINDS = new Set([
	"text", "title", "subtitle", "badge", "link", "image", "multiline",
]);

const manifestDir = join(ROOT, "integrations");
const manifests = new Map();

for (const file of readdirSync(manifestDir).filter((f) => f.endsWith(".json")).sort()) {
	const path = join(manifestDir, file);
	let m;
	try {
		m = readJson(path);
	} catch (e) {
		fail(`${file}: not valid JSON -- ${e.message}`);
		continue;
	}
	if (!m.id) fail(`${file}: no id, which makes the whole manifest invalid`);
	if (m.id && `${m.id}.json` !== file) fail(`${file}: id "${m.id}" does not match the file name`);
	manifests.set(m.id, m);

	const actionKeys = new Set((m.actions ?? []).map((a) => a.key));
	const settingKeys = new Set((m.settings ?? []).map((s) => s.key));
	const stepIds = new Set((m.fetch ?? []).map((s) => s.id));

	for (const [i, matcher] of (m.matchers ?? []).entries()) {
		const at = `${file} matchers[${i}]`;
		if (!MATCH_KINDS.has(matcher.kind)) fail(`${at}: kind must be link or text, got ${matcher.kind}`);
		try {
			new RegExp(matcher.pattern);
		} catch (e) {
			fail(`${at}: pattern does not compile -- ${e.message}`);
		}
		if (matcher.hostSetting && !settingKeys.has(matcher.hostSetting)) {
			fail(`${at}: hostSetting "${matcher.hostSetting}" names no setting`);
		}
		if (matcher.hostSetting && matcher.kind === "text") {
			fail(`${at}: hostSetting guards link matchers only -- a text match has no host to check`);
		}
		// An `open` that names nothing is the failure mode this key exists to
		// avoid: a click that silently does nothing, which is exactly what the
		// unregistered stith:// verbs did.
		const BUILT_IN = new Set(["open", "copyLink", "copyPath", "reveal", "showInPane"]);
		if (matcher.open && !actionKeys.has(matcher.open) && !BUILT_IN.has(matcher.open)) {
			fail(`${at}: open "${matcher.open}" names neither an action nor a built-in button`);
		}
	}

	for (const [i, field] of (m.fields ?? []).entries()) {
		const at = `${file} fields[${i}] (${field.key ?? field.label})`;
		if (field.kind && !FIELD_KINDS.has(field.kind)) fail(`${at}: unknown kind ${field.kind}`);
		// With more than one step an unqualified pointer resolves against
		// whichever step ran LAST and produced something, which is rarely the
		// one meant. Qualify or be wrong later.
		if (stepIds.size > 1 && field.path && !field.path.includes(":")) {
			fail(`${at}: path "${field.path}" is unqualified but the manifest has ${stepIds.size} fetch steps`);
		}
		const qualifier = field.path?.includes(":") ? field.path.split(":")[0] : null;
		if (qualifier && !stepIds.has(qualifier)) fail(`${at}: path names step "${qualifier}", which does not exist`);
	}
}

// ---- 2. every preset's example lands on exactly one matcher ----------------

const { presets } = readJson(join(ROOT, "presets.json"));

for (const preset of presets) {
	if (!preset.integration) {
		if (!preset.pattern && !preset.fileTypeGroup) {
			fail(`preset ${preset.id}: no integration, no pattern and no file-type group -- it matches nothing`);
		}
		if (preset.pattern && preset.example && !new RegExp(preset.pattern).test(preset.example)) {
			fail(`preset ${preset.id}: its own pattern does not match its example`);
		}
		continue;
	}

	const m = manifests.get(preset.integration);
	if (!m) {
		fail(`preset ${preset.id}: names integration "${preset.integration}", which does not exist`);
		continue;
	}

	// Match the host's own semantics, or this passes manifests the terminal will
	// refuse. A TEXT matcher is applied to the matched run and must claim all of
	// it (uregex_matches); a LINK matcher is searched within the URI
	// (uregex_find). Testing both with `test()` would accept an anchored text
	// pattern against a sentence it could never actually claim.
	const claims = (matcher) => {
		const re = new RegExp(matcher.pattern);
		if (matcher.kind !== "text") return re.test(preset.example);
		const m = re.exec(preset.example);
		return m !== null && m.index === 0 && m[0].length === preset.example.length;
	};
	const claiming = (m.matchers ?? []).filter(
		(matcher) => matcher.kind === preset.match && claims(matcher),
	);

	if (claiming.length === 0) {
		fail(
			`preset ${preset.id}: no ${preset.match} matcher in ${preset.integration}.json claims ` +
				`"${preset.example}" -- the rule would match and the click would resolve to nothing`,
		);
	} else if (claiming.length > 1) {
		fail(
			`preset ${preset.id}: ${claiming.length} matchers in ${preset.integration}.json claim ` +
				`"${preset.example}", so which pattern the preset means is ambiguous`,
		);
	}
}

// ---- 3. the hosts ship what this repo says is canonical --------------------

// A divergence that is written down is a decision; one merely tolerated is
// drift. Anything not in allowances.json fails.
const allowances = readJson(join(ROOT, "conformance", "allowances.json")).hosts;

const HOSTS = [
	{
		name: "Windows Terminal",
		dir: "/mnt/c/Users/steve/projects/terminal/src/cascadia/TerminalSettingsModel/integrations",
	},
	{
		name: "Torbie",
		dir: "/mnt/c/Users/steve/projects/tabby/tabby-links/src/integrations",
	},
];

for (const host of HOSTS) {
	if (!existsSync(host.dir)) {
		notes.push(`${host.name}: not checked out here, skipped`);
		continue;
	}
	for (const [id] of manifests) {
		const there = join(host.dir, `${id}.json`);
		if (!existsSync(there)) {
			fail(`${host.name}: does not ship ${id}.json`);
			continue;
		}
		// Say WHICH keys differ. "these files differ" sends someone to a diff;
		// naming the key is usually the whole answer -- the html key on Torbie's
		// stith.json was the first real divergence and took one line to see.
		const a = readJson(join(manifestDir, `${id}.json`));
		const b = readJson(there);
		const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
			(k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
		);
		if (!keys.length) continue;

		const allowed = (allowances[host.name] ?? []).find((entry) => entry.manifest === `${id}.json`);
		const unexplained = keys.filter((k) => !(allowed?.keys ?? []).includes(k));
		if (unexplained.length) {
			fail(`${host.name}: ${id}.json differs at ${unexplained.join(", ")}`);
		} else {
			notes.push(`${host.name}: ${id}.json differs at ${keys.join(", ")} -- allowed: ${allowed.reason.split(".")[0]}.`);
		}
	}
}

// ---- report ----------------------------------------------------------------

for (const note of notes) console.log(`  note  ${note}`);
if (failures.length === 0) {
	console.log(`\nConformant: ${manifests.size} manifests, ${presets.length} presets.`);
	process.exit(0);
}
console.error(`\n${failures.length} failure${failures.length === 1 ? "" : "s"}:\n`);
for (const f of failures) console.error(`  - ${f}`);
process.exit(1);
