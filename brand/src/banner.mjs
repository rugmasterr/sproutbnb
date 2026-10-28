// Banner page templates (HTML + inline SVG). Sizes are exact CSS px; screenshots run at DPR 1.
import { C, markSVG } from './mark.mjs';
import { grove } from './grove.mjs';

export function fontCSS(fontsBase) {
  const g = `${fontsBase}/geist/dist/fonts`;
  return `
  @font-face { font-family: 'Geist'; src: url('${g}/geist-sans/Geist-Variable.woff2') format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'Geist Mono'; src: url('${g}/geist-mono/GeistMono-Variable.woff2') format('woff2'); font-weight: 100 900; }`;
}

const base = (W, H) => `
  :root { --ink:${C.ink}; --ink-2:${C.ink2}; --ink-3:${C.ink3}; --ink-4:${C.ink4};
    --line: rgba(255,255,255,.08); --line-2: rgba(255,255,255,.14);
    --fg:#F5F3EC; --fg-2: rgba(245,243,236,.68); --fg-3: rgba(245,243,236,.44);
    --bnb:${C.bnb}; --bnb-hi:${C.bnbHi}; --bnb-deep:${C.bnbDeep}; --bam:${C.bam}; --bam-hi:${C.bamHi};
    --sans: 'Geist', 'Noto Sans SC', sans-serif; --mono: 'Geist Mono', 'Noto Sans SC', monospace; --cjk: 'Noto Sans SC', 'Geist', sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--ink); }
  body { font-family: var(--sans); color: var(--fg); -webkit-font-smoothing: antialiased; position: relative; }
  .layer { position: absolute; inset: 0; }
  .grid { background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: var(--cell) var(--cell); background-position: -1px -1px; opacity: .55;
    -webkit-mask-image: radial-gradient(ellipse 70% 90% at 62% 40%, #000 20%, transparent 75%); }
  .grain { opacity: .07; mix-blend-mode: overlay; }
  .kicker { display: inline-flex; align-items: center; gap: .7em; font-family: var(--mono); font-weight: 500; letter-spacing: .1em; text-transform: uppercase; color: var(--bnb); }
  .pill { border: 1px solid rgba(240,185,11,.32); background: rgba(240,185,11,.07); border-radius: 999px; padding: .55em 1em .5em .9em; }
  .dot { width: .62em; height: .62em; border-radius: 50%; background: var(--bam); box-shadow: 0 0 0 .3em rgba(46,189,107,.18), 0 0 1em rgba(46,189,107,.9); }
  .sep { color: var(--fg-3); }
  .h1 { display: flex; align-items: center; font-weight: 600; letter-spacing: -.045em; line-height: .9; }
  .h1 .zh { font-family: var(--cjk); font-weight: 700; letter-spacing: .02em; color: var(--bnb);
    background: linear-gradient(180deg, var(--bnb-hi), var(--bnb) 55%, var(--bnb-deep)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 .35em rgba(240,185,11,.35)); }
  .tag { font-weight: 500; letter-spacing: -.03em; line-height: 1.08; }
  .tag .soft { color: var(--fg-3); }
  .tag .soft b { font-weight: 500; color: var(--bnb-hi); }
  .zhtag { font-family: var(--cjk); font-weight: 500; color: var(--fg-2); letter-spacing: .04em; }
  .zhtag em { font-style: normal; color: var(--bam-hi); }
  .monoline { font-family: var(--mono); letter-spacing: .06em; color: var(--fg-3); display: flex; align-items: center; gap: .8em; }
  .monoline .u { color: var(--fg-2); }
  .glass { border: 1px solid var(--line-2); background: linear-gradient(160deg, rgba(26,30,35,.78), rgba(13,15,18,.72));
    backdrop-filter: blur(16px); box-shadow: 0 20px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06); }
  .stages { display: flex; flex-direction: column; gap: 12px; }
  .st-row { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 10px; }
  .st-k { font-family: var(--mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--fg-3); }
  .st-n { font-family: var(--mono); font-size: 11px; color: var(--fg-3); }
  .st-name { font-size: 17px; font-weight: 500; letter-spacing: -.01em; }
  .st-name span { font-family: var(--cjk); font-weight: 500; color: var(--fg-2); margin-left: 6px; font-size: 15px; }
  .bar { height: 6px; border-radius: 99px; background: rgba(255,255,255,.06); display: flex; gap: 3px; overflow: hidden; }
  .bar i { flex: 1; border-radius: 99px; background: rgba(255,255,255,.07); }
  .bar i.on { background: linear-gradient(90deg, var(--bam), var(--bnb)); box-shadow: 0 0 8px rgba(240,185,11,.5); }
  .steps { display: grid; grid-template-columns: repeat(3, 220px); gap: 0; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: rgba(13,15,18,.55); }
  .step { padding: 16px 20px 18px; border-left: 1px solid var(--line); } .step:first-child { border-left: 0; }
  .ticker { position: absolute; left: 0; right: 0; display: flex; align-items: center; gap: 28px; white-space: nowrap;
    font-family: var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--fg-2);
    border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: rgba(13,15,18,.7); }
  .ticker .y { color: var(--bnb); } .ticker .g { color: var(--bam-hi); } .ticker .zh { font-family: var(--cjk); letter-spacing: .06em; }
  .ticker .d { width: 6px; height: 6px; transform: rotate(45deg); background: var(--bnb); opacity: .6; flex: none; }
  .seal { display: inline-grid; place-items: center; font-family: var(--cjk); font-weight: 700; color: #fff; background: ${C.seal};
    border-radius: 6px; line-height: 1; box-shadow: inset 0 0 0 2px rgba(255,255,255,.18); }
`;

