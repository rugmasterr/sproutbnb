// Minimal pixel-art bamboo row (SVG markup, crispEdges), deterministic per seed.
// Each stalk is two cells wide (light left column, BNB-yellow right column) with one-cell node gaps,
// a one-cell tip, and the odd two-step leaf. A back row sits behind at low opacity. Flat colour only.
import { C } from './mark.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * @param {object} o
 * @param {number} o.H canvas height (stalks stand on the bottom edge)
 * @param {number} o.x0 left edge of the row  @param {number} o.x1 right edge
 * @param {number} o.cell pixel cell size (integer px)
 * @param {number} o.minTop smallest y a stalk top may reach
 */
export function pixelGrove({ H, x0, x1, cell, minTop, seed = 7, count = 9 }) {
  const r = rng(seed);
  const rows = Math.floor(H / cell);
  const topRow = Math.ceil(minTop / cell);
  const span = Math.floor((x1 - x0) / cell);
  const front = [], back = [];

  const stalk = (col, top, seg, leafy) => {
    const hi = [], base = [];
    const cellAt = (cx, cy, light) => (light ? hi : base).push([cx, cy]);
    // tip: single light cell above the stalk
    cellAt(col, top, true);
    let y = top + 1, k = 0;
    while (y < rows) {
      for (let i = 0; i < seg && y < rows; i++, y++) { cellAt(col, y, true); cellAt(col + 1, y, false); }
      if (y >= rows) break;
      // node gap row (empty) + optional leaf from the node
      // one leaf per leafy stalk, from its first node: a two-cell step angled up and out to the right
      if (leafy && k === 0) {
        for (const [dx, dy] of [[2, 1], [3, 1], [3, 2], [4, 2], [5, 3]]) cellAt(col + dx, y - dy, false);
      }
      y++; k++;
    }
    return { hi, base };
  };

  // back row: offset half a stalk spacing, shorter
  const gap = span / count;
  for (let i = 0; i < count - 1; i++) {
    const col = Math.floor(x0 / cell + gap * (i + 0.5) + (r() - 0.5) * gap * 0.2);
    const reach = 0.3 + r() * 0.3;
    const top = Math.round(rows - (rows - topRow) * reach);
    back.push(stalk(col, top, 4 + Math.floor(r() * 2), false));
  }
  for (let i = 0; i < count; i++) {
    const col = Math.floor(x0 / cell + gap * i + (r() - 0.5) * gap * 0.15);
    const reach = 0.55 + r() * 0.45;
    const top = Math.round(rows - (rows - topRow) * reach);
    front.push(stalk(col, top, 6 + Math.floor(r() * 3), i % 2 === 1));
  }

  const toPath = (cells) => cells.map(([cx, cy]) => `M${cx * cell} ${cy * cell}h${cell}v${cell}h-${cell}z`).join('');
  const all = (arr, key) => toPath(arr.flatMap((s) => s[key]));
  return `<g shape-rendering="crispEdges">
    <g opacity=".18"><path d="${all(back, 'hi')}${all(back, 'base')}" fill="${C.bnb}"/></g>
    <path d="${all(front, 'hi')}" fill="${C.bnbHi}"/>
    <path d="${all(front, 'base')}" fill="${C.bnb}"/>
  </g>`;
}
