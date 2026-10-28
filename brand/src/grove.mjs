// Procedural grove of glowing segmented bamboo stalks (SVG markup), deterministic per seed.
import { C } from './mark.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * @param {object} o
 * @param {number} o.W canvas width  @param {number} o.H canvas height
 * @param {number} o.x0 left edge of grove  @param {number} o.x1 right edge
 * @param {number} o.minTop smallest y a stalk top may reach  @param {number} o.scale size multiplier
 */
export function grove({ W, H, x0, x1, minTop, scale = 1, seed = 7, count = 10, id = 'gv' }) {
  const r = rng(seed);
  const stalks = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const depth = r() < 0.4 ? 0 : 1; // 0 = back, 1 = front
    const x = x0 + (x1 - x0) * t + (r() - 0.5) * ((x1 - x0) / count) * 0.8;
    // taller towards the right
    const reach = 0.35 + 0.65 * Math.pow(t, 0.8) * (0.75 + r() * 0.35);
    const top = H - (H - minTop) * Math.min(1, reach);
    const w = (depth ? 15 + r() * 9 : 8 + r() * 5) * scale;
    stalks.push({ x, top, w, depth, lean: (r() - 0.5) * 0.03, leafy: r() });
  }
  stalks.sort((a, b) => a.depth - b.depth);

  let defs = `
    <linearGradient id="${id}sF" gradientUnits="userSpaceOnUse" x1="0" y1="${H}" x2="0" y2="${minTop}">
      <stop offset="0" stop-color="${C.bamDeep}" stop-opacity=".2"/>
      <stop offset=".35" stop-color="${C.bam}" stop-opacity=".85"/>
      <stop offset=".78" stop-color="#9BD94C"/>
      <stop offset="1" stop-color="${C.bnbHi}"/>
    </linearGradient>
    <linearGradient id="${id}sB" gradientUnits="userSpaceOnUse" x1="0" y1="${H}" x2="0" y2="${minTop}">
      <stop offset="0" stop-color="${C.bamDeep}" stop-opacity="0"/>
      <stop offset=".5" stop-color="${C.bam}" stop-opacity=".45"/>
      <stop offset="1" stop-color="${C.bnb}" stop-opacity=".75"/>
    </linearGradient>
    <linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/>
    </linearGradient>
    <linearGradient id="${id}lf" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.bam}"/><stop offset="1" stop-color="${C.bamHi}" stop-opacity=".9"/>
    </linearGradient>
    <filter id="${id}glow" x="-100%" y="-20%" width="300%" height="140%"><feGaussianBlur stdDeviation="${10 * scale}"/></filter>`;

  let body = '', glow = '';
  for (const s of stalks) {
    const seg = s.w * (3.4 + s.leafy * 0.8);
    const gap = Math.max(2, s.w * 0.14);
    const fill = s.depth ? `url(#${id}sF)` : `url(#${id}sB)`;
    let g = '';
    let y = H + seg * 0.3;
    let k = 0;
    const nodes = [];
    while (y - seg > s.top) {
      const yt = y - seg;
      g += `<rect x="${(-s.w / 2).toFixed(1)}" y="${(yt + gap / 2).toFixed(1)}" width="${s.w.toFixed(1)}" height="${(seg - gap).toFixed(1)}" rx="${(s.w * 0.32).toFixed(1)}" fill="${fill}"/>`;
      nodes.push(yt);
      y = yt; k++;
      if (k > 40) break;
    }
    // tip: tapering shoot
    const tipH = s.w * 2.4;
    g += `<path d="M${(-s.w / 2).toFixed(1)} ${(y - gap / 2).toFixed(1)} Q0 ${(y - tipH * 1.15).toFixed(1)} ${(s.w / 2).toFixed(1)} ${(y - gap / 2).toFixed(1)} Z" fill="${s.depth ? C.bnbHi : C.bnb}" fill-opacity="${s.depth ? 1 : 0.7}"/>`;
    // shading overlay for cylindrical feel
    if (s.depth) {
      g += `<rect x="${(-s.w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${s.w.toFixed(1)}" height="${(H - y + seg).toFixed(1)}" fill="url(#${id}sh)"/>`;
    }
    // node rings
    for (const ny of nodes) {
      const op = s.depth ? Math.max(0.15, 1 - (ny - s.top) / (H - s.top) * 0.9) : 0.16;
      g += `<rect x="${(-s.w / 2 - 2.5 * scale).toFixed(1)}" y="${(ny - 1.2 * scale).toFixed(1)}" width="${(s.w + 5 * scale).toFixed(1)}" height="${(2.4 * scale).toFixed(1)}" rx="${(1.2 * scale).toFixed(1)}" fill="${C.bnbHi}" fill-opacity="${op.toFixed(2)}"/>`;
    }
    // leaves at a couple of upper nodes
    if (s.depth && nodes.length > 2) {
      const picks = [nodes[nodes.length - 2], nodes[Math.max(0, nodes.length - 4)]];
      picks.forEach((ny, j) => {
        const dir = (j + (s.leafy > 0.5 ? 1 : 0)) % 2 ? 1 : -1;
        const L = s.w * (3.2 + s.leafy * 1.6), Wd = s.w * 0.85;
        g += `<path transform="translate(${(dir * s.w * 0.4).toFixed(1)} ${ny.toFixed(1)}) rotate(${dir > 0 ? -28 : 208}) " d="M0 0 Q${(L * 0.45).toFixed(1)} ${(-Wd).toFixed(1)} ${L.toFixed(1)} 0 Q${(L * 0.45).toFixed(1)} ${(Wd * 0.6).toFixed(1)} 0 0 Z" fill="url(#${id}lf)" fill-opacity=".9"/>`;
      });
    }
    const tr = `translate(${s.x.toFixed(1)} 0) skewX(${(s.lean * 57).toFixed(2)})`;
    body += `<g transform="${tr}" opacity="${s.depth ? 1 : 0.55}">${g}</g>`;
    if (s.depth) glow += `<g transform="${tr}">${g}</g>`;
  }
  return { defs, markup: `<g filter="url(#${id}glow)" opacity=".55">${glow}</g>${body}` };
}
