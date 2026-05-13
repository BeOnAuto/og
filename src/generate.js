import { createServer } from "node:http";
import { copyFileSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const MIME_TYPES = {
	".html": "text/html",
	".json": "application/json",
	".js": "application/javascript",
	".mjs": "application/javascript",
	".css": "text/css",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".lottie": "application/octet-stream",
};

/** Minimal static file server rooted at `root`. Resolves to `{ server, port, origin }`. */
function startServer(root) {
	return new Promise((resolvePromise) => {
		const server = createServer((req, res) => {
			const url = new URL(req.url, "http://localhost");
			const filePath = resolve(root, "." + url.pathname);
			try {
				const data = readFileSync(filePath);
				res.writeHead(200, {
					"Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
					"Access-Control-Allow-Origin": "*",
				});
				res.end(data);
			} catch {
				res.writeHead(404);
				res.end("Not found");
			}
		});
		server.listen(0, "127.0.0.1", () => {
			const port = server.address().port;
			resolvePromise({ server, port, origin: `http://127.0.0.1:${port}` });
		});
	});
}

/** Query string carrying the canonical card copy + theme into the template. */
function templateQuery({ card, theme, origin, extraParams }) {
	const params = new URLSearchParams({
		theme,
		name: card?.name ?? "",
		headline: card?.headline ?? "",
		tagline: card?.tagline ?? "",
		title: card?.title ?? "",
		description: card?.description ?? "",
	});
	const extra =
		typeof extraParams === "function"
			? extraParams({ theme, origin, card })
			: extraParams;
	for (const [k, v] of Object.entries(extra ?? {})) {
		params.set(k, String(v));
	}
	return params.toString();
}

/**
 * Render the OG images by screenshotting an HTML template, once per variant.
 *
 * The same `card` object that feeds the site's `<meta>` tags is passed into the
 * template as query params (`?name=&headline=&tagline=&title=&description=`), so
 * the picture always says what the page says.
 *
 * @param {object} config
 * @param {import('./meta.js').siteCard extends (...a:any)=>infer R ? R : any} [config.card] canonical copy from siteCard()
 * @param {string} config.root        directory served statically (usually the package/site root)
 * @param {string} config.template    path to the template HTML, relative to `root` (e.g. "scripts/og/template.html")
 * @param {string} config.outputDir   absolute directory for the generated PNGs
 * @param {Array<{ theme: string, output: string, extraParams?: object }>} [config.variants]
 *        default: dark -> og-dark.png, light -> og-light.png
 * @param {string} [config.defaultOutput] which variant file to copy to og-image.png. Default "og-dark.png"
 * @param {{ width?: number, height?: number, deviceScaleFactor?: number }} [config.viewport] default 1200x630@1
 * @param {object|((ctx:{theme:string,origin:string,card:any})=>object)} [config.extraParams] extra template query params
 * @param {string|number|null} [config.waitFor] JS expression to waitForFunction on, or ms to pause. Default waits document.fonts.ready
 * @param {number} [config.settleMs] extra pause after load for font/canvas paint. Default 1000
 * @param {(msg: string) => void} [config.log] default console.log
 */
export async function generateOgImages(config) {
	const {
		card,
		root,
		template,
		outputDir,
		variants = [
			{ theme: "dark", output: "og-dark.png" },
			{ theme: "light", output: "og-light.png" },
		],
		defaultOutput = "og-dark.png",
		viewport = {},
		extraParams,
		waitFor,
		settleMs = 1000,
		log = console.log,
	} = config;

	let puppeteer;
	try {
		puppeteer = (await import("puppeteer")).default;
	} catch {
		throw new Error("puppeteer is not installed. Add it as a devDependency in the consuming repo.");
	}

	const { width = 1200, height = 630, deviceScaleFactor = 1 } = viewport;

	const { server, origin } = await startServer(root);
	log(`og: serving ${root} at ${origin}`);

	const browser = await puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});

	try {
		for (const variant of variants) {
			log(`og: generating ${variant.output}...`);
			const page = await browser.newPage();
			await page.setViewport({ width, height, deviceScaleFactor });

			const query = templateQuery({
				card,
				theme: variant.theme,
				origin,
				extraParams: variant.extraParams ?? extraParams,
			});
			await page.goto(`${origin}/${template}?${query}`, {
				waitUntil: "networkidle0",
				timeout: 20000,
			});

			await page
				.waitForFunction("document.fonts.ready.then(() => true)", { timeout: 10000 })
				.catch(() => log(`og: warning - fonts may not have loaded for ${variant.theme}`));

			if (typeof waitFor === "string") {
				await page
					.waitForFunction(waitFor, { timeout: 15000 })
					.catch(() => log(`og: warning - waitFor never satisfied for ${variant.theme}`));
			} else if (typeof waitFor === "number") {
				await new Promise((r) => setTimeout(r, waitFor));
			}

			if (settleMs) await new Promise((r) => setTimeout(r, settleMs));

			const outputPath = resolve(outputDir, variant.output);
			await page.screenshot({ path: outputPath, type: "png" });
			log(`og: saved ${outputPath}`);
			await page.close();
		}

		if (defaultOutput) {
			copyFileSync(resolve(outputDir, defaultOutput), resolve(outputDir, "og-image.png"));
			log(`og: copied ${defaultOutput} -> og-image.png`);
		}
	} finally {
		await browser.close();
		server.close();
	}
	log("og: done.");
}
