# Sprout launch trailer (Remotion)

~47 s bilingual (EN / 简体中文) launch trailer for Sprout 春笋, the Zcash-native launchpad on BNB Chain.

```
npm install
npm run audio     # synthesizes public/sprout-score.wav (original, procedural; no samples)
node scripts/cjk-subsets.cjs   # re-run after editing Chinese copy in src/copy.json
npm run stills -- <outDir> hv 60,300,700   # preview stills (h = 1920x1080, v = 1080x1920)
npm run render    # -> ../public/trailer/sprout-trailer.mp4, sprout-trailer-vertical.mp4, poster.jpg
```

- Compositions: `SproutTrailer` (1920x1080@30), `SproutTrailerVertical` (1080x1920@30), still `SproutPoster`.
- All on-screen copy lives in `src/copy.json` (`|` = preferred line break in the vertical cut only).
- Logo paths are inlined from `public/brand/sprout-mark.svg` (`SproutMark` in `src/components.tsx`).
- Fonts come from `@remotion/google-fonts` (Fraunces, Inter, Noto Serif SC, Noto Sans SC). Rendering needs network access to fonts.gstatic.com.
- The launch card UI is labelled "Illustrative · 示意" and shows no real on-chain data.
- Env for render: `CRF_H` (default 23), `CRF_V` (default 24), `CONCURRENCY`.
