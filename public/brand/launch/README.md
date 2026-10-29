# Sprout 春笋: $SPROUT launch assets

Clean pixel-art launch kit. The mark is a bamboo shoot (春笋) drawn on a 16×18 pixel grid. A slender
tip sits above three sheaths, which are separated by chevron node lines (one-cell gaps). It uses two
flat tones only: BNB yellow `#F0B90B` on the right half and a lighter `#FCD535` on the left half. The
field is pure black `#000`. There are no gradients, glows, rings or textures. Every PNG is laid out at
its exact size with whole-pixel cells (34 px at 1000, 14 px at 400, 17 px at 512) and
`shape-rendering="crispEdges"`, so the edges stay sharp.

The grid is defined once in `brand/src/mark.mjs` (`GRID`). The same mark is used in
`public/brand/sprout-mark.svg`, the site's `Mark` component (`src/components/brand.tsx`), the favicon
(`src/app/icon.svg`), the apple icon and the OG/Twitter images (`src/lib/og.tsx`).

| File | Size | Use |
|---|---|---|
| `pfp.svg` | 1000×1000 (vector) | Source for the PFP / token logo. |
| `pfp-1000.png` | 1000×1000 | X / Telegram / Discord profile picture (hi-res upload). |
| `pfp-400.png` | 400×400 | Profile picture at the platform-native size, and for listings and aggregators. |
| `token-logo-512.png` | 512×512 | Token image for the Flap launch form, and for BscScan, DEX screeners and wallets. |
| `pfp-circle-check.png` | 1200×520 | QA sheet: circle crop with a 72% safe zone, and 128/64/48/32 px and feed-size renders. Not for upload. |
| `banner-x-1500x500.png` | 1500×500 | X (Twitter) header. Content stays clear of the bottom-left avatar overlap and of the ~60px top and bottom mobile crop. |
| `preview-x-profile.png` | 1500×760 | QA mock of the X header with the avatar overlaid and the crop lines drawn. Not for upload. |
| `banner-flap-1200x400.png` | 1200×400 | Wide token-page banner (Flap and other token pages). |
| `banner-1920x1080.png` | 1920×1080 | Generic 16:9 hero for Telegram, announcement posts, the website hero and stream overlays. |

The whole mark sits inside the centre 70% circle, so circular crops on X and Telegram only remove
black background.

The banners use the same style: a black field, the pixel mark, Geist / Geist Mono and Noto Sans SC
type, yellow as the only accent, and a minimal pixel bamboo row (`brand/src/grove.mjs`). They contain
no stats, progress bars or "live" badges.

## Re-rendering

The assets are authored as SVG/HTML in `brand/src/` and screenshotted with headless Chrome at
deviceScaleFactor 1, at the exact sizes above. Fonts are Geist / Geist Mono (`geist` package) and
Noto Sans SC (`@fontsource/noto-sans-sc`), all loaded locally. The renderer waits until every glyph's
font is loaded before it takes the screenshot.

```
cd brand
npm install
npm run render        # set CHROME=<path to chrome.exe> if Chrome is not in the default location
```

If you change `GRID`, also regenerate the path data inlined in `src/components/brand.tsx`,
`src/lib/og.tsx`, `src/app/icon.svg` and `public/brand/sprout-mark.svg`. You can print it with
`node -e "import('./src/mark.mjs').then(m => console.log(m.markPaths(1, 1, 0)))"`.
