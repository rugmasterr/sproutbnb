// Sprout 春笋 pixel mark: a bamboo shoot drawn on a 16x18 pixel grid.
// Three chevron node lines (one-cell gaps) split the shoot into overlapping sheaths below a slender tip.
// Two flat tones only: BNB yellow (#F0B90B) for the right half and a lighter #FCD535 for the left half.
// No gradients, no glow. Everything renders with shape-rendering="crispEdges" on whole-pixel cells.

export const C = {
  black: '#000000', ink: '#07080A',
  bnb: '#F0B90B', bnbHi: '#FCD535',
};

/** The mark. '.' = empty, 'H' = highlight (#FCD535), 'Y' = BNB yellow (#F0B90B). 16 cols x 18 rows. */
export const GRID = [
  '.......HY.......',
  '.......HY.......',
  '.......HY.......',
  '......HHYY......',
  '......H..Y......',
  '.......HY.......',
  '......HHYY......',
  '.....HHHYYY.....',
  '.....HH..YY.....',
  '....HH.HY.YY....',
  '....H.HHYY.Y....',
  '.....HHHYYY.....',
  '....HHH..YYY....',
  '...HHH.HY.YYY...',
  '...HH.HHYY.YY...',
  '..HH.HHHYYY.YY..',
  '..H.HHHHYYYY.Y..',
  '...HHHHHYYYYY...',
];
export const GW = GRID[0].length; // 16
export const GH = GRID.length; // 18

/** Path data for one tone ('H' | 'Y'), merging horizontal runs. Cell size and offset in px (integers). */
export function tonePath(ch, cell = 1, ox = 0, oy = 0) {
  let d = '';
  GRID.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== ch) { x++; continue; }
      let n = 1;
      while (row[x + n] === ch) n++;
      d += `M${ox + x * cell} ${oy + y * cell}h${n * cell}v${cell}h-${n * cell}z`;
      x += n;
    }
  });
  return d;
}

/** Mark paths on a cell grid: { hi, base } path strings. */
export function markPaths(cell = 1, ox = 0, oy = 0) {
  return { hi: tonePath('H', cell, ox, oy), base: tonePath('Y', cell, ox, oy) };
}

/** Transparent mark, viewBox in grid units padded to a square (18x18), for inline use on dark backgrounds. */
export function markSVG(size = 64, { mono = false } = {}) {
  const { hi, base } = markPaths(1, (GH - GW) / 2, 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GH} ${GH}" width="${size}" height="${size}" shape-rendering="crispEdges"><path d="${hi}" fill="${mono ? C.bnb : C.bnbHi}"/><path d="${base}" fill="${C.bnb}"/></svg>`;
}

/**
 * Square PFP / token logo at an exact pixel size: pure black field, mark centred on whole-pixel cells.
 * Cell = round(size * 0.034) -> 1000px: 34px cells (544x612 mark). The mark's far corners sit within
 * ~35% of the size from centre, so circular crops (X, Telegram) never touch it.
 */
export function pfpSVG(size = 1000) {
  const cell = Math.max(1, Math.round(size * 0.034));
  const ox = Math.round((size - GW * cell) / 2), oy = Math.round((size - GH * cell) / 2);
  const { hi, base } = markPaths(cell, ox, oy);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <title>Sprout $SPROUT</title>
  <rect width="${size}" height="${size}" fill="${C.black}"/>
  <path d="${hi}" fill="${C.bnbHi}"/>
  <path d="${base}" fill="${C.bnb}"/>
</svg>`;
}
