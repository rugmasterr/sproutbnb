// Banner page templates (HTML + inline SVG). Sizes are exact CSS px; screenshots run at DPR 1.
// Clean style: pure black field, the yellow pixel mark, Geist / Geist Mono / Noto Sans SC type,
// yellow as the only accent, and a minimal pixel bamboo row. No gradients, glows, grain or fake stats.
import { C, markSVG } from './mark.mjs';
import { pixelGrove } from './grove.mjs';

export function fontCSS(fontsBase) {
  const g = `${fontsBase}/geist/dist/fonts`;
  return `
  @font-face { font-family: 'Geist'; src: url('${g}/geist-sans/Geist-Variable.woff2') format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'Geist Mono'; src: url('${g}/geist-mono/GeistMono-Variable.woff2') format('woff2'); font-weight: 100 900; }`;
}

const base = (W, H) => `
  :root { --bg:${C.black}; --line: rgba(255,255,255,.12);
    --fg:#F5F3EC; --fg-2: rgba(245,243,236,.66); --fg-3: rgba(245,243,236,.42);
    --bnb:${C.bnb}; --bnb-hi:${C.bnbHi};
    --sans: 'Geist', 'Noto Sans SC', sans-serif; --mono: 'Geist Mono', 'Noto Sans SC', monospace; --cjk: 'Noto Sans SC', 'Geist', sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); }
  body { font-family: var(--sans); color: var(--fg); -webkit-font-smoothing: antialiased; position: relative; }
  .layer { position: absolute; inset: 0; }
  .kicker { display: inline-flex; align-items: center; gap: .8em; font-family: var(--mono); font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: var(--bnb); }
  .px { width: .6em; height: .6em; background: var(--bnb); flex: none; }
  .sep { color: var(--fg-3); }
  .h1 { display: flex; align-items: center; font-weight: 600; letter-spacing: -.045em; line-height: .9; }
  .h1 .zh { font-family: var(--cjk); font-weight: 700; letter-spacing: .02em; color: var(--bnb); }
  .tag { font-weight: 500; letter-spacing: -.03em; line-height: 1.08; }
  .tag .soft { color: var(--fg-3); }
  .tag .soft b { font-weight: 500; color: var(--bnb); }
  .zhtag { font-family: var(--cjk); font-weight: 500; color: var(--fg-2); letter-spacing: .04em; }
  .zhtag em { font-style: normal; color: var(--bnb); }
  .monoline { font-family: var(--mono); letter-spacing: .06em; color: var(--fg-3); display: flex; align-items: center; gap: .8em; }
  .monoline .u { color: var(--fg); }
  .steps { display: grid; grid-template-columns: repeat(3, 230px); border: 1px solid var(--line); }
  .step { padding: 18px 22px 20px; border-left: 1px solid var(--line); } .step:first-child { border-left: 0; }
  .st-row { display: flex; justify-content: space-between; align-items: baseline; }
  .st-k { font-family: var(--mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--fg-3); }
  .st-name { font-size: 24px; font-weight: 500; letter-spacing: -.01em; margin-top: 10px; }
  .st-name span { font-family: var(--cjk); font-weight: 500; color: var(--fg-2); margin-left: 8px; font-size: 19px; }
  .ticker { position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 28px; white-space: nowrap;
    font-family: var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--fg-2); border-top: 1px solid var(--line); }
  .ticker .y { color: var(--bnb); } .ticker .zh { font-family: var(--cjk); letter-spacing: .06em; }
  .ticker .d { width: 6px; height: 6px; background: var(--bnb); flex: none; }
`;

function tickerItems() {
  const it = [
    '<span class="y">$SPROUT</span>', 'Zcash-native launchpad', '<span class="y">Paid in ZEC</span>',
    'Seed <span class="zh">笋芽</span>', 'Shoot <span class="zh">春笋</span>', 'Grove <span class="zh">竹林</span>',
    'Built on Flap', '<span class="y">BNB Chain</span>', 'sproutbnb.cash',
  ];
  return [...it, ...it].map((s) => `<span>${s}</span><span class="d"></span>`).join('');
}

