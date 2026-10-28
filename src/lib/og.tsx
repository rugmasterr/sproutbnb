// Helpers for next/og image routes. Edge-safe (no node:fs): the mark is inlined, mirroring
// public/brand/sprout-mark.svg. (The nodejs build of @vercel/og in Next 14 breaks on Windows paths.)

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
<path d="M10 56 Q32 50 54 56" stroke="#6B4F2A" stroke-width="3" stroke-linecap="round"/>
<path d="M15 55 Q32 47 49 55 L43.5 37 Q32 32.5 20.5 37 Z" fill="#1F6B43"/>
<path d="M20.5 38.5 Q32 33.5 43.5 38.5 L38.5 23 Q32 19.8 25.5 23 Z" fill="#2F8F57"/>
<path d="M25.6 24.6 Q32 21.6 38.4 24.6 L32 8.5 Z" fill="#7CC36E"/>
<path d="M32.6 12.4 Q41 3.5 51 7.2 Q44.5 14.6 33.6 13.6 Z" fill="#A8DC7A"/>
<path d="M32 47.5 L32 38.2 M32 35 L32 25.5" stroke="#F4EEDC" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>
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
