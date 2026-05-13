# @beonauto/og

Shared Open Graph **pipeline** for Auto's sites (`narrativedriven.org`, `specdriven.com`, `on.auto`).

The package is the *process*: it derives the social card copy from the homepage,
emits the `<meta>` tags, and runs the screenshot harness. The *content* — your
`template.html`, your `og.config.js` — lives in each site's repo. Because the
image generator is handed the same resolved copy that produced the meta tags,
the picture can't drift from what the page says.

## Install (from a site repo)

Published to **GitHub Packages** (private, org `BeOnAuto`). In the consuming repo:

```ini
# .npmrc
@beonauto:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```jsonc
// package.json
"devDependencies": {
  "@beonauto/og": "^0.1.0",
  "puppeteer": "^24.40.0"
}
```

- Locally: `NODE_AUTH_TOKEN` = a personal access token with `read:packages`.
- In CI: set `NODE_AUTH_TOKEN` from a token that can read the package. A repo's
  own `GITHUB_TOKEN` can't read packages owned by a *different* repo unless that
  package grants it access (Package settings → Manage Actions access → add repo),
  so most consumers use an org PAT secret.

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
    waitFor: "window.__OG_READY === true",// string => waitForFunction; number => ms pause; optional
    extraParams: ({ origin }) => ({ animation: `${origin}/docs/public/animations/hero.json` }),
  },
};
```

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
