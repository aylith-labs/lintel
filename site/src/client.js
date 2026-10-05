const PUBLIC_BASE = document.documentElement.dataset.base ?? "";
/*
 * lintel.aylith.com, client side. One script, inlined into every page.
 *
 *   1. Navigation. Every page is prefetched as soon as the browser is idle, and
 *      a click swaps <main> from memory -- no request, no reload, no blank
 *      frame. The site is ~100 KB in total, so holding all of it costs nothing,
 *      and GitHub Pages' 170-440 ms per request was the whole of the lag.
 *   2. Code blocks: copy, fold, expand/collapse all.
 *   3. Search: a palette over a section-level index, with the matched words
 *      marked in the results and again on the page you land on.
 *
 * Everything is delegated from `document`, so it keeps working after <main>
 * has been swapped out from under it.
 */
(() => {
	"use strict";

	const $ = (s, root = document) => root.querySelector(s);
	const $$ = (s, root = document) => [...root.querySelectorAll(s)];
	const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
	const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
	const storage = {
		get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
		set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
	};
	const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

	// ==== 1. navigation =======================================================

	const cache = new Map(); // pathname -> Promise<html>
	let currentPath = location.pathname;
	let navToken = 0;
	if ("scrollRestoration" in history) history.scrollRestoration = "manual";

	/** A page of this site, rather than a file it happens to serve. */
	const routable = (url) =>
		url.origin === location.origin && (url.pathname.endsWith("/") || !/\.[a-z0-9]+$/i.test(url.pathname));

	function fetchPage(path) {
		let p = cache.get(path);
		if (!p) {
			p = fetch(path, { credentials: "same-origin" }).then((r) => {
				if (!r.ok) throw new Error(String(r.status));
				return r.text();
			});
			p.catch(() => cache.delete(path));
			cache.set(path, p);
		}
		return p;
	}

	const linkUrl = (a) => {
		if (!a || a.hasAttribute("download") || a.hasAttribute("data-no-route")) return null;
		if (a.target && a.target !== "_self") return null;
		const url = new URL(a.getAttribute("href"), location.href);
		return routable(url) ? url : null;
	};

	// Warm on intent, too, for the moment before the idle prefetch has run.
	const warm = (e) => {
		const url = linkUrl(e.target.closest?.("a[href]"));
		if (url) fetchPage(url.pathname);
	};
	document.addEventListener("pointerover", warm, { passive: true });
	document.addEventListener("touchstart", warm, { passive: true });
	document.addEventListener("focusin", warm);

	idle(() => {
		for (const a of $$("nav a[href]")) {
			const url = linkUrl(a);
			if (url) fetchPage(url.pathname);
		}
		setTimeout(() => idle(loadIndex), 800);
	});

	const targetOf = (hash) => {
		if (!hash || hash.length < 2) return null;
		let el;
		try { el = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return null; }
		if (el) openFoldsAround(el);
		return el;
	};

	document.addEventListener("click", (e) => {
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		const a = e.target.closest?.("a[href]");
		const url = linkUrl(a);
		if (!url) return;
		if (url.pathname === currentPath) {
			if (url.hash) return; // an in-page jump is the browser's job
			e.preventDefault();
			window.scrollTo(0, 0);
			return;
		}
		e.preventDefault();
		navigate(url, { push: true });
	});

	async function navigate(url, { push = true, scroll = 0, highlight = null } = {}) {
		const token = ++navToken;
		let html;
		try {
			html = await fetchPage(url.pathname);
		} catch {
			location.href = url.href;
			return;
		}
		if (token !== navToken) return; // a later click already won

		const doc = new DOMParser().parseFromString(html, "text/html");
		const next = doc.querySelector("main");
		if (!next) { location.href = url.href; return; }

		if (push) history.replaceState({ ...(history.state || {}), scroll: window.scrollY }, "");
		clearHighlight();
		$("main").replaceWith(document.adoptNode(next));
		document.title = doc.title;

		const current = new Map($$("nav a", doc).map((a) => [a.getAttribute("href"), a.getAttribute("aria-current")]));
		for (const a of $$("nav a")) {
			const v = current.get(a.getAttribute("href"));
			v ? a.setAttribute("aria-current", v) : a.removeAttribute("aria-current");
		}
		for (const sel of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'link[rel="canonical"]']) {
			const from = doc.head.querySelector(sel);
			const to = document.head.querySelector(sel);
			if (!from || !to) continue;
			for (const attr of ["content", "href"]) if (from.hasAttribute(attr)) to.setAttribute(attr, from.getAttribute(attr));
		}

		if (push) history.pushState({ scroll: 0 }, "", url.href);
		currentPath = url.pathname;

		const main = $("main");
		main.setAttribute("tabindex", "-1");
		main.focus({ preventScroll: true });

		if (highlight) applyHighlight(highlight, url.hash);
		else if (url.hash) (targetOf(url.hash) ?? document.body).scrollIntoView();
		else window.scrollTo(0, scroll);
	}

	window.addEventListener("popstate", (e) => {
		const url = new URL(location.href);
		if (url.pathname === currentPath) {
			if (url.hash) targetOf(url.hash)?.scrollIntoView();
			else window.scrollTo(0, e.state?.scroll ?? 0);
			return;
		}
		navigate(url, { push: false, scroll: e.state?.scroll ?? 0 });
	});

	// ==== 2. code blocks ======================================================

	function setFold(fold, open) {
		fold.dataset.open = String(open);
		const [row, body] = fold.children;
		if (row) row.hidden = open;
		if (body) body.hidden = !open;
		const line = fold.previousElementSibling;
		line?.classList.toggle("closed", !open);
		line?.querySelector("[data-fold-chev]")?.setAttribute("aria-expanded", String(open));
	}

	// Keyboard: the chevron is the row's focusable handle.
	document.addEventListener("keydown", (e) => {
		const chev = e.target.closest?.("[data-fold-chev]");
		if (!chev || (e.key !== "Enter" && e.key !== " ")) return;
		e.preventDefault();
		chev.click();
	});

	function syncToggle(fig) {
		const btn = $("[data-code-toggle]", fig);
		if (btn) btn.textContent = $(".fold[data-open='false']", fig) ? "Expand all" : "Collapse all";
	}

	function openFoldsAround(el) {
		for (let n = el.parentElement; n; n = n.parentElement) {
			if (n.classList?.contains("fold") && n.dataset.open === "false") {
				setFold(n, true);
				syncToggle(n.closest("figure.code"));
			}
		}
	}

	function flash(btn, text) {
		const was = btn.dataset.label ?? btn.textContent;
		btn.dataset.label = was;
		btn.textContent = text;
		btn.classList.add("done");
		clearTimeout(btn._t);
		btn._t = setTimeout(() => { btn.textContent = was; btn.classList.remove("done"); }, 1400);
	}

	document.addEventListener("click", async (e) => {
		const t = e.target;
		if (!(t instanceof Element)) return;

		const copy = t.closest("[data-code-copy]");
		if (copy) {
			const fig = copy.closest("figure.code");
			try {
				await navigator.clipboard.writeText(fig.dataset.src);
				flash(copy, "Copied");
			} catch {
				const range = document.createRange();
				range.selectNodeContents($("pre", fig));
				getSelection().removeAllRanges();
				getSelection().addRange(range);
				flash(copy, isMac ? "Press ⌘C" : "Press Ctrl+C");
			}
			return;
		}

		const opener = t.closest("[data-fold-open]");
		if (opener) {
			const fold = opener.closest(".fold");
			setFold(fold, true);
			syncToggle(fold.closest("figure.code"));
			fold.closest("pre")?.focus({ preventScroll: true });
			return;
		}

		const chev = t.closest("[data-fold-chev]");
		if (chev) {
			const fold = chev.closest(".line")?.nextElementSibling;
			if (fold?.classList.contains("fold")) {
				setFold(fold, fold.dataset.open !== "true");
				syncToggle(fold.closest("figure.code"));
			}
			return;
		}

		const all = t.closest("[data-code-toggle]");
		if (all) {
			const fig = all.closest("figure.code");
			const expand = !!$(".fold[data-open='false']", fig);
			for (const f of $$(".fold", fig)) setFold(f, expand);
			syncToggle(fig);
			return;
		}

		// The whole row toggles, not just the chevron: the opening line of any
		// fold, and -- for a closed one drawn inline -- the summary and the
		// closing bracket beside it. A click that ends a text selection is a
		// selection, not a toggle, so copying a key out of a row still works.
		// isCollapsed, not toString(): serialising the selection needs layout,
		// and a plain click always collapses it on mousedown anyway.
		if (!t.closest("figure.code pre") || !getSelection().isCollapsed) return;
		let fold = null;
		const row = t.closest(".fold-row");
		if (row) fold = row.parentElement;
		else {
			const line = t.closest(".line");
			if (line?.classList.contains("has-fold")) fold = line.nextElementSibling;
			else if (line?.previousElementSibling?.matches(".fold[data-open='false']")) fold = line.previousElementSibling;
		}
		if (fold?.classList.contains("fold")) {
			setFold(fold, fold.dataset.open !== "true");
			syncToggle(fold.closest("figure.code"));
		}
	});

	// The preset page's own filter -- delegated, because an inline script in a
	// swapped-in <main> never runs.
	document.addEventListener("input", (e) => {
		if (e.target.id !== "preset-search") return;
		const q = e.target.value.trim().toLowerCase();
		let shown = 0;
		for (const card of $$("[data-preset]")) {
			card.hidden = !!q && !(card.dataset.preset || card.textContent).toLowerCase().includes(q);
			if (!card.hidden) shown++;
		}
		const empty = $("#preset-empty");
		if (empty) empty.hidden = shown !== 0;
	});

	// ==== 3. search ===========================================================

	const dlg = $("#search");
	const input = $("#search-input");
	const list = $("#search-results");
	let index = null;
	let loading = null;
	let items = [];
	let selected = -1;

	for (const k of $$("[data-kbd-mod]")) k.textContent = isMac ? "⌘K" : "Ctrl K";

	function loadIndex() {
		loading ??= new Promise((resolve, reject) => {
			if (window.MiniSearch) return resolve();
			const s = document.createElement("script");
			s.src = PUBLIC_BASE + "/assets/minisearch.js";
			s.onload = resolve;
			s.onerror = reject;
			document.head.append(s);
		})
			.then(() => fetch(PUBLIC_BASE + "/assets/search.json"))
			.then((r) => r.json())
			.then(({ options, index: data }) => { index = window.MiniSearch.loadJS(data, options); })
			.catch((err) => { loading = null; throw err; });
		return loading;
	}

	/** A regex over the words a result matched on, for marking them. */
	function termsRegex(terms) {
		const uniq = [...new Set(terms.map((t) => String(t).toLowerCase()).filter(Boolean))].sort((a, b) => b.length - a.length);
		if (!uniq.length) return null;
		const parts = uniq.map((t) => {
			const e = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			// A short word only where it stands alone; a longer one anywhere, so
			// "setting" lights up inside "hostSetting".
			return t.length >= 3 ? e : `(?<![\\p{L}\\p{N}])${e}(?![\\p{L}\\p{N}])`;
		});
		return new RegExp(parts.join("|"), "giu");
	}

	function markup(text, re) {
		if (!re) return esc(text);
		let out = "";
		let last = 0;
		for (const m of text.matchAll(re)) {
			if (!m[0]) continue;
			out += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`;
			last = m.index + m[0].length;
		}
		return out + esc(text.slice(last));
	}

	function snippet(text, re) {
		if (!text) return "";
		let start = 0;
		if (re) {
			re.lastIndex = 0;
			const m = re.exec(text);
			re.lastIndex = 0;
			if (m && m.index > 70) {
				start = m.index - 60;
				const sp = text.indexOf(" ", start);
				if (sp !== -1 && sp < m.index) start = sp + 1;
			}
		}
		const slice = text.slice(start, start + 240);
		return (start > 0 ? "…" : "") + markup(slice, re) + (start + 240 < text.length ? "…" : "");
	}

	const hrefOf = (r) => r.path + (r.anchor ? `#${r.anchor}` : "");

	function itemHtml(r, re, i, { icon } = {}) {
		return (
			`<a class="search-item" role="option" id="sr-${i}" href="${esc(hrefOf(r))}" data-i="${i}" aria-selected="false">` +
			`<span class="icon" aria-hidden="true">${icon ?? (r.anchor ? "#" : "¶")}</span>` +
			`<span class="title">${markup(r.heading || r.pageTitle, re)}</span>` +
			`<span class="enter" aria-hidden="true">↵</span>` +
			(r.snippet !== undefined ? `<span class="snippet">${r.snippet}</span>` : `<span class="snippet">${snippet(r.text, re)}</span>`) +
			`</a>`
		);
	}

	function paint(groups) {
		items = [];
		let html = "";
		for (const g of groups) {
			html += `<div class="search-group" role="group" aria-label="${esc(g.title)}"><div class="search-group-title">${esc(g.title)}</div>`;
			for (const r of g.rows) {
				html += itemHtml(r, g.re, items.length, r);
				items.push(r);
			}
			html += `</div>`;
		}
		list.innerHTML = html;
		select(items.length ? 0 : -1);
	}

	function renderEmpty() {
		const recent = storage.get("lintel.recent", []);
		const pages = $$("nav a").map((a) => ({ path: a.getAttribute("href"), anchor: "", heading: a.textContent, pageTitle: a.textContent, snippet: "", icon: "→" }));
		paint([
			...(recent.length ? [{ title: "Recent", rows: recent.map((r) => ({ ...r, snippet: esc(`“${r.q}”`), icon: "↺" })) }] : []),
			{ title: "Pages", rows: pages },
		]);
	}

	function run() {
		const q = input.value.trim();
		if (!q) return renderEmpty();
		if (!index) {
			list.innerHTML = `<div class="search-empty">Loading the index…</div>`;
			items = [];
			loadIndex().then(() => { if (dlg.open && input.value.trim() === q) run(); }, () => {
				list.innerHTML = `<div class="search-empty">The search index could not be loaded.</div>`;
			});
			return;
		}
		const opts = {
			prefix: (term) => term.length > 1,
			fuzzy: (term) => (term.length > 4 ? 0.2 : false),
			boost: { heading: 3, pageTitle: 1.5, alt: 0.6 },
			combineWith: "AND",
		};
		let hits = index.search(q, opts);
		if (!hits.length) hits = index.search(q, { ...opts, combineWith: "OR" });

		if (!hits.length) {
			items = [];
			selected = -1;
			list.innerHTML = `<div class="search-empty">No results for <strong>“${esc(q)}”</strong>.<br>Try a manifest key like <mark>hostSetting</mark> or a scheme like <mark>stith://</mark>.</div>`;
			input.removeAttribute("aria-activedescendant");
			return;
		}

		const byPage = new Map();
		for (const h of hits.slice(0, 40)) {
			const g = byPage.get(h.pageTitle) ?? byPage.set(h.pageTitle, []).get(h.pageTitle);
			if (g.length < 6) g.push({ ...h, terms: h.terms });
		}
		paint(
			[...byPage].map(([title, rows]) => ({
				title,
				// one regex per group would mark a word another row matched on;
				// each row marks its own
				rows: rows.slice(0, 6).map((r) => ({ ...r, snippet: snippet(r.text, termsRegex(r.terms)) })),
				re: null,
			})),
		);
		// titles are marked per row, which paint() could not do with re: null
		for (const a of $$(".search-item", list)) {
			const r = items[+a.dataset.i];
			$(".title", a).innerHTML = markup(r.heading || r.pageTitle, termsRegex(r.terms || []));
		}
	}

	function select(i) {
		const nodes = $$(".search-item", list);
		if (!nodes.length) { selected = -1; input.removeAttribute("aria-activedescendant"); return; }
		selected = (i + nodes.length) % nodes.length;
		nodes.forEach((n, k) => n.setAttribute("aria-selected", String(k === selected)));
		nodes[selected].scrollIntoView({ block: "nearest" });
		input.setAttribute("aria-activedescendant", nodes[selected].id);
	}

	function remember(r, q) {
		if (!q) return;
		const entry = { q, path: r.path, anchor: r.anchor, heading: r.heading || r.pageTitle, pageTitle: r.pageTitle, terms: r.terms || [] };
		const recent = storage.get("lintel.recent", []).filter((x) => x.q.toLowerCase() !== q.toLowerCase());
		storage.set("lintel.recent", [entry, ...recent].slice(0, 5));
	}

	function openItem(i, newTab) {
		const r = items[i];
		if (!r) return;
		const q = r.q ?? input.value.trim();
		const url = new URL(hrefOf(r), location.href);
		if (r.terms?.length) remember(r, q);
		dlg.close();
		if (newTab) { window.open(url.href, "_blank", "noopener"); return; }
		const highlight = r.terms?.length ? { terms: r.terms, q } : null;
		if (url.pathname === currentPath) {
			if (url.href !== location.href) history.pushState({ scroll: window.scrollY }, "", url.href);
			if (highlight) applyHighlight(highlight, url.hash);
			else (targetOf(url.hash) ?? document.body).scrollIntoView();
		} else {
			navigate(url, { push: true, highlight });
		}
	}

	function openSearch() {
		if (dlg.open) { input.select(); return; }
		dlg.showModal();
		input.select();
		run();
		loadIndex().catch(() => {});
	}

	input.addEventListener("input", run);
	input.addEventListener("keydown", (e) => {
		// Handled keys stop here. The Enter that opens a result would otherwise
		// bubble on to the page's find handler -- which, the palette having just
		// closed and the highlight just been applied, reads it as "next match"
		// and lands the reader on the second hit instead of the first.
		if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); select(selected + 1); }
		else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); select(selected - 1); }
		else if (e.key === "Enter" && selected >= 0) { e.preventDefault(); e.stopPropagation(); openItem(selected, e.metaKey || e.ctrlKey); }
	});
	list.addEventListener("pointermove", (e) => {
		const a = e.target.closest?.(".search-item");
		if (a && +a.dataset.i !== selected) select(+a.dataset.i);
	});
	list.addEventListener("click", (e) => {
		const a = e.target.closest?.(".search-item");
		if (!a) return;
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; // let the browser open a tab
		e.preventDefault();
		openItem(+a.dataset.i, false);
	});
	dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
	document.addEventListener("click", (e) => { if (e.target.closest?.("[data-search-open]")) openSearch(); });
	document.addEventListener("pointerover", (e) => { if (e.target.closest?.("[data-search-open]")) loadIndex().catch(() => {}); }, { passive: true });

	// ==== in-page highlight ===================================================

	const bar = $("#findbar");
	let find = null; // { marks, i }

	function applyHighlight({ terms, q }, hash) {
		clearHighlight();
		const re = termsRegex(terms);
		const main = $("main");
		const target = targetOf(hash);
		if (!re) { (target ?? main).scrollIntoView(); return; }

		const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
			acceptNode: (n) =>
				!n.nodeValue.trim() || n.parentElement.closest("script,style,button,textarea,kbd,.anchor,figcaption")
					? NodeFilter.FILTER_REJECT
					: NodeFilter.FILTER_ACCEPT,
		});
		const nodes = [];
		while (walker.nextNode()) nodes.push(walker.currentNode);

		const marks = [];
		for (const node of nodes) {
			const text = node.nodeValue;
			let frag = null;
			let last = 0;
			for (const m of text.matchAll(re)) {
				if (!m[0]) continue;
				frag ??= document.createDocumentFragment();
				frag.append(text.slice(last, m.index));
				const mk = document.createElement("mark");
				mk.className = "hit";
				mk.textContent = m[0];
				frag.append(mk);
				marks.push(mk);
				last = m.index + m[0].length;
			}
			if (frag) { frag.append(text.slice(last)); node.replaceWith(frag); }
			if (marks.length >= 1000) break;
		}

		if (!marks.length) { (target ?? main).scrollIntoView(); return; }

		// Start at the section the result named, not at the first mention on the
		// page -- the whole point of a section-level hit.
		let start = 0;
		if (target) {
			const k = marks.findIndex((mk) => target.contains(mk) || target.compareDocumentPosition(mk) & Node.DOCUMENT_POSITION_FOLLOWING);
			if (k >= 0) start = k;
		}
		find = { marks, i: -1 };
		$(".q", bar).textContent = `“${q}”`;
		bar.hidden = false;
		step(start - find.i);
	}

	function step(delta) {
		if (!find) return;
		const { marks } = find;
		marks[find.i]?.classList.remove("current");
		find.i = (find.i + delta + marks.length) % marks.length;
		const mk = marks[find.i];
		openFoldsAround(mk);
		mk.classList.add("current");
		mk.scrollIntoView({ block: "center", inline: "nearest" });
		$(".count", bar).textContent = `${find.i + 1} of ${marks.length}`;
	}

	function clearHighlight() {
		if (!find) return;
		const parents = new Set();
		for (const mk of find.marks) {
			if (!mk.isConnected) continue;
			parents.add(mk.parentNode);
			mk.replaceWith(mk.textContent);
		}
		parents.forEach((p) => p.normalize());
		find = null;
		bar.hidden = true;
	}

	bar.addEventListener("click", (e) => {
		const b = e.target.closest?.("[data-find]");
		if (!b) return;
		const what = b.dataset.find;
		if (what === "close") clearHighlight();
		else step(what === "next" ? 1 : -1);
	});

	// ==== keys ================================================================

	document.addEventListener("keydown", (e) => {
		const el = document.activeElement;
		const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
		const mod = e.metaKey || e.ctrlKey;

		if (mod && !e.altKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); openSearch(); return; }
		if (e.key === "/" && !typing && !dlg.open && !mod) { e.preventDefault(); openSearch(); return; }

		if (find && !dlg.open) {
			if (e.key === "Escape") { clearHighlight(); return; }
			if (e.key === "F3" || (mod && (e.key === "g" || e.key === "G"))) { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
			if (e.key === "Enter" && !typing && !el?.closest("a,button")) { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
		}
	});
})();