const grainSVG = (W, H) => `<svg class="layer grain" width="${W}" height="${H}"><filter id="gn"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#gn)"/></svg>`;

const glows = (spots) => spots.map(([x, y, r, col, a]) =>
  `<div class="layer" style="background: radial-gradient(circle ${r}px at ${x}px ${y}px, ${col}${a}, transparent 70%)"></div>`).join('');

function stageCard(width) {
  const bar = (on) => `<div class="bar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>`;
  return `<div class="glass" style="width:${width}px;border-radius:20px;padding:18px 18px 16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span class="kicker" style="font-size:11px;color:var(--fg-2)"><span class="dot" style="font-size:11px"></span>Growth stages</span>
      <span class="kicker pill" style="font-size:10px;padding:.35em .8em;color:var(--bam-hi);border-color:rgba(46,189,107,.35);background:rgba(46,189,107,.08)">Live</span>
    </div>
    <div class="stages">
      <div><div class="st-row"><div class="st-name">Seed<span>笋芽</span></div><div class="st-n">01</div></div>${bar(10)}</div>
      <div><div class="st-row"><div class="st-name">Shoot<span>春笋</span></div><div class="st-n">02</div></div>${bar(7)}</div>
      <div><div class="st-row"><div class="st-name">Grove<span>竹林</span></div><div class="st-n">03</div></div>${bar(0)}</div>
    </div>
  </div>`;
}

function tickerItems() {
  const it = [
    '<span class="y">$SPROUT</span>', 'Zcash-native launchpad', '<span class="g">Paid in ZEC</span>',
    'Seed <span class="zh">笋芽</span>', 'Shoot <span class="zh">春笋</span>', 'Grove <span class="zh">竹林</span>',
    'Built on Flap', '<span class="y">BNB Chain</span>', 'sproutbnb.cash',
  ];
  return [...it, ...it].map((s) => `<span>${s}</span><span class="d"></span>`).join('');
}

