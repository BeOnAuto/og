import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

/**
 * Read and parse the frontmatter of a markdown file.
 *
 * @param {string} filePath absolute or cwd-relative path to a `.md` file
 * @returns {Record<string, unknown>} the parsed frontmatter (empty object if none)
 */
export function readFrontmatter(filePath) {
	const raw = readFileSync(filePath, "utf8");
	return matter(raw).data ?? {};
}

/** Collapse whitespace and trim. */
function tidy(value) {
	return String(value ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Join phrases into prose, inserting ". " between parts that aren't already punctuated. */
function joinSentences(...parts) {
	return parts
		.map(tidy)
		.filter(Boolean)
		.reduce((acc, part) => {
			if (!acc) return part;
			return acc + (/[.!?:;,]$/.test(acc) ? " " : ". ") + part;
		}, "");
}

/** First non-empty (after tidy) of the arguments, or "". */
function firstOf(...values) {
	for (const v of values) {
		const t = tidy(v);
		if (t) return t;
	}
	return "";
}

/**
 * Resolve the canonical "card copy" for a site by merging, per field, the
 * homepage frontmatter with the site's `og.config` fallbacks.
 *
 * Per field, in order: frontmatter → `fallbacks` (from og.config) → a derived
 * default. Known frontmatter shapes: VitePress `hero: { name, text, tagline }`,
 * a custom `animatedHero: { name, subhead, lead }`, or top-level `title` /
 * `description`. So a site can supply only what its frontmatter can't express
 * (e.g. on.auto, whose homepage has no hero block) and let the rest derive.
 *
 * @param {Record<string, unknown>} frontmatter
 * @param {{ name?: string, headline?: string, tagline?: string, title?: string, description?: string }} [fallbacks]
 * @returns {{ name: string, headline: string, tagline: string, title: string, description: string }}
 */
export function resolveCardCopy(frontmatter = {}, fallbacks = {}) {
	const hero = frontmatter.hero ?? {};
	const animatedHero = frontmatter.animatedHero ?? {};

	const name = firstOf(hero.name, animatedHero.name, frontmatter.title, fallbacks.name);
	const headline = firstOf(hero.text, animatedHero.subhead, fallbacks.headline);
	const tagline = firstOf(
		hero.tagline,
		animatedHero.lead,
		frontmatter.description,
		fallbacks.tagline,
	);

	const title = firstOf(frontmatter.title, fallbacks.title, joinSentences(name, headline));
	const description = firstOf(
		frontmatter.description,
		fallbacks.description,
		joinSentences(headline, tagline),
		title,
	);

	return { name, headline, tagline, title, description };
}

/**
 * Build the VitePress `head` entries for Open Graph and Twitter cards.
 *
 * @param {object} card
 * @param {string} card.siteUrl       canonical site origin, e.g. "https://specdriven.com"
 * @param {string} card.title
 * @param {string} card.description
 * @param {string} [card.pageUrl]     defaults to siteUrl
 * @param {string} [card.siteName]    defaults to card.title
 * @param {string} [card.image]       path or absolute URL; path is resolved against siteUrl. Default "/og-image.png"
 * @param {number} [card.imageWidth]  default 1200
 * @param {number} [card.imageHeight] default 630
 * @param {string} [card.imageAlt]    default card.title
 * @param {string} [card.type]        og:type, default "website"
 * @returns {Array<["meta"|"link", Record<string, string>]>}
 */
export function ogHead(card) {
	const {
		siteUrl,
		title,
		description,
		pageUrl = siteUrl,
		siteName = title,
		image = "/og-image.png",
		imageWidth = 1200,
		imageHeight = 630,
		imageAlt = title,
		type = "website",
	} = card;

	const imageUrl = /^https?:\/\//.test(image) ? image : `${siteUrl}${image}`;

	return [
		["link", { rel: "canonical", href: pageUrl }],
		["meta", { property: "og:type", content: type }],
		["meta", { property: "og:title", content: title }],
		["meta", { property: "og:description", content: description }],
		["meta", { property: "og:url", content: pageUrl }],
		["meta", { property: "og:site_name", content: siteName }],
		["meta", { property: "og:image", content: imageUrl }],
		["meta", { property: "og:image:width", content: String(imageWidth) }],
		["meta", { property: "og:image:height", content: String(imageHeight) }],
		["meta", { property: "og:image:alt", content: imageAlt }],
		["meta", { name: "twitter:card", content: "summary_large_image" }],
		["meta", { name: "twitter:title", content: title }],
		["meta", { name: "twitter:description", content: description }],
		["meta", { name: "twitter:image", content: imageUrl }],
		["meta", { name: "twitter:image:alt", content: imageAlt }],
	];
}

/**
 * One call that ties the site's homepage to its social card: read the homepage
 * frontmatter, resolve the canonical copy, and return both the copy and the
 * ready-to-spread `head` entries. The OG image generator consumes the same
 * object, so the picture and the meta tags can never drift apart.
 *
 * @param {object} options
 * @param {string} options.siteUrl
 * @param {string} [options.srcDir]   directory holding the homepage file. Default "docs"
 * @param {string} [options.homeFile] homepage filename. Default "index.md"
 * @param {string} [options.cwd]      base for resolving srcDir. Default process.cwd()
 * @param {string} [options.siteName]
 * @param {string} [options.image]
 * @param {number} [options.imageWidth]
 * @param {number} [options.imageHeight]
 * @param {string} [options.imageAlt]
 * @param {{ name?: string, headline?: string, tagline?: string, title?: string, description?: string }} [options.fallbacks]
 *        per-field fallbacks (from og.config) used when the homepage frontmatter doesn't carry the field
 * @returns {{ name: string, headline: string, tagline: string, title: string, description: string, siteUrl: string, siteName: string, image: string, imageAlt: string, head: Array }}
 */
export function siteCard(options) {
	const {
		siteUrl,
		srcDir = "docs",
		homeFile = "index.md",
		cwd = process.cwd(),
		siteName,
		image = "/og-image.png",
		imageWidth = 1200,
		imageHeight = 630,
		imageAlt,
		fallbacks = {},
	} = options;

	const frontmatter = readFrontmatter(join(cwd, srcDir, homeFile));
	const copy = resolveCardCopy(frontmatter, fallbacks);

	const card = {
		...copy,
		siteUrl,
		siteName: siteName ?? copy.title,
		image,
		imageWidth,
		imageHeight,
		imageAlt: imageAlt ?? copy.title,
	};

	return { ...card, head: ogHead(card) };
}
