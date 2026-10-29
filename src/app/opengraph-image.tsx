import { ImageResponse } from 'next/og';
import { loadGoogleFont, MARK_DATA_URI, OG } from '@/lib/og';

export const runtime = 'edge';
export const alt = 'Sprout 春笋 — Zcash-native launchpad on BNB Chain';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BRAND = 'Sprout';
const SEAL = '春笋';
const L1 = 'Zcash-native launchpad';
const L2 = 'on BNB Chain.';
const ZH = '原生 Zcash 发射台 · 现已登陆 BNB 链';
const KICK = 'LIVE ON BNB CHAIN · BUILT ON FLAP';
const CHIPS = ['LAUNCH', 'TRADE', 'CASH OUT'];
const ZEC = 'ZEC';

/** Pixel bamboo row (matches the brand banners): 2-cell stalks, light left column, 1-cell node gaps. */
const CELL = 12;
const STALKS: { col: number; top: number; seg: number; leaf?: boolean }[] = [
  { col: 74, top: 18, seg: 7 },
  { col: 80, top: 9, seg: 6, leaf: true },
  { col: 86, top: 24, seg: 7 },
  { col: 92, top: 5, seg: 8, leaf: true },
];
const ROWS = Math.ceil(630 / CELL);

function PixelStalk({ col, top, seg, leaf }: { col: number; top: number; seg: number; leaf?: boolean }) {
  const cells: { x: number; y: number; c: string }[] = [{ x: col, y: top, c: OG.accentHi }];
  let y = top + 1;
  let k = 0;
  while (y < ROWS) {
    for (let i = 0; i < seg && y < ROWS; i++, y++) {
      cells.push({ x: col, y, c: OG.accentHi }, { x: col + 1, y, c: OG.accent });
    }
    if (leaf && k === 0) {
      for (const [dx, dy] of [[2, 1], [3, 1], [3, 2], [4, 2], [5, 3]]) cells.push({ x: col + dx, y: y - dy, c: OG.accent });
    }
    y++;
    k++;
  }
  return (
    <>
      {cells.map((p) => (
        <div key={`${p.x}-${p.y}`} style={{ position: 'absolute', left: p.x * CELL, top: p.y * CELL, width: CELL, height: CELL, background: p.c, display: 'flex' }} />
      ))}
    </>
  );
}

export default async function OpengraphImage() {
  const latin = `${BRAND}${L1}${L2}`;
  const mono = `${KICK}${CHIPS.join('')}${ZEC}BNB·`;
  const [geist, geistMono, cjk] = await Promise.all([
    loadGoogleFont('Geist', 600, latin),
    loadGoogleFont('Geist Mono', 500, mono),
    loadGoogleFont('Noto Sans SC', 700, ZH + SEAL + 'ZcashBNB·'),
  ]);
  const fonts = [
    ...(geist ? [{ name: 'Geist', data: geist, weight: 600 as const, style: 'normal' as const }] : []),
    ...(geistMono ? [{ name: 'GeistMono', data: geistMono, weight: 500 as const, style: 'normal' as const }] : []),
    ...(cjk ? [{ name: 'CJK', data: cjk, weight: 700 as const, style: 'normal' as const }] : []),
  ];
  const sans = `${geist ? 'Geist, ' : ''}${cjk ? 'CJK, ' : ''}sans-serif`;
  const monoF = `${geistMono ? 'GeistMono, ' : ''}monospace`;
  const cjkF = `${cjk ? 'CJK, ' : ''}sans-serif`;

  const chip = (label: string, hi = false) => (
    <div
      key={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 18px',
        border: `1.5px solid ${hi ? OG.accent : OG.line2}`,
        color: hi ? OG.accent : OG.muted,
        fontFamily: monoF,
        fontSize: 20,
        letterSpacing: 2,
      }}
    >
      {label}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden', backgroundColor: OG.black, color: OG.fg, fontFamily: sans }}>
        {STALKS.map((s) => (
          <PixelStalk key={s.col} {...s} />
        ))}

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', padding: '64px 72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <img src={MARK_DATA_URI} width={72} height={72} alt="" />
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 600, letterSpacing: -2.4 }}>{BRAND}</div>
            {cjk ? <div style={{ display: 'flex', fontFamily: cjkF, fontSize: 44, color: OG.accent }}>{SEAL}</div> : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 820 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: OG.accent, fontFamily: monoF, fontSize: 19, letterSpacing: 3.2 }}>
              <div style={{ display: 'flex', width: 12, height: 12, background: OG.accent }} />
              {KICK}
            </div>
            <div style={{ display: 'flex', marginTop: 22, fontSize: 72, fontWeight: 600, lineHeight: 0.98, letterSpacing: -3.6 }}>{L1}</div>
            <div style={{ display: 'flex', fontSize: 72, fontWeight: 600, lineHeight: 1.04, letterSpacing: -3.6, color: OG.muted }}>{L2}</div>
            {cjk ? <div style={{ display: 'flex', marginTop: 20, fontFamily: cjkF, fontSize: 32, color: OG.muted, letterSpacing: 1 }}>{ZH}</div> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {chip(ZEC, true)}
            {CHIPS.map((c) => chip(c))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
