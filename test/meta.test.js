import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ogHead, readFrontmatter, resolveCardCopy, siteCard } from "../src/meta.js";

function tmpHome(content) {
	const dir = mkdtempSync(join(tmpdir(), "og-test-"));
	writeFileSync(join(dir, "index.md"), content);
	return dir;
}

describe("resolveCardCopy", () => {
	it("derives title and description from a VitePress hero block", () => {
		const fm = {
			hero: {
				name: "Narrative-Driven Development",
				text: "Specify software as narratives.",
				tagline: "One model for intent, behavior, tests, and code. Review it with people. Execute it with agents.",
			},
		};
		const copy = resolveCardCopy(fm);
		expect(copy.title).toBe("Narrative-Driven Development. Specify software as narratives.");
		expect(copy.description).toBe(
			"Specify software as narratives. One model for intent, behavior, tests, and code. Review it with people. Execute it with agents.",
		);
		expect(copy.description).toContain("intent");
	});

	it("reads a custom animatedHero block (name/subhead/lead)", () => {
		const fm = {
			animatedHero: {
				name: "Spec-Driven Development",
				subhead: "Specifications are becoming a new software medium.",
				lead: "Spec-driven development turns intent and design into structured specifications.",
			},
		};
		const copy = resolveCardCopy(fm);
		expect(copy.name).toBe("Spec-Driven Development");
		expect(copy.headline).toBe("Specifications are becoming a new software medium.");
		expect(copy.tagline).toBe(
			"Spec-driven development turns intent and design into structured specifications.",
		);
	});

	it("prefers top-level frontmatter title/description when present", () => {
		const fm = {
			title: "Spec-Driven Development | Specifications for the AI Era",
			description: "A description that already mentions intent.",
			animatedHero: { name: "x", subhead: "y", lead: "z" },
		};
		const copy = resolveCardCopy(fm);
		expect(copy.title).toBe("Spec-Driven Development | Specifications for the AI Era");
		expect(copy.description).toBe("A description that already mentions intent.");
	});

	it("merges per field: frontmatter wins, og.config fallbacks fill the gaps", () => {
		// homepage has no hero block at all (cf. on.auto) — everything comes from fallbacks
		expect(
			resolveCardCopy({}, { title: "Auto. Build From Specs.", description: "Intent in, software out." }),
		).toMatchObject({
			title: "Auto. Build From Specs.",
			description: "Intent in, software out.",
		});

		// frontmatter supplies the title but not a description; the fallback fills only the gap
		expect(
			resolveCardCopy(
				{ title: "Real Frontmatter Title" },
				{ title: "ignored", description: "fallback description" },
			),
		).toMatchObject({
			title: "Real Frontmatter Title",
			description: "fallback description",
		});
	});

	it("collapses whitespace and joins name + headline into a sentence", () => {
		const copy = resolveCardCopy({ hero: { name: "A   B", text: "C\n D", tagline: "" } });
		expect(copy.name).toBe("A B");
		expect(copy.title).toBe("A B. C D");
	});
});

describe("ogHead", () => {
	it("emits og + twitter meta with an absolute image url", () => {
		const head = ogHead({
			siteUrl: "https://example.com",
			title: "T",
			description: "D",
		});
		const flat = head.map(([, attrs]) => attrs);
		expect(flat).toContainEqual({ property: "og:title", content: "T" });
		expect(flat).toContainEqual({ property: "og:description", content: "D" });
		expect(flat).toContainEqual({ name: "twitter:description", content: "D" });
		expect(flat).toContainEqual({ property: "og:image", content: "https://example.com/og-image.png" });
		expect(flat).toContainEqual({ rel: "canonical", href: "https://example.com" });
	});

	it("keeps an already-absolute image url as-is", () => {
		const head = ogHead({
			siteUrl: "https://example.com",
			title: "T",
			description: "D",
			image: "https://cdn.example.com/x.png",
		});
		expect(head.map(([, a]) => a)).toContainEqual({
			property: "og:image",
			content: "https://cdn.example.com/x.png",
		});
	});
});

describe("readFrontmatter / siteCard", () => {
	it("reads frontmatter from a markdown file", () => {
		const dir = tmpHome("---\nhero:\n  name: X\n  text: Y\n  tagline: Z\n---\nbody\n");
		expect(readFrontmatter(join(dir, "index.md"))).toEqual({ hero: { name: "X", text: "Y", tagline: "Z" } });
	});

	it("ties homepage frontmatter to a ready-to-spread head array", () => {
		const dir = tmpHome(
			"---\nhero:\n  name: Auto\n  text: Build from specs.\n  tagline: Intent in, software out.\n---\n",
		);
		const card = siteCard({ cwd: dir, srcDir: ".", siteUrl: "https://on.auto" });
		expect(card.title).toBe("Auto. Build from specs.");
		expect(card.description).toBe("Build from specs. Intent in, software out.");
		expect(card.siteName).toBe("Auto. Build from specs.");
		expect(card.head.map(([, a]) => a)).toContainEqual({
			property: "og:description",
			content: "Build from specs. Intent in, software out.",
		});
	});

	it("falls back to the default og image path and respects siteName override", () => {
		const dir = tmpHome("---\ntitle: T\ndescription: D\n---\n");
		const card = siteCard({ cwd: dir, srcDir: ".", siteUrl: "https://x.io", siteName: "X" });
		expect(card.image).toBe("/og-image.png");
		expect(card.siteName).toBe("X");
		expect(card.head.map(([, a]) => a)).toContainEqual({ property: "og:site_name", content: "X" });
	});
});
