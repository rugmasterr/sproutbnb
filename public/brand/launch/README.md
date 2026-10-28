# Sprout 春笋: $SPROUT launch assets

Dark, techy, BNB-yellow launch kit. The bamboo-shoot mark is a refined redraw of `../sprout-mark.svg`
with the same three stacked sheaths, pointed tip, leaf and ground arc. The sheaths are BNB yellow
(#F0B90B / #FCD535 / #C99400), the leaf and ground are bamboo green (#2EBD6B / #7CE3A0), and the ink
background is #07080a.

| File | Size | Use |
|---|---|---|
| `pfp.svg` | 1000×1000 (vector) | Source for the PFP / token logo. Use it to re-export at any size. |
| `pfp-1000.png` | 1000×1000 | X / Telegram / Discord profile picture (hi-res upload). |
| `pfp-400.png` | 400×400 | Profile picture at the platform-native size, and for listings and aggregators. |
| `token-logo-512.png` | 512×512 | Token image for the Flap launch form, and for BscScan, DEX screeners and wallets. |
| `pfp-circle-check.png` | 1200×520 | QA sheet: circle crop with a 72% safe zone, and 128/64/48/32 px and feed-size renders. Not for upload. |
| `banner-x-1500x500.png` | 1500×500 | X (Twitter) header. Content stays clear of the bottom-left avatar overlap and of the ~60px top and bottom mobile crop. |
| `preview-x-profile.png` | 1500×760 | QA mock of the X header with the avatar overlaid and the crop lines drawn. Not for upload. |
| `banner-flap-1200x400.png` | 1200×400 | Wide token-page banner (Flap and other token pages). |
| `banner-1920x1080.png` | 1920×1080 | Generic 16:9 hero for Telegram, announcement posts, the website hero and stream overlays. |

All important PFP content sits inside the centre circle, so circular crops on X and Telegram lose
only the outer tick ring.

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
