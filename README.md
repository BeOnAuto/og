# @beonauto/og

Shared Open Graph **pipeline** for Auto's sites (`narrativedriven.org`, `specdriven.com`, `on.auto`).

The package is the *process*: it derives the social card copy from the homepage,
emits the `<meta>` tags, and runs the screenshot harness. The *content* — your
`template.html`, your `og.config.js` — lives in each site's repo. Because the
image generator is handed the same resolved copy that produced the meta tags,
the picture can't drift from what the page says.

## Install (from a site repo)

Consumed straight from this (public) repo by git URL — no registry, no auth,
works the same locally and in CI. Pin to a tag:

```jsonc
// package.json
"devDependencies": {
  "@beonauto/og": "github:BeOnAuto/og#v0.2.0",
  "puppeteer": "^24.40.0"
}
```

`puppeteer` is an optional peer dep, only needed by `og generate`.

## Use

### 1. Meta tags — `.vitepress/config.mts`

```ts
import { siteCard } from "@beonauto/og/meta";

const card = siteCard({
  siteUrl: "https://specdriven.com",
  srcDir: "docs",                       // where index.md lives (default "docs")
  // fallbacks: { description: "..." }, // used only for fields the frontmatter lacks
});

export default defineConfig({
  head: [
    ...otherHead,
    ...card.head,   // og:title, og:description, og:url, og:site_name, og:image(+dims/alt), twitter:*, canonical
  ],
});
```

Per field, `siteCard` resolves: **homepage frontmatter → `fallbacks` (og.config) → derived default.**
Recognised frontmatter: VitePress `hero: { name, text, tagline }`, a custom
`animatedHero: { name, subhead, lead }`, or top-level `title` / `description`.
Derived defaults: `title` ← `"{name}. {headline}"`, `description` ← `"{headline} {tagline}"`.
So a homepage with no hero block (e.g. on.auto) just supplies `fallbacks` in `og.config.js`.

### 2. Image — `og.config.js` + `pnpm og generate`

```js
// og.config.js
export default {
  siteUrl: "https://specdriven.com",
  srcDir: "docs",
  ogImagePath: "/og-image.png",          // optional; the path used in <meta og:image>
  fallbacks: { /* name, headline, tagline, title, description */ },

  generate: {
    root: ".",                            // directory served while screenshotting
    template: "scripts/og/template.html", // your brand template (omit to use the built-in one)
    outputDir: "docs/public",
    variants: [
      { theme: "dark", output: "og-dark.png" },
      { theme: "light", output: "og-light.png" },
    ],
    defaultOutput: "og-dark.png",         // copied to og-image.png
    waitUntil: "networkidle0",            // page.goto condition; "domcontentloaded" if a CDN import stalls networkidle
    waitFor: "window.__OG_READY === true",// string => waitForFunction; number => ms pause; optional
    extraParams: ({ theme, origin }) => ({ bgUrl: `${origin}/docs/public/animations/bg-${theme}.svg` }),
  },
};
```

`variants[].extraParams` is merged on top of the top-level `extraParams` for that variant.

```jsonc
// package.json
"scripts": { "generate:og": "og generate" }
```

The harness appends the canonical copy to the template URL:

```
template.html?theme=dark&name=...&headline=...&tagline=...&title=...&description=...
```

Your `template.html`'s inline script reads them and writes them into the DOM —
that's the whole contract. Param names: `CARD_PARAM_NAMES` from `@beonauto/og/template`.

`og card` prints the resolved card as JSON — useful for checking what the meta
tags and image will say.

## API

- `@beonauto/og/meta` — `siteCard`, `resolveCardCopy`, `ogHead`, `readFrontmatter`
- `@beonauto/og/generate` — `generateOgImages`
- `@beonauto/og/template` — `CARD_PARAM_NAMES`, `defaultTemplatePath`, `readCardParams`
- bin: `og generate` | `og card`
