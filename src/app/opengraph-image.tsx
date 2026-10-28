import { ImageResponse } from 'next/og';
import { loadGoogleFont, MARK_DATA_URI } from '@/lib/og';

export const runtime = 'edge';
export const alt = 'Sprout 春笋 — the Zcash-native launchpad & terminal on BNB Chain';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const EN_TITLE = 'Every market. One Zcash wallet. Now on BNB Chain.';
const ZH_TITLE = '一个 Zcash 钱包，畅玩 BNB 链每一个市场。';
const TAG = 'Launch, trade, cash out — in ZEC.';
const FOOT = 'Zcash-native launchpad & terminal · built on Flap';
const SEAL = '春笋';

export default async function OpengraphImage() {
  const mark = MARK_DATA_URI;
  const [display, ui, cjk] = await Promise.all([
    loadGoogleFont('Fraunces', 600, `Sprout${EN_TITLE}${TAG}`),
    loadGoogleFont('Inter', 500, `${FOOT}ZEC`),
    loadGoogleFont('Noto Serif SC', 700, ZH_TITLE + SEAL),
  ]);
  const fonts = [
    ...(display ? [{ name: 'Display', data: display, weight: 600 as const, style: 'normal' as const }] : []),
    ...(ui ? [{ name: 'UI', data: ui, weight: 500 as const, style: 'normal' as const }] : []),
    ...(cjk ? [{ name: 'CJK', data: cjk, weight: 700 as const, style: 'normal' as const }] : []),
  ];
  const ff = `${display ? 'Display, ' : ''}${cjk ? 'CJK, ' : ''}serif`;
  const uf = `${ui ? 'UI, ' : ''}sans-serif`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#0B1510',
          backgroundImage: 'radial-gradient(circle at 85% 0%, rgba(31,107,67,0.55), rgba(11,21,16,0) 60%)',
          color: '#F4EEDC',
          fontFamily: ff,
          padding: 72,
          position: 'relative',
        }}
      >
        {[930, 1000, 1080].map((x, i) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: x,
              top: 0,
              bottom: 0,
              width: 22 - i * 4,
              background: 'linear-gradient(90deg, rgba(47,143,87,0.35), rgba(124,195,110,0.18))',
              display: 'flex',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 1030,
            top: 150,
            width: 64,
            height: 64,
            borderRadius: 64,
            background: '#F4B728',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#141613',
            fontSize: 30,
            fontFamily: uf,
          }}
        >
          ZEC
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <img src={mark} width={84} height={84} alt="" />
            <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: -1 }}>Sprout</div>
            {cjk ? (
              <div style={{ marginLeft: 8, background: '#C8402F', color: '#F4EEDC', fontSize: 30, padding: '8px 10px', borderRadius: 6, display: 'flex' }}>
                {SEAL}
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
            <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>{EN_TITLE}</div>
            {cjk ? <div style={{ fontSize: 38, color: '#A8DC7A' }}>{ZH_TITLE}</div> : null}
            <div style={{ fontSize: 32, color: '#F4B728' }}>{TAG}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: '#B0B8A4', fontFamily: uf }}>{FOOT}</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