/** kind: 'x' (1500x500), 'hero' (1920x1080), 'flap' (1200x400) */
export function bannerHTML(kind, fontsBase, cjkCssHrefs) {
  // mark sizes are multiples of 18 (the mark's square viewBox) so every pixel cell is whole px.
  const cfg = {
    x: { W: 1500, H: 500, pad: 130, top: 78, h1: 104, mark: 108, tag: 37, zh: 22, mono: 13.5, kick: 12, tight: true,
      grove: { x0: 940, x1: 1440, cell: 10, minTop: 90, count: 6, seed: 11 } },
    flap: { W: 1200, H: 400, pad: 72, top: 62, h1: 94, mark: 90, tag: 33, zh: 19, mono: 12, kick: 11,
      grove: { x0: 790, x1: 1160, cell: 8, minTop: 72, count: 5, seed: 5 } },
    hero: { W: 1920, H: 1080, pad: 150, top: 250, h1: 160, mark: 162, tag: 64, zh: 34, mono: 17, kick: 15,
      grove: { x0: 1290, x1: 1830, cell: 12, minTop: 110, count: 5, seed: 3 } },
  }[kind];
  const { W, H } = cfg;
  const gH = kind === 'hero' ? H - 96 : H;
  const grove = `<svg class="layer" width="${W}" height="${gH}" viewBox="0 0 ${W} ${gH}">${pixelGrove({ H: gH, ...cfg.grove })}</svg>`;

  const textBlock = `
    <div style="position:absolute;left:${cfg.pad}px;top:${cfg.top}px">
      <div class="kicker" style="font-size:${cfg.kick}px"><span class="px"></span>$SPROUT <span class="sep">/</span> Launching on BNB Chain</div>
      <div class="h1" style="font-size:${cfg.h1}px;margin-top:${Math.round(cfg.h1 * 0.2)}px;gap:${Math.round(cfg.h1 * 0.16)}px">
        <span style="display:inline-flex;margin-left:-${Math.round(cfg.mark * 0.06)}px">${markSVG(cfg.mark)}</span>
        <span>Sprout</span><span class="zh" style="font-size:.86em">春笋</span>
      </div>
      <div class="tag" style="font-size:${cfg.tag}px;margin-top:${Math.round(cfg.h1 * 0.2)}px">Plant on BNB. <span class="soft">Harvest in <b>ZEC</b>.</span></div>
      <div class="zhtag" style="font-size:${cfg.zh}px;margin-top:${Math.round(cfg.tag * 0.3)}px">在 BNB 链种下，用 <em>ZEC</em> 收获</div>
      <div class="monoline" style="font-size:${cfg.mono}px;margin-top:${Math.round(cfg.tag * (cfg.tight ? 0.45 : 0.62))}px">
        <span>Zcash-native launchpad</span><span class="sep">·</span><span>Built on Flap</span><span class="sep">·</span><span class="u">sproutbnb.cash</span>
      </div>
    </div>`;

  const extra = kind === 'hero'
    ? `<div class="steps" style="position:absolute;left:${cfg.pad}px;top:800px">
         ${[['01', 'Launch', '发射'], ['02', 'Trade', '交易'], ['03', 'Cash out', '提现']].map(([n, en, zh]) => `
         <div class="step"><div class="st-row"><span class="st-k">${n}</span><span class="st-k" style="color:var(--bnb)">ZEC</span></div>
           <div class="st-name">${en}<span>${zh}</span></div></div>`).join('')}
       </div>
       <div class="ticker" style="bottom:0;height:96px;padding-left:40px;font-size:17px">${tickerItems()}</div>
       <div class="kicker" style="position:absolute;left:${cfg.pad}px;top:130px;font-size:${cfg.kick}px;color:var(--fg-3)">Zcash-native launchpad &amp; terminal</div>`
    : kind === 'x'
      ? `<div class="kicker" style="position:absolute;right:70px;top:76px;font-size:11px;color:var(--fg-3)">BNB · ZEC · FLAP</div>`
      : `<div class="kicker" style="position:absolute;right:40px;top:30px;font-size:10px;color:var(--fg-3)">$SPROUT / ZEC</div>`;

  return `<!doctype html><html><head><meta charset="utf-8">
  ${cjkCssHrefs.map((h) => `<link rel="stylesheet" href="${h}">`).join('')}
  <style>${fontCSS(fontsBase)}${base(W, H)}</style></head>
  <body>
    ${grove}
    ${textBlock}
    ${extra}
  </body></html>`;
}
