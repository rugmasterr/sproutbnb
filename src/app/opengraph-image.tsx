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

/** One neon bamboo stalk: glowing outline, node rings, optional tip. */
function Stalk({ left, top, width, color, nodes, glow }: { left: number; top: number; width: number; color: string; nodes: number[]; glow: number }) {
  return (
    <div style={{ position: 'absolute', left, top, bottom: -20, width, display: 'flex' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width,
          borderRadius: width / 3,
          border: `2px solid ${color}`,
          background: `linear-gradient(90deg, rgba(0,0,0,0), ${color}33, rgba(0,0,0,0))`,
          boxShadow: `0 0 ${glow}px ${color}88`,
          display: 'flex',
        }}
      />
      {nodes.map((y) => (
        <div
          key={y}
          style={{
            position: 'absolute',
            left: -6,
            top: y,
            width: width + 12,
            height: 8,
            borderRadius: 4,
            background: color,
            boxShadow: `0 0 ${glow}px ${color}`,
            display: 'flex',
          }}
        />
      ))}
    </div>
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
        gap: 10,
        padding: '10px 18px',
        borderRadius: 999,
        border: `1.5px solid ${hi ? 'rgba(244,183,40,0.55)' : OG.line2}`,
        background: hi ? 'rgba(244,183,40,0.12)' : 'rgba(255,255,255,0.03)',
        color: hi ? '#F4B728' : OG.muted,
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
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: OG.ink,
          color: OG.fg,
          fontFamily: sans,
        }}
      >
        {/* hairline grid */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.045) 1px, rgba(255,255,255,0) 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, rgba(255,255,255,0) 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* glows */}
        <div
          style={{
            position: 'absolute',
            left: 620,
            top: -260,
            width: 760,
            height: 760,
            borderRadius: 760,
            display: 'flex',
            background: 'radial-gradient(circle, rgba(240,185,11,0.30), rgba(240,185,11,0) 62%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -260,
            top: 300,
            width: 640,
            height: 640,
            borderRadius: 640,
            display: 'flex',
            background: 'radial-gradient(circle, rgba(46,189,107,0.16), rgba(46,189,107,0) 62%)',
          }}
        />
        {/* fade the grid to the left so the copy stays crisp */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', background: 'linear-gradient(90deg, rgba(7,8,10,0.92) 0%, rgba(7,8,10,0.55) 52%, rgba(7,8,10,0) 80%)' }} />

        {/* neon bamboo */}
        <Stalk left={968} top={70} width={34} color={OG.accent} nodes={[110, 250, 390]} glow={26} />
        <Stalk left={1062} top={170} width={24} color={OG.bamboo} nodes={[90, 220, 340]} glow={20} />
        <Stalk left={892} top={260} width={18} color={OG.bamboo} nodes={[80, 200]} glow={16} />
        <div
          style={{
            position: 'absolute',
            left: 1002,
            top: 128,
            width: 118,
            height: 34,
            borderRadius: '0 60px 0 60px',
            border: `2px solid ${OG.bambooHi}`,
            background: 'rgba(124,227,160,0.12)',
            boxShadow: '0 0 18px rgba(124,227,160,0.5)',
            transform: 'rotate(-22deg)',
            display: 'flex',
          }}
        />


        {/* copy */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', padding: '64px 72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <img src={MARK_DATA_URI} width={76} height={76} alt="" />
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 600, letterSpacing: -2.4 }}>{BRAND}</div>
            {cjk ? (
              <div
                style={{
                  display: 'flex',
                  marginLeft: 6,
                  background: OG.seal,
                  color: OG.fg,
                  fontFamily: cjkF,
                  fontSize: 26,
                  padding: '6px 10px',
                  borderRadius: 6,
                  transform: 'rotate(-4deg)',
                  boxShadow: '0 0 24px rgba(214,62,50,0.55)',
                }}
              >
                {SEAL}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 860 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: OG.accent, fontFamily: monoF, fontSize: 19, letterSpacing: 3.2 }}>
              <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 12, background: OG.bamboo, boxShadow: `0 0 14px ${OG.bamboo}` }} />
              {KICK}
            </div>
            <div style={{ display: 'flex', marginTop: 22, fontSize: 72, fontWeight: 600, lineHeight: 0.98, letterSpacing: -3.6 }}>{L1}</div>
            <div style={{ display: 'flex', fontSize: 72, fontWeight: 600, lineHeight: 1.04, letterSpacing: -3.6, color: OG.muted }}>{L2}</div>
            {cjk ? <div style={{ display: 'flex', marginTop: 20, fontFamily: cjkF, fontSize: 32, color: OG.bambooHi, letterSpacing: 1 }}>{ZH}</div> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {chip(ZEC, true)}
            {CHIPS.map((c) => chip(c))}
          </div>
        </div>
        {/* bottom hairline glow */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, display: 'flex', background: 'linear-gradient(90deg, rgba(240,185,11,0), #F0B90B, #2EBD6B, rgba(46,189,107,0))' }} />
      </div>
    ),
    { ...size, fonts },
  );
}
