// Helpers for next/og image routes. Edge-safe (no node:fs): the pixel mark is inlined, mirroring the Mark
// component in components/brand.tsx and public/brand/sprout-mark.svg. (The nodejs build of @vercel/og in Next 14
// breaks on Windows paths.)

export const OG = {
  black: '#000000',
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

// Pixel bamboo shoot, 18x18 grid (source of truth: brand/src/mark.mjs GRID). Render at multiples of 18 px for whole-pixel cells.
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" shape-rendering="crispEdges">
<path d="M8 0h1v1h-1zM8 1h1v1h-1zM8 2h1v1h-1zM7 3h2v1h-2zM7 4h1v1h-1zM8 5h1v1h-1zM7 6h2v1h-2zM6 7h3v1h-3zM6 8h2v1h-2zM5 9h2v1h-2zM8 9h1v1h-1zM5 10h1v1h-1zM7 10h2v1h-2zM6 11h3v1h-3zM5 12h3v1h-3zM4 13h3v1h-3zM8 13h1v1h-1zM4 14h2v1h-2zM7 14h2v1h-2zM3 15h2v1h-2zM6 15h3v1h-3zM3 16h1v1h-1zM5 16h4v1h-4zM4 17h5v1h-5z" fill="#FCD535"/>
<path d="M9 0h1v1h-1zM9 1h1v1h-1zM9 2h1v1h-1zM9 3h2v1h-2zM10 4h1v1h-1zM9 5h1v1h-1zM9 6h2v1h-2zM9 7h3v1h-3zM10 8h2v1h-2zM9 9h1v1h-1zM11 9h2v1h-2zM9 10h2v1h-2zM12 10h1v1h-1zM9 11h3v1h-3zM10 12h3v1h-3zM9 13h1v1h-1zM11 13h3v1h-3zM9 14h2v1h-2zM12 14h2v1h-2zM9 15h3v1h-3zM13 15h2v1h-2zM9 16h4v1h-4zM14 16h1v1h-1zM9 17h5v1h-5z" fill="#F0B90B"/>
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
