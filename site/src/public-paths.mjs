export function publicBase(value = "") {
	if (!["", "/lintel"].includes(value)) throw new Error("LINTEL_BASE_PATH must be empty or /lintel");
	return value;
}

export function publicHtml(html, base) {
	publicBase(base);
	return html.replace('<html lang="en">', `<html lang="en" data-base="${base}">`)
		.replace(/\b(href|src)="\/(?!\/)([^"]*)"/g, (_, attribute, path) => `${attribute}="${base}/${path}"`);
}
