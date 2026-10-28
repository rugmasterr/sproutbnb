// Helpers for next/og image routes. Edge-safe (no node:fs): the mark is inlined, mirroring the dark-theme
// `Mark tone="bnb"` in components/brand.tsx (green sheaths, BNB-yellow tip) — the layered shoot of
// public/brand/sprout-mark.svg. (The nodejs build of @vercel/og in Next 14 breaks on Windows paths.)

export const OG = {
  ink: '#07080A',
  ink2: '#0D0F12',
  ink3: '#13161A',
  fg: '#F2F0E8',
  muted: 'rgba(242,240,232,0.66)',
  faint: 'rgba(242,240,232,0.45)',
  line: 'rgba(255,255,255,0.10)',
  line2: 'rgba(255,255,255,0.17)',
  accent: '#F0B90B',
  accentHi: '#FCD535',
  bamboo: '#2EBD6B',
  bambooHi: '#7CE3A0',
  seal: '#D63E32',
} as const;

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
<path d="M10 56 Q32 50 54 56" stroke="#3A3F46" stroke-width="3" stroke-linecap="round"/>
<path d="M15 55 Q32 47 49 55 L43.5 37 Q32 32.5 20.5 37 Z" fill="#1F6B43"/>
<path d="M20.5 38.5 Q32 33.5 43.5 38.5 L38.5 23 Q32 19.8 25.5 23 Z" fill="#2EBD6B"/>
<path d="M25.6 24.6 Q32 21.6 38.4 24.6 L32 8.5 Z" fill="#F0B90B"/>
<path d="M32.6 12.4 Q41 3.5 51 7.2 Q44.5 14.6 33.6 13.6 Z" fill="#FCD535"/>
<path d="M32 47.5 L32 38.2 M32 35 L32 25.5" stroke="#07080A" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>
</svg>`;

export const MARK_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(MARK_SVG)}`;

/** Fetches a Google font subset (TTF) for exactly the glyphs we render. Returns null offline. */
export async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).text();
    const src = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!src) return null;
    const res = await fetch(src[1], { signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}
