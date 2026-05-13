#!/usr/bin/env node
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isAbsolute, relative, resolve } from "node:path";
import { siteCard } from "../src/meta.js";
import { generateOgImages } from "../src/generate.js";
import { defaultTemplatePath } from "../src/template.js";

const CONFIG_CANDIDATES = ["og.config.js", "og.config.mjs", "og.config.json"];

async function loadConfig(cwd, explicitPath) {
	const file = explicitPath
		? resolve(cwd, explicitPath)
		: CONFIG_CANDIDATES.map((c) => resolve(cwd, c)).find(existsSync);
	if (!file) {
		throw new Error(
			`No og config found. Create og.config.js exporting { siteUrl, srcDir?, fallbacks?, generate? } in ${cwd}`,
		);
	}
	const mod = await import(pathToFileURL(file).href);
	return mod.default ?? mod;
}

const abs = (cwd, p) => (p == null ? p : isAbsolute(p) ? p : resolve(cwd, p));

function cardFromConfig(cwd, config) {
	return siteCard({
		cwd,
		siteUrl: config.siteUrl,
		srcDir: config.srcDir,
		homeFile: config.homeFile,
		siteName: config.siteName,
		image: config.ogImagePath,
		imageWidth: config.imageWidth,
		imageHeight: config.imageHeight,
		imageAlt: config.imageAlt,
		fallbacks: config.fallbacks,
	});
}

async function main() {
	const [command = "generate", ...rest] = process.argv.slice(2);
	const cwd = process.cwd();
	const configFlag = rest.find((a) => a.startsWith("--config="));
	const config = await loadConfig(cwd, configFlag?.slice("--config=".length));
	const card = cardFromConfig(cwd, config);

	if (command === "card") {
		process.stdout.write(`${JSON.stringify(card, null, 2)}\n`);
		return;
	}
	if (command !== "generate") {
		throw new Error(`Unknown command "${command}". Use: og generate | og card`);
	}

	const gen = config.generate ?? {};
	const root = abs(cwd, gen.root ?? ".");

	let template = gen.template; // relative to `root`, as served by the static server
	if (!template) {
		const def = defaultTemplatePath();
		if (!resolve(def).startsWith(resolve(root))) {
			throw new Error(
				`The built-in template lives outside the served root (${root}). Set generate.template, or copy a template into your repo.`,
			);
		}
		template = relative(root, def).split(/[\\/]/).join("/");
	}

	await generateOgImages({
		card,
		root,
		template,
		outputDir: abs(cwd, gen.outputDir ?? `${config.srcDir ?? "docs"}/public`),
		variants: gen.variants,
		defaultOutput: gen.defaultOutput,
		viewport: gen.viewport,
		extraParams: gen.extraParams,
		waitUntil: gen.waitUntil,
		waitFor: gen.waitFor,
		settleMs: gen.settleMs,
	});
}

main().catch((err) => {
	console.error(err?.stack ?? String(err));
	process.exit(1);
});
