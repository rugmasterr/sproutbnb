// Sprout bamboo-shoot mark — refined "premium" redraw of public/brand/sprout-mark.svg.
// Same geometry (three stacked sheaths, pointed tip, leaf, ground arc) re-coloured for the
// dark BNB theme: BNB-yellow sheaths, bamboo-green leaf, node-ring highlights, faceted shading.
// All ids are prefixed so several marks can live in one document.

export const C = {
  ink: '#07080a', ink2: '#0d0f12', ink3: '#13161a', ink4: '#1a1e23',
  bnb: '#F0B90B', bnbHi: '#FCD535', bnbDeep: '#C99400',
  bam: '#2EBD6B', bamHi: '#7CE3A0', bamDeep: '#1F6B43',
  seal: '#E5484D',
};

const L1 = 'M15 55 Q32 47 49 55 L43.5 37 Q32 32.5 20.5 37 Z';
const L2 = 'M20.5 38.5 Q32 33.5 43.5 38.5 L38.5 23 Q32 19.8 25.5 23 Z';
const L3 = 'M25.6 24.6 Q32 21.6 38.4 24.6 L32 8.5 Z';
const LEAF = 'M32.6 12.4 Q41 3.5 51 7.2 Q44.5 14.6 33.6 13.6 Z';

/** Inner SVG markup (in a 0 0 64 64 coordinate space). */
export function markBody(p = 'm', { ground = true } = {}) {
  return `
  <defs>
    <linearGradient id="${p}g1" x1="0" y1="55" x2="0" y2="35" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A97C00"/><stop offset="1" stop-color="#DDA407"/>
    </linearGradient>
    <linearGradient id="${p}g2" x1="0" y1="38" x2="0" y2="21" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#E3A909"/><stop offset="1" stop-color="#F6C42A"/>
    </linearGradient>
    <linearGradient id="${p}g3" x1="0" y1="25" x2="0" y2="8" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FCD535"/><stop offset="1" stop-color="#FFF1B0"/>
    </linearGradient>
    <linearGradient id="${p}lf" x1="33" y1="13" x2="51" y2="6" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1F8A4F"/><stop offset=".55" stop-color="#2EBD6B"/><stop offset="1" stop-color="#9BF0BA"/>
    </linearGradient>
    <linearGradient id="${p}gr" x1="10" y1="0" x2="54" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2EBD6B" stop-opacity="0"/><stop offset=".5" stop-color="#2EBD6B"/><stop offset="1" stop-color="#2EBD6B" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${p}rh"><rect x="32" y="0" width="32" height="64"/></clipPath>
    <clipPath id="${p}c1"><path d="${L1}"/></clipPath>
    <clipPath id="${p}c2"><path d="${L2}"/></clipPath>
  </defs>
  ${ground ? `<path d="M9 56.2 Q32 50.4 55 56.2" stroke="url(#${p}gr)" stroke-width="1.6" stroke-linecap="round" fill="none"/>` : ''}
  <path d="${L1}" fill="url(#${p}g1)"/>
  <path d="${L2}" transform="translate(0 1.6)" fill="#000" fill-opacity=".38" clip-path="url(#${p}c1)"/>
  <path d="${L2}" fill="url(#${p}g2)"/>
  <path d="${L3}" transform="translate(0 1.5)" fill="#000" fill-opacity=".32" clip-path="url(#${p}c2)"/>
  <path d="${L3}" fill="url(#${p}g3)"/>
  <g clip-path="url(#${p}rh)" fill="#000">
    <path d="${L1}" fill-opacity=".2"/><path d="${L2}" fill-opacity=".17"/><path d="${L3}" fill-opacity=".13"/>
  </g>
  <g fill="none" stroke-linecap="round">
    <path d="M16.6 54.2 Q32 47 47.4 54.2" stroke="#FFE68A" stroke-opacity=".55" stroke-width=".7"/>
    <path d="M22 37.9 Q32 33.6 42 37.9" stroke="#FFF0B0" stroke-opacity=".6" stroke-width=".65"/>
    <path d="M26.9 24.2 Q32 21.9 37.1 24.2" stroke="#FFFBE6" stroke-opacity=".7" stroke-width=".6"/>
    <path d="M32 47.6 L32 38.4 M32 35.2 L32 25.4 M32 22.4 L32 13" stroke="#3A2A00" stroke-opacity=".35" stroke-width="1.1"/>
  </g>
  <path d="${LEAF}" fill="url(#${p}lf)"/>
  <path d="M34 13.1 Q42 9.4 49.6 7.4" stroke="#D9FFE6" stroke-opacity=".55" stroke-width=".55" fill="none" stroke-linecap="round"/>
  `;
}