/** kind: 'x' (1500x500), 'hero' (1920x1080), 'flap' (1200x400) */
export function bannerHTML(kind, fontsBase, cjkCssHrefs) {
  const cfg = {
    x: { W: 1500, H: 500, cell: 50, pad: 130, top: 74, h1: 106, mark: 96, tag: 37, zh: 22, mono: 13.5, kick: 12, tight: true,
      grove: { x0: 900, x1: 1430, minTop: 30, scale: 1, count: 11, seed: 11 } },
    flap: { W: 1200, H: 400, cell: 40, pad: 72, top: 64, h1: 96, mark: 86, tag: 33, zh: 19, mono: 12, kick: 11,
      grove: { x0: 760, x1: 1170, minTop: 22, scale: 0.85, count: 10, seed: 5 } },
    hero: { W: 1920, H: 1080, cell: 64, pad: 150, top: 250, h1: 196, mark: 172, tag: 64, zh: 34, mono: 17, kick: 15,
      grove: { x0: 1180, x1: 1840, minTop: 90, scale: 1.55, count: 12, seed: 3 } },
  }[kind];
  const { W, H } = cfg;
  const gv = grove({ W, H: kind === 'hero' ? H - 96 : H, ...cfg.grove, id: 'g' + kind });
  const grove2 = `<svg class="layer" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${gv.defs}
      <linearGradient id="fade${kind}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".12" stop-color="#fff"/></linearGradient>
      <mask id="m${kind}"><rect x="${cfg.grove.x0 - 120}" y="0" width="${W}" height="${H}" fill="url(#fade${kind})"/></mask></defs>
      <g mask="url(#m${kind})">${gv.markup}</g></svg>`;

  const spots = kind === 'hero'
    ? [[1500, 420, 700, 'rgba(240,185,11,', '.20)'], [1700, 900, 520, 'rgba(46,189,107,', '.16)'], [420, 520, 620, 'rgba(240,185,11,', '.07)']]
    : kind === 'x'
      ? [[1180, 160, 460, 'rgba(240,185,11,', '.20)'], [1400, 480, 360, 'rgba(46,189,107,', '.16)'], [360, 220, 420, 'rgba(240,185,11,', '.06)']]
      : [[960, 130, 380, 'rgba(240,185,11,', '.20)'], [1120, 400, 300, 'rgba(46,189,107,', '.16)'], [260, 180, 340, 'rgba(240,185,11,', '.06)']];

  const textBlock = `
    <div style="position:absolute;left:${cfg.pad}px;top:${cfg.top}px">
      <div class="kicker pill" style="font-size:${cfg.kick}px"><span class="dot"></span>$SPROUT <span class="sep">/</span> Launching on BNB Chain</div>
      <div class="h1" style="font-size:${cfg.h1}px;margin-top:${cfg.h1 * 0.2}px;gap:${cfg.h1 * 0.14}px">
        <span style="display:inline-flex;filter:drop-shadow(0 0 ${cfg.mark * 0.18}px rgba(240,185,11,.45));margin-right:-${cfg.mark * 0.06}px">${markSVG('bm' + kind, cfg.mark)}</span>
        <span>Sprout</span><span class="zh" style="font-size:.86em">春笋</span>
      </div>
      <div class="tag" style="font-size:${cfg.tag}px;margin-top:${cfg.h1 * 0.2}px">Plant on BNB. <span class="soft">Harvest in <b>ZEC</b>.</span></div>
      <div class="zhtag" style="font-size:${cfg.zh}px;margin-top:${cfg.tag * 0.3}px">在 BNB 链种下，用 <em>ZEC</em> 收获</div>
      <div class="monoline" style="font-size:${cfg.mono}px;margin-top:${cfg.tag * (cfg.tight ? 0.45 : 0.62)}px">
        <span>Zcash-native launchpad</span><span class="sep">·</span><span>Built on Flap</span><span class="sep">·</span><span class="u">sproutbnb.cash</span>
      </div>
    </div>`;

  const extra = kind === 'hero'
    ? `<div style="position:absolute;right:140px;top:150px">${stageCard(330)}</div>
       <div class="steps" style="position:absolute;left:${cfg.pad}px;top:812px">
         ${[['01', 'Launch', '发射', 10], ['02', 'Trade', '交易', 6], ['03', 'Cash out', '提现', 3]].map(([n, en, zh, on]) => `
         <div class="step"><div class="st-row"><span class="st-k">${n}</span><span class="st-k" style="color:var(--bam-hi)">ZEC</span></div>
           <div class="st-name" style="font-size:22px;margin:8px 0 12px">${en}<span style="font-size:18px">${zh}</span></div>
           <div class="bar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div></div>`).join('')}
       </div>
       <div class="ticker" style="bottom:0;height:96px;padding-left:40px;font-size:17px">${tickerItems()}</div>
       <div style="position:absolute;left:${cfg.pad}px;top:120px;display:flex;align-items:center;gap:14px" class="kicker"><span class="seal" style="width:34px;height:34px;font-size:15px">笋</span><span style="color:var(--fg-3)">Zcash-native launchpad &amp; terminal</span></div>`
    : kind === 'x'
      ? `<div class="kicker" style="position:absolute;right:70px;top:44px;font-size:11px;color:var(--fg-3)">BNB · ZEC · FLAP</div>`
      : `<div class="kicker" style="position:absolute;right:40px;top:30px;font-size:10px;color:var(--fg-3)">$SPROUT / ZEC</div>`;

  return `<!doctype html><html><head><meta charset="utf-8">
  ${cjkCssHrefs.map((h) => `<link rel="stylesheet" href="${h}">`).join('')}
  <style>${fontCSS(fontsBase)}${base(W, H)} body { --cell: ${cfg.cell}px; }</style></head>
  <body>
    <div class="layer grid"></div>
    ${glows(spots)}
    ${grove2}
    <div class="layer" style="background:linear-gradient(90deg, var(--ink) 0%, rgba(7,8,10,.85) 30%, rgba(7,8,10,0) 55%)"></div>
    ${textBlock}
    ${extra}
    ${grainSVG(W, H)}
    <div class="layer" style="box-shadow: inset 0 0 ${W * 0.08}px rgba(0,0,0,.6)"></div>
  </body></html>`;
}
