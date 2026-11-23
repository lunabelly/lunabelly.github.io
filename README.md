# Luna Belly

The Luna Belly online shop: waist chains, belly chains and kamarbandhs.

Live at **https://lunabelly.github.io**

## What is where

| Folder | What it is |
| --- | --- |
| `site/` | The website: plain HTML, CSS and JavaScript. Products, orders, articles and settings live in the shop's database (Supabase), not here. |
| `site/atelier-7xk2m9/` | The Studio (owner area). It only works after signing in with an owner account. |
| `site/api/` | Code that makes the search-friendly page for each piece, collection and article, plus `sitemap.xml` and `llms.txt`. |
| `scripts/build.mjs` | Turns `site/` and the live shop data into the finished website in `_site/`. |
| `.github/workflows/pages.yml` | Runs the build and publishes it on every change, every hour, and on demand. |

## Publishing

Every change pushed to `main` is published automatically within a few minutes. To publish
straight away, for example after adding a piece in the Studio, open **Actions → Build and
publish → Run workflow**.

## Safety

- No passwords or secret keys are in this repository. The only key in `site/config.js` is the
  public (publishable) one that every visitor's browser already receives. Database rules decide
  what it can read.
- Customer details, orders and messages are never stored here.

## Building on your own computer

```
npm ci
node scripts/build.mjs
```

The finished site is in `_site/`. Node.js 20 or newer is needed.