export function markSVG(p = 'm', size = 64, opts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" fill="none">${markBody(p, opts)}</svg>`;
}

function hexPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Full PFP / token logo, 1000x1000. Everything important sits inside r=360 of centre (circle-safe). */
export function pfpSVG() {
  const W = 1000, cx = 500, cy = 500;
  // node ring ticks (bamboo-node ring)
  let ticks = '';
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2 - Math.PI / 2;
    const major = i % 6 === 0;
    const r1 = 432, r2 = major ? 456 : 444;
    const x1 = cx + r1 * Math.cos(a), y1 = cy + r1 * Math.sin(a);
    const x2 = cx + r2 * Math.cos(a), y2 = cy + r2 * Math.sin(a);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${major ? C.bnb : '#ffffff'}" stroke-opacity="${major ? 0.55 : 0.14}" stroke-width="${major ? 3 : 2}" stroke-linecap="round"/>`;
  }
  // segmented "stalk" ring: 8 arcs with node gaps
  let segs = '';
  const R = 404, n = 8, gap = 0.06;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + gap, a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - gap;
    const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
    segs += `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${R} ${R} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke="url(#ringG)" stroke-width="5" stroke-linecap="round" fill="none"/>`;
    // node dot at each gap
    const an = (i / n) * Math.PI * 2 - Math.PI / 2;
    segs += `<circle cx="${(cx + R * Math.cos(an)).toFixed(1)}" cy="${(cy + R * Math.sin(an)).toFixed(1)}" r="4.5" fill="${C.bnbHi}" fill-opacity=".8"/>`;
  }
  // hex grid
  let hex = '';
  const hr = 34, hw = Math.sqrt(3) * hr;
  for (let row = -1; row < 22; row++) {
    for (let col = -1; col < 18; col++) {
      const x = col * hw + (row % 2 ? hw / 2 : 0), y = row * hr * 1.5;
      hex += `<path d="${hexPath(x, y, hr - 3)}"/>`;
    }
  }
  const s = 11.4, tx = cx - 32 * s, ty = cy + 4 - 31 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}">
  <title>Sprout $SPROUT</title>
  <defs>
    <radialGradient id="bgG" cx="50%" cy="52%" r="70%">
      <stop offset="0" stop-color="#1b1606"/><stop offset=".45" stop-color="#0c0d0d"/><stop offset="1" stop-color="${C.ink}"/>
    </radialGradient>
    <radialGradient id="glowG" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${C.bnb}" stop-opacity=".42"/><stop offset=".45" stop-color="${C.bnb}" stop-opacity=".12"/><stop offset="1" stop-color="${C.bnb}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="greenG" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${C.bam}" stop-opacity=".22"/><stop offset="1" stop-color="${C.bam}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="hexM" cx="50%" cy="50%" r="50%">
      <stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity=".15"/>
    </radialGradient>
    <mask id="hexMask"><rect width="${W}" height="${W}" fill="url(#hexM)"/></mask>
    <linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.bnbHi}" stop-opacity=".55"/><stop offset=".5" stop-color="${C.bnb}" stop-opacity=".22"/><stop offset="1" stop-color="${C.bam}" stop-opacity=".45"/>
    </linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/>
    </filter>
    <radialGradient id="vig" cx="50%" cy="50%" r="72%">
      <stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${W}" fill="url(#bgG)"/>
  <g mask="url(#hexMask)" fill="none" stroke="${C.bnb}" stroke-opacity=".12" stroke-width="1.5">${hex}</g>
  <circle cx="${cx}" cy="${cy}" r="462" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.5"/>
  ${ticks}
  <circle cx="${cx}" cy="${cy + 40}" r="420" fill="url(#glowG)"/>
  <circle cx="${cx + 120}" cy="${cy - 170}" r="210" fill="url(#greenG)"/>
  ${segs}
  <circle cx="${cx}" cy="${cy}" r="376" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.5" stroke-dasharray="2 10"/>
  <g transform="translate(${tx} ${ty}) scale(${s})" filter="url(#blur)" opacity=".6">${markBody('pb', { ground: false })}</g>
  <g transform="translate(${tx} ${ty}) scale(${s})">${markBody('pm')}</g>
  <rect width="${W}" height="${W}" filter="url(#grain)" opacity=".05"/>
  <rect width="${W}" height="${W}" fill="url(#vig)"/>
</svg>`;
}
