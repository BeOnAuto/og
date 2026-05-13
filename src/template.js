import { fileURLToPath } from "node:url";

/**
 * Query-param names the image harness ({@link import('./generate.js').generateOgImages})
 * appends to the template URL. A per-site `template.html` reads these from
 * `new URLSearchParams(location.search)` and injects them into the DOM, so the
 * rendered picture carries the same copy as the page's `<meta>` tags.
 */
export const CARD_PARAM_NAMES = Object.freeze([
	"theme",
	"name",
	"headline",
	"tagline",
	"title",
	"description",
]);

/** Absolute path to the built-in, brand-neutral template a new site gets for free. */
export function defaultTemplatePath() {
	return fileURLToPath(new URL("../templates/default.html", import.meta.url));
}

/** Parse the card params out of a template URL's search string (handy in tests). */
export function readCardParams(search) {
	const p = new URLSearchParams(search);
	return Object.fromEntries(CARD_PARAM_NAMES.map((k) => [k, p.get(k) ?? ""]));
}
