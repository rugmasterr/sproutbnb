// Sprout launch asset renderer.
//   cd brand && npm install && npm run render
// Writes PNG/SVG files into ../public/brand/launch/. Requires Google Chrome (CHROME env var overrides the path).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { pfpSVG } from './src/mark.mjs';
import { bannerHTML, fontCSS } from './src/banner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../public/brand/launch');
const nm = path.join(here, 'node_modules');
const fontsBase = pathToFileURL(nm).href;
const cjk = [400, 500, 700].map((w) => pathToFileURL(path.join(nm, '@fontsource/noto-sans-sc', `${w}.css`)).href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-brand-'));
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
fs.mkdirSync(out, { recursive: true });

const pfp = pfpSVG();
fs.writeFileSync(path.join(out, 'pfp.svg'), pfp);

const svgPage = (size) => `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:#07080a}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${pfp}</body></html>`;

const pages = [
  { name: 'pfp-1000.png', W: 1000, H: 1000, html: svgPage(1000) },
  { name: 'pfp-400.png', W: 400, H: 400, html: svgPage(400) },
  { name: 'token-logo-512.png', W: 512, H: 512, html: svgPage(512) },
  { name: 'banner-x-1500x500.png', W: 1500, H: 500, html: bannerHTML('x', fontsBase, cjk) },
  { name: 'banner-flap-1200x400.png', W: 1200, H: 400, html: bannerHTML('flap', fontsBase, cjk) },
  { name: 'banner-1920x1080.png', W: 1920, H: 1080, html: bannerHTML('hero', fontsBase, cjk) },
];

// QA sheets built from the exported PNGs (circle crop + small sizes; X profile mock with avatar overlap).
const img = (n) => pathToFileURL(path.join(out, n)).href;
const qa = [
  { name: 'pfp-circle-check.png', W: 1200, H: 520, html: `<!doctype html><html><head><meta charset="utf-8"><style>${fontCSS(fontsBase)}
    body{margin:0;width:1200px;height:520px;background:#0d0f12;color:#F5F3EC;font-family:'Geist Mono';display:flex;align-items:center;justify-content:center;gap:56px}
    figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:14px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(245,243,236,.55)}
    .c{border-radius:50%;display:block} .wrap{position:relative} .ring{position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 1px rgba(240,185,11,.6)}
    .safe{position:absolute;left:50%;top:50%;width:72%;height:72%;transform:translate(-50%,-50%);border-radius:50%;border:1px dashed rgba(124,227,160,.7)}
    .row{display:flex;gap:28px;align-items:center} .x{background:#000;padding:18px;border-radius:14px;display:flex;gap:12px;align-items:center}
    .x b{font-family:'Geist';font-size:15px;color:#fff;text-transform:none;letter-spacing:0} .x s{text-decoration:none;color:#71767b;text-transform:none;letter-spacing:0;font-family:'Geist';font-size:14px}</style></head><body>
    <figure><div class="wrap"><img class="c" src="${img('pfp-1000.png')}" width="400" height="400"><div class="ring"></div><div class="safe"></div></div>circle crop 400 · dashed = 72% safe zone</figure>
    <div style="display:flex;flex-direction:column;gap:34px">
      <figure><div class="row"><img class="c" src="${img('pfp-400.png')}" width="128" height="128"><img class="c" src="${img('pfp-400.png')}" width="64" height="64"><img class="c" src="${img('pfp-400.png')}" width="48" height="48"><img class="c" src="${img('pfp-400.png')}" width="32" height="32"><img src="${img('token-logo-512.png')}" width="48" height="48" style="border-radius:10px"></div>128 · 64 · 48 · 32 · token 48</figure>
      <figure><div class="x"><img class="c" src="${img('pfp-400.png')}" width="40" height="40"><div><b>Sprout 春笋</b> <s>@sproutbnb · 1m</s><div style="font-family:'Geist';font-size:14px;color:#e7e9ea;text-transform:none;letter-spacing:0;margin-top:2px">$SPROUT is live on BNB Chain.</div></div></div>feed size (40px)</figure>
    </div></body></html>`, needs: ['pfp-1000.png', 'pfp-400.png'] },
  { name: 'preview-x-profile.png', W: 1500, H: 760, html: `<!doctype html><html><head><meta charset="utf-8">${cjk.map((h) => `<link rel="stylesheet" href="${h}">`).join('')}<style>${fontCSS(fontsBase)}
    body{margin:0;width:1500px;height:760px;background:#000;font-family:'Geist','Noto Sans SC';color:#e7e9ea;position:relative}
    .b{display:block;width:1500px;height:500px} .av{position:absolute;left:44px;top:376px;width:268px;height:268px;border-radius:50%;border:8px solid #000;overflow:hidden}
    .av img{width:100%;height:100%} .n{position:absolute;left:52px;top:660px;font-size:34px;font-weight:700} .h{position:absolute;left:52px;top:706px;font-size:22px;color:#71767b}
    .crop{position:absolute;left:0;right:0;border-top:1px dashed rgba(255,80,80,.7)} .lbl{position:absolute;right:12px;font:12px 'Geist Mono';color:rgba(255,120,120,.9)}</style></head><body>
    <img class="b" src="${img('banner-x-1500x500.png')}"><div class="av"><img src="${img('pfp-400.png')}"></div>
    <div class="crop" style="top:60px"></div><div class="crop" style="top:440px"></div><div class="lbl" style="top:64px">mobile crop ~60px</div><div class="lbl" style="top:420px">mobile crop ~60px</div>
    <div class="n">Sprout 春笋</div><div class="h">@sproutbnb</div></body></html>`, needs: ['banner-x-1500x500.png', 'pfp-400.png'] },
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--allow-file-access-from-files', '--font-render-hinting=none', '--force-color-profile=srgb', '--hide-scrollbars'],
});
try {
  for (const p of [...pages, ...qa]) {
    const file = path.join(tmp, p.name.replace(/\.png$/, '.html'));
    fs.writeFileSync(file, p.html);
    const page = await browser.newPage();
    await page.setViewport({ width: p.W, height: p.H, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' });
    // Force every glyph's font subset to load (Noto Sans SC is split by unicode-range), then wait.
    await page.evaluate(async () => {
      const text = document.body.innerText + ' 春笋竹林笋芽';
      const loads = [];
      for (const w of [400, 500, 600, 700]) {
        for (const fam of ['Geist', 'Geist Mono', 'Noto Sans SC']) loads.push(document.fonts.load(`${w} 32px "${fam}"`, text));
      }
      await Promise.all(loads);
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const missing = await page.evaluate(() => ['Geist', 'Geist Mono', 'Noto Sans SC'].filter((f) => !document.fonts.check(`500 20px "${f}"`, f === 'Noto Sans SC' ? '春笋' : 'Sprout')));
    if (missing.length && !p.name.startsWith('pfp') && !p.name.startsWith('token')) console.warn(`  ! ${p.name}: fonts not ready: ${missing.join(', ')}`);
    await page.screenshot({ path: path.join(out, p.name), clip: { x: 0, y: 0, width: p.W, height: p.H } });
    await page.close();
    console.log(`  ✓ ${p.name} (${p.W}x${p.H})`);
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
