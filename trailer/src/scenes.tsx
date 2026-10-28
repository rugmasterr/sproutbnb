import React from 'react';
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import copy from './copy.json';
import { C, FONT } from './theme';
import { Bi, BiSmall, Card, Coin, Reveal, Seal, SproutMark, StaticShoot, ZecChip, clamp, useLayout } from './components';

const Center: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...style }}>{children}</AbsoluteFill>
);

const ease = (frame: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(frame, [a, b], [from, to], { ...clamp, easing: Easing.inOut(Easing.cubic) });

/* 1 ─ Rain ─────────────────────────────────────────────────────────── */
export const SceneRain: React.FC = () => {
  const frame = useCurrentFrame();
  const { V, width, height } = useLayout();
  const glow = interpolate(frame, [90, 150], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Center style={{ padding: V ? 80 : 120 }}>
        <Bi en={copy.rain.en} zh={copy.rain.zh} size={V ? 92 : 104} zhScale={0.8} delay={14} zhDelay={16} maxWidth={V ? 900 : 1500} />
        <div style={{ height: V ? 60 : 48 }} />
        <Bi en={copy.rain2.en} zh={copy.rain2.zh} size={V ? 40 : 44} delay={58} weight={400} color="rgba(244,238,220,0.82)" zhColor="rgba(244,238,220,0.6)" />
      </Center>
      {/* a crack of gold light in the soil, foreshadowing the shoot */}
      <div
        style={{
          position: 'absolute',
          left: width / 2 - 420,
          top: height * (V ? 0.86 : 0.84) - 80,
          width: 840,
          height: 160,
          borderRadius: '50%',
          background: `radial-gradient(ellipse, rgba(244,183,40,0.55) 0%, rgba(124,195,110,0.12) 40%, rgba(0,0,0,0) 70%)`,
          opacity: glow,
        }}
      />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <path
          d={`M ${width * 0.12} ${height * (V ? 0.86 : 0.84)} Q ${width / 2} ${height * (V ? 0.835 : 0.8)} ${width * 0.88} ${height * (V ? 0.86 : 0.84)}`}
          stroke={C.soil}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          opacity={0.25 + glow * 0.5}
        />
      </svg>
    </AbsoluteFill>
  );
};

/* 2 ─ Grow + wordmark ──────────────────────────────────────────────── */
export const Wordmark: React.FC<{ size: number; delay?: number }> = ({ size, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seal = spring({ frame: frame - delay - 14, fps, config: { damping: 9, mass: 0.6 } });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.22 }}>
      <Reveal delay={delay} y={30}>
        <div style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: size, lineHeight: 1, color: C.paper, letterSpacing: '-0.02em' }}>Sprout</div>
      </Reveal>
      <div style={{ transform: `scale(${1.6 - 0.6 * seal})`, opacity: Math.min(1, seal * 1.5) }}>
        <Seal size={size * 0.74} />
      </div>
    </div>
  );
};

export const SceneGrow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { V } = useLayout();
  const lift = spring({ frame: frame - 50, fps, config: { damping: 18 } });
  const markSize = V ? 400 : 330;
  return (
    <Center style={{ padding: V ? 70 : 100 }}>
      <div style={{ transform: `translateY(${(1 - lift) * (V ? 380 : 290)}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <SproutMark size={markSize * (1.25 - 0.25 * lift)} delay={14} speed={0.95} glow={0.5 + 0.5 * lift} />
        <div style={{ height: V ? 40 : 26 }} />
        <div style={{ opacity: lift }}>
          <Wordmark size={V ? 180 : 170} delay={52} />
        </div>
        <div style={{ height: V ? 56 : 40 }} />
        <Bi en={copy.tagline1.en} zh={copy.tagline1.zh} size={V ? 54 : 56} delay={78} maxWidth={V ? 900 : 1600} />
      </div>
    </Center>
  );
};

/* 3 ─ One Zcash wallet ─────────────────────────────────────────────── */
const WalletCard: React.FC<{ glow: number }> = ({ glow }) => (
  <Card gold style={{ width: 460, padding: '30px 34px', boxShadow: `0 30px 80px rgba(0,0,0,0.45), 0 0 ${60 * glow}px rgba(244,183,40,${0.35 * glow})` }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <ZecChip size={26} />
      <div style={{ fontFamily: FONT.ui, fontSize: 20, color: 'rgba(244,238,220,0.5)', letterSpacing: '0.12em' }}>ZCASH</div>
    </div>
    <div style={{ height: 30 }} />
    <div style={{ fontFamily: FONT.display, fontSize: 40, fontWeight: 600, color: C.paper, lineHeight: 1.1 }}>{copy.walletLabel.en}</div>
    <div style={{ fontFamily: FONT.zhSerif, fontSize: 32, fontWeight: 600, color: 'rgba(244,238,220,0.75)', marginTop: 8, letterSpacing: '0.06em' }}>
      {copy.walletLabel.zh}
    </div>
    <div style={{ height: 24 }} />
    <div style={{ fontFamily: FONT.ui, fontSize: 22, color: 'rgba(244,238,220,0.45)', letterSpacing: '0.18em' }}>t1 •••• •••• ••••</div>
  </Card>
);

const bez = (t: number, p0: number[], p1: number[], p2: number[]) => [
  (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
  (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
];

export const SceneWallet: React.FC = () => {
  const frame = useCurrentFrame();
  const { V, width, height } = useLayout();
  const wallet = V ? [width / 2, height * 0.42] : [width * 0.27, height * 0.6];
  const shoot = V ? [width / 2, height * 0.8] : [width * 0.73, height * 0.62];
  const p0 = V ? [wallet[0] + 120, wallet[1] - 40] : [wallet[0], wallet[1] - 150];
  const p2 = V ? [shoot[0], shoot[1] - 250] : [shoot[0], shoot[1] - 260];
  const p1 = V ? [width * 0.95, (p0[1] + p2[1]) / 2 - 40] : [width / 2, height * 0.12];
  const t = ease(frame, 34, 80);
  const drop = ease(frame, 80, 92);
  let pos = bez(t, p0, p1, p2);
  if (frame >= 80) pos = [p2[0], p2[1] + drop * 130];
  const coinScale = interpolate(frame, [26, 36], [0, 1], clamp) * (1 - drop * 0.65);
  const coinOpacity = interpolate(frame, [26, 32, 88, 94], [0, 1, 1, 0], clamp);
  const impact = interpolate(frame, [90, 100, 150], [0, 1, 0.6], clamp);
  const pathPts = new Array(41).fill(0).map((_, i) => bez(i / 40, p0, p1, p2));
  const pathD = 'M ' + pathPts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ');
  const mid = bez(0.5, p0, p1, p2);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: V ? 150 : 80, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 70px' }}>
        <Bi en={copy.wallet.en} zh={copy.wallet.zh} size={V ? 76 : 80} delay={4} maxWidth={V ? 920 : 1700} />
      </div>
      {/* trail */}
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <path d={pathD} stroke={C.gold} strokeOpacity={0.45} strokeWidth={3} strokeDasharray="2 14" strokeLinecap="round" fill="none" pathLength={1000} style={{ strokeDashoffset: 0 }} clipPath="url(#trailClip)" />
        <defs>
          <clipPath id="trailClip">
            <rect x={0} y={0} width={V ? width : Math.max(0, pos[0] + 10)} height={V ? Math.max(0, pos[1] + 10) : height} />
          </clipPath>
        </defs>
      </svg>
      {/* bridge chip */}
      <div
        style={{
          position: 'absolute',
          left: V ? 0 : mid[0] - 330,
          width: V ? width : 660,
          top: V ? height * 0.6 : mid[1] + 70,
          display: 'flex',
          justifyContent: 'center',
          opacity: interpolate(frame, [44, 58], [0, 1], clamp),
        }}
      >
        <div style={{ padding: '14px 26px', borderRadius: 999, background: 'rgba(14,42,27,0.8)', border: '1.5px solid rgba(244,183,40,0.35)' }}>
          <BiSmall en={copy.bridgeChip.en} zh={copy.bridgeChip.zh} size={24} stacked align="center" />
        </div>
      </div>
      {/* wallet */}
      <div style={{ position: 'absolute', left: wallet[0] - 230, top: wallet[1] - 150 }}>
        <Reveal delay={8} y={40}>
          <WalletCard glow={interpolate(frame, [20, 34, 50], [0, 1, 0.2], clamp)} />
        </Reveal>
      </div>
      {/* shoot (Sprout account) */}
      <div style={{ position: 'absolute', left: shoot[0] - 160, top: shoot[1] - 230, width: 320, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <SproutMark size={V ? 280 : 320} delay={6} glow={impact} />
        <div style={{ opacity: interpolate(frame, [96, 110], [0, 1], clamp), marginTop: 10, whiteSpace: 'nowrap' }}>
          <BiSmall en={copy.accountChip.en} zh={copy.accountChip.zh} size={24} stacked align="center" color={C.leaf200} />
        </div>
      </div>
      {/* coin */}
      <div style={{ position: 'absolute', left: pos[0] - 60, top: pos[1] - 60, transform: `scale(${coinScale})`, opacity: coinOpacity }}>
        <Coin size={120} spin={frame * 0.14} />
      </div>
    </AbsoluteFill>
  );
};

/* 4 ─ Launch card ──────────────────────────────────────────────────── */
const Field: React.FC<{ en: string; zh: string; children: React.ReactNode; delay: number }> = ({ en, zh, children, delay }) => (
  <Reveal delay={delay} y={14}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 24px',
        borderRadius: 18,
        background: 'rgba(11,21,16,0.55)',
        border: '1px solid rgba(244,238,220,0.1)',
        marginTop: 14,
      }}
    >
      <BiSmall en={en} zh={zh} size={24} color="rgba(244,238,220,0.7)" />
      <div style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: 30, color: C.paper, display: 'flex', alignItems: 'center', gap: 12 }}>{children}</div>
    </div>
  </Reveal>
);

export const SceneLaunch: React.FC = () => {
  const frame = useCurrentFrame();
  const { V } = useLayout();
  const name = 'Spring Rain';
  const typed = name.slice(0, Math.floor(interpolate(frame, [24, 46], [0, name.length], clamp)));
  const caret = frame >= 24 && frame < 50 && Math.floor(frame / 6) % 2 === 0;
  const press = interpolate(frame, [86, 90, 96], [1, 0.95, 1], clamp);
  const prog = interpolate(frame, [90, 105], [0, 1], clamp);
  const done = frame >= 105;
  const pop = spring({ frame: frame - 105, fps: 30, config: { damping: 10 } });
  return (
    <Center style={{ padding: V ? 70 : 60, gap: V ? 70 : 34 }}>
      <Bi en={copy.launch.en} zh={copy.launch.zh} size={V ? 64 : 62} delay={2} maxWidth={V ? 920 : 1700} />
      <Reveal delay={10} y={50}>
        <Card style={{ width: V ? 900 : 860, padding: '32px 36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
              <div style={{ fontFamily: FONT.display, fontSize: 44, fontWeight: 600, color: C.paper }}>{copy.cardTitle.en}</div>
              <div style={{ fontFamily: FONT.zhSerif, fontSize: 32, fontWeight: 600, color: 'rgba(244,238,220,0.7)' }}>{copy.cardTitle.zh}</div>
            </div>
            <div
              style={{
                fontFamily: FONT.ui,
                fontSize: 20,
                color: 'rgba(244,238,220,0.6)',
                border: '1px dashed rgba(244,238,220,0.35)',
                borderRadius: 999,
                padding: '6px 16px',
                letterSpacing: '0.05em',
              }}
            >
              {copy.illustrative.en} · <span style={{ fontFamily: FONT.zhSans }}>{copy.illustrative.zh}</span>
            </div>
          </div>
          <Field en={copy.cardName.en} zh={copy.cardName.zh} delay={18}>
            <span>
              {typed}
              <span style={{ opacity: caret ? 1 : 0, color: C.gold }}>|</span>
            </span>
          </Field>
          <Field en={copy.cardTicker.en} zh={copy.cardTicker.zh} delay={30}>
            <span style={{ opacity: interpolate(frame, [46, 52], [0, 1], clamp) }}>$RAIN</span>
          </Field>
          <Field en={copy.cardFirstBuy.en} zh={copy.cardFirstBuy.zh} delay={42}>
            <span style={{ opacity: interpolate(frame, [54, 60], [0, 1], clamp), display: 'flex', alignItems: 'center', gap: 12 }}>
              0.50 <ZecChip size={24} />
            </span>
          </Field>
          <Field en={copy.cardPayout.en} zh={copy.cardPayout.zh} delay={54}>
            <span style={{ opacity: interpolate(frame, [64, 70], [0, 1], clamp), color: C.gold }}>
              {copy.optHolders.en} · <span style={{ fontFamily: FONT.zhSans }}>{copy.optHolders.zh}</span> (ZEC)
            </span>
          </Field>
          <div style={{ height: 22 }} />
          <Reveal delay={66} y={10}>
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                height: 84,
                borderRadius: 20,
                background: done ? C.bamboo500 : C.gold,
                transform: `scale(${press})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: done ? '0 0 50px rgba(124,195,110,0.4)' : '0 0 40px rgba(244,183,40,0.3)',
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, background: 'rgba(255,255,255,0.25)' }} />
              {done ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, transform: `scale(${0.8 + 0.2 * pop})` }}>
                  <svg width={40} height={40} viewBox="0 0 24 24">
                    <path d="M4 12.5 L10 18 L20 6" stroke={C.paper} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <BiSmall en={copy.cardDone.en} zh={copy.cardDone.zh} size={32} weight={600} />
                </div>
              ) : (
                <BiSmall en={copy.cardButton.en} zh={copy.cardButton.zh} size={34} color={C.ink} weight={600} />
              )}
            </div>
          </Reveal>
        </Card>
      </Reveal>
    </Center>
  );
};

/* 5 ─ Fee split ────────────────────────────────────────────────────── */
const FEES = [
  { pct: '0.50%', w: 25, color: C.bamboo500, en: copy.feeGrove.en, zh: copy.feeGrove.zh },
  { pct: '0.50%', w: 25, color: '#8C6A3A', en: copy.feeRoot.en, zh: copy.feeRoot.zh },
  { pct: '0.20%', w: 10, color: C.leaf200, en: copy.feeOps.en, zh: copy.feeOps.zh },
  { pct: '0.80%', w: 40, color: C.gold, en: copy.feeDeployer.en, zh: copy.feeDeployer.zh },
];
const OPTIONS = [copy.optMe, copy.optWallet, copy.optHolders, copy.optZcash, copy.optZF];

export const SceneFees: React.FC = () => {
  const frame = useCurrentFrame();
  const { V } = useLayout();
  const BW = V ? 920 : 1440;
  const grow = ease(frame, 18, 48);
  const split = ease(frame, 48, 64);
  const gap = split * 10;
  const rowDelay = (i: number) => 58 + i * 16;
  const hiDeployer = interpolate(frame, [130, 145], [0, 1], clamp);
  return (
    <Center style={{ padding: V ? 70 : 50 }}>
      <Bi en={copy.feeTitle.en} zh={copy.feeTitle.zh} size={V ? 70 : 60} delay={2} />
      <div style={{ height: V ? 60 : 34 }} />
      {/* the stalk: 2.00% split into bamboo segments */}
      <div style={{ width: BW, height: 64, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: BW * grow, overflow: 'hidden', display: 'flex', gap }}>
          {FEES.map((f, i) => (
            <div
              key={i}
              style={{
                flex: `0 0 ${(BW - gap * 3) * (f.w / 100)}px`,
                height: 64,
                borderRadius: 14,
                background: f.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT.ui,
                fontWeight: 600,
                fontSize: 26,
                color: i === 1 ? C.paper : C.ink,
                boxShadow: i === 3 ? `0 0 ${40 * hiDeployer}px rgba(244,183,40,${0.6 * hiDeployer})` : 'none',
              }}
            >
              <span style={{ opacity: split }}>{f.pct}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT.ui,
            fontWeight: 700,
            fontSize: 34,
            color: C.ink,
            opacity: grow * (1 - split),
          }}
        >
          2.00%
        </div>
      </div>
      <div style={{ height: V ? 50 : 28 }} />
      <div style={{ width: BW, display: 'flex', flexDirection: 'column', gap: V ? 30 : 16 }}>
        {FEES.map((f, i) => (
          <Reveal key={i} delay={rowDelay(i)} y={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 26, opacity: i < 3 ? 1 - hiDeployer * 0.45 : 1 }}>
              <div style={{ width: 12, height: V ? 84 : 66, borderRadius: 6, background: f.color, flex: '0 0 auto' }} />
              <div style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: V ? 60 : 50, color: f.color === C.leaf200 ? C.leaf200 : f.color === '#8C6A3A' ? '#C9A26B' : f.color, width: V ? 190 : 170, flex: '0 0 auto' }}>
                {f.pct}
              </div>
              <div>
                <div style={{ fontFamily: FONT.ui, fontWeight: 500, fontSize: V ? 36 : 32, color: C.paper, lineHeight: 1.2 }}>{f.en}</div>
                <div style={{ fontFamily: FONT.zhSans, fontWeight: 500, fontSize: V ? 31 : 27, color: 'rgba(244,238,220,0.65)', lineHeight: 1.35, letterSpacing: '0.04em' }}>{f.zh}</div>
              </div>
            </div>
          </Reveal>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: V ? 16 : 14, paddingLeft: V ? 0 : 208, marginTop: V ? 10 : 2, justifyContent: V ? 'center' : 'flex-start' }}>
          {OPTIONS.map((o, i) => {
            const s = spring({ frame: frame - 138 - i * 7, fps: 30, config: { damping: 12 } });
            return (
              <div
                key={i}
                style={{
                  transform: `scale(${0.6 + 0.4 * s}) translateY(${(1 - s) * 20}px)`,
                  opacity: Math.min(1, s * 1.4),
                  padding: V ? '14px 24px' : '10px 20px',
                  borderRadius: 16,
                  background: 'rgba(244,183,40,0.1)',
                  border: '1.5px solid rgba(244,183,40,0.55)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: V ? 28 : 25, color: C.gold }}>{o.en}</div>
                <div style={{ fontFamily: FONT.zhSans, fontSize: V ? 24 : 21, color: 'rgba(244,238,220,0.75)', marginTop: 2 }}>{o.zh}</div>
              </div>
            );
          })}
        </div>
        <Reveal delay={170} y={6}>
          <div style={{ paddingLeft: V ? 0 : 208, textAlign: V ? 'center' : 'left' }}>
            <BiSmall en={copy.zfNote.en} zh={copy.zfNote.zh} size={V ? 22 : 20} stacked={V} align={V ? 'center' : 'left'} color="rgba(244,238,220,0.55)" weight={400} />
          </div>
        </Reveal>
      </div>
    </Center>
  );
};

/* 6 ─ Stages ───────────────────────────────────────────────────────── */
export const SceneStages: React.FC = () => {
  const frame = useCurrentFrame();
  const { V } = useLayout();
  const p = ease(frame, 16, 100);
  const stages = [
    { n: copy.stSeed, s: copy.stSeedSub },
    { n: copy.stShoot, s: copy.stShootSub },
    { n: copy.stGrove, s: copy.stGroveSub },
  ];
  const icon = (i: number, g: number) => {
    if (i === 0) return <StaticShoot size={150} grow={0.45 * g} />;
    if (i === 1) return <StaticShoot size={210} grow={g} />;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ marginRight: -70 }}><StaticShoot size={160} grow={g} /></div>
        <StaticShoot size={230} grow={g} tint={g > 0.95 ? interpolate(frame, [120, 135], [0, 1], clamp) : 0} />
        <div style={{ marginLeft: -70 }}><StaticShoot size={180} grow={g} /></div>
      </div>
    );
  };
  const items = stages.map((st, i) => {
    const local = interpolate(p, [i * 0.42, i * 0.42 + 0.16], [0, 1], clamp);
    const g = spring({ frame: frame - 16 - i * 36, fps: 30, config: { damping: 12 } });
    return (
      <div
        key={i}
        style={{
          display: 'flex',
          flexDirection: V ? 'row' : 'column',
          alignItems: V ? 'flex-end' : 'center',
          width: V ? 880 : 460,
          gap: V ? 20 : 10,
          paddingLeft: V ? 56 : 0,
          opacity: 0.35 + 0.65 * local,
        }}
      >
        <div style={{ height: V ? 260 : 240, width: V ? 360 : 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flex: '0 0 auto' }}>
          {icon(i, Math.max(0.05, g))}
        </div>
        <div style={{ textAlign: V ? 'left' : 'center', paddingBottom: V ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, justifyContent: V ? 'flex-start' : 'center' }}>
            <span style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 64, color: i === 2 ? C.gold : C.paper }}>{st.n.en}</span>
            <span style={{ fontFamily: FONT.zhSerif, fontWeight: 600, fontSize: 52, color: i === 2 ? C.gold : C.leaf200 }}>{st.n.zh}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <BiSmall en={st.s.en} zh={st.s.zh} size={V ? 30 : 26} stacked align={V ? 'left' : 'center'} color="rgba(244,238,220,0.8)" />
          </div>
        </div>
      </div>
    );
  });
  return (
    <Center style={{ padding: V ? 70 : 60 }}>
      <Bi en={copy.stagesTitle.en} zh={copy.stagesTitle.zh} size={V ? 76 : 66} delay={2} />
      <div style={{ height: V ? 70 : 56 }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: V ? 'column' : 'row', gap: V ? 50 : 20 }}>
        {/* progress stalk */}
        <div
          style={{
            position: 'absolute',
            ...(V ? { left: 12, top: 130, bottom: 130, width: 6 } : { top: 243, left: 230, right: 230, height: 6 }),
            background: 'rgba(244,238,220,0.12)',
            borderRadius: 3,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              ...(V ? { width: 6, height: `${p * 100}%` } : { height: 6, width: `${p * 100}%` }),
              background: `linear-gradient(${V ? '180deg' : '90deg'}, ${C.bamboo500}, ${C.shoot300}, ${C.gold})`,
              borderRadius: 3,
            }}
          />
        </div>
        {items}
      </div>
    </Center>
  );
};

/* 7 ─ Cash out to Zcash ────────────────────────────────────────────── */
const FlowNode: React.FC<{ children: React.ReactNode; en: string; zh: string; active: number; gold?: boolean }> = ({ children, en, zh, active, gold }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 260 }}>
    <div
      style={{
        width: 150,
        height: 150,
        borderRadius: '50%',
        background: 'rgba(14,42,27,0.85)',
        border: `2px solid ${gold ? `rgba(244,183,40,${0.3 + 0.6 * active})` : `rgba(168,220,122,${0.2 + 0.5 * active})`}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 0 ${50 * active}px ${gold ? 'rgba(244,183,40,0.35)' : 'rgba(124,195,110,0.25)'}`,
      }}
    >
      {children}
    </div>
    <div style={{ marginTop: 12, position: 'relative', padding: '4px 14px', borderRadius: 10, background: 'rgba(11,21,16,0.92)' }}>
      <BiSmall en={en} zh={zh} size={26} stacked align="center" weight={600} />
    </div>
  </div>
);

export const SceneCashOut: React.FC = () => {
  const frame = useCurrentFrame();
  const { V } = useLayout();
  const t = ease(frame, 16, 80); // coin travel 0..1 across 3 legs
  const shield = interpolate(frame, [44, 56], [0, 1], clamp);
  const arrive = interpolate(frame, [78, 90], [0, 1], clamp);
  const SPAN = V ? 880 : 1350;
  const nodeAct = (i: number) => interpolate(t, [i / 3 - 0.08, i / 3], [0, 1], clamp);
  const track = (
    <div style={{ position: 'relative', width: V ? 300 : SPAN + 260, height: V ? SPAN + 260 : 260 }}>
      {/* line */}
      <div
        style={{
          position: 'absolute',
          ...(V ? { left: 147, top: 75, height: SPAN, width: 6 } : { top: 72, left: 130, width: SPAN, height: 6 }),
          background: 'rgba(244,238,220,0.1)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            ...(V ? { width: 6, height: `${t * 100}%` } : { height: 6, width: `${t * 100}%` }),
            background: `linear-gradient(${V ? '180deg' : '90deg'}, ${C.shoot300}, ${C.gold})`,
          }}
        />
      </div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: V ? 'column' : 'row', justifyContent: 'space-between', alignItems: V ? 'center' : 'flex-start' }}>
        <FlowNode en={`${copy.sell.en} $RAIN`} zh={copy.sell.zh} active={1}>
          <StaticShoot size={100} />
        </FlowNode>
        <FlowNode en={copy.nodeBsc.en} zh={copy.nodeBsc.zh} active={nodeAct(1)}>
          <div style={{ fontFamily: FONT.ui, fontWeight: 700, fontSize: 34, color: C.paper, letterSpacing: '0.04em' }}>BSC</div>
        </FlowNode>
        <FlowNode en={copy.nodeIntents.en} zh={copy.nodeIntents.zh} active={nodeAct(2)}>
          <svg width={70} height={70} viewBox="0 0 24 24" fill="none" stroke={C.leaf200} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8 H18 M14 4 L18 8 L14 12" />
            <path d="M20 16 H6 M10 12 L6 16 L10 20" />
          </svg>
        </FlowNode>
        <FlowNode en={copy.nodeZcash.en} zh={copy.nodeZcash.zh} active={arrive} gold>
          <Coin size={92} shield={arrive * shield} />
        </FlowNode>
      </div>
      {/* travelling coin */}
      <div
        style={{
          position: 'absolute',
          ...(V ? { left: 150 - 45, top: 75 + t * SPAN - 45 } : { left: 130 + t * SPAN - 45, top: 75 - 45 }),
          opacity: interpolate(frame, [12, 18, 80, 86], [0, 1, 1, 0], clamp),
        }}
      >
        <Coin size={90} spin={frame * 0.2} shield={shield} />
      </div>
    </div>
  );
  return (
    <Center style={{ padding: V ? 70 : 60 }}>
      <Bi en={copy.cashout.en} zh={copy.cashout.zh} size={V ? 58 : 60} delay={2} maxWidth={V ? 920 : 1700} />
      <div style={{ height: V ? 50 : 60 }} />
      <Reveal delay={6} y={30}>
        {track}
      </Reveal>
      <div style={{ height: V ? 30 : 40 }} />
      {/* shielded toggle */}
      <Reveal delay={30} y={12}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '14px 28px', borderRadius: 999, background: 'rgba(14,42,27,0.8)', border: '1.5px solid rgba(168,220,122,0.25)' }}>
          <div style={{ width: 84, height: 46, borderRadius: 23, background: shield > 0.5 ? C.bamboo500 : 'rgba(244,238,220,0.18)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 5, left: 5 + shield * 38, width: 36, height: 36, borderRadius: 18, background: C.paper }} />
          </div>
          <BiSmall en={copy.shielded.en} zh={copy.shielded.zh} size={30} weight={600} />
        </div>
      </Reveal>
      <div style={{ height: 26 }} />
      <Reveal delay={60} y={10}>
        <div style={{ textAlign: 'center' }}>
          <BiSmall en={copy.sameTx.en} zh={copy.sameTx.zh} size={24} stacked={V} align="center" color="rgba(244,238,220,0.72)" weight={400} />
          <div style={{ height: 8 }} />
          <BiSmall en={copy.shieldNote.en} zh={copy.shieldNote.zh} size={22} stacked={V} align="center" color="rgba(244,238,220,0.55)" weight={400} />
        </div>
      </Reveal>
    </Center>
  );
};

/* 8 ─ Shared grove ─────────────────────────────────────────────────── */
export const SceneGrove: React.FC = () => {
  const frame = useCurrentFrame();
  const { V, width, height } = useLayout();
  const count = V ? 16 : 26;
  const baseY = height * (V ? 0.97 : 0.98);
  const shoots = new Array(count).fill(0).map((_, i) => {
    const x = ((i + 0.5 + (random(`g-x-${i}`) - 0.5) * 0.7) / count) * width;
    const size = (V ? 160 : 150) + random(`g-s-${i}`) * (V ? 240 : 230);
    const delay = Math.abs(i - count / 2) * 1.6 + random(`g-d-${i}`) * 6;
    const g = spring({ frame: frame - delay, fps: 30, config: { damping: 13 } });
    return { x, size, g, z: random(`g-z-${i}`) };
  });
  shoots.sort((a, b) => a.size - b.size);
  const pool = [width / 2, height * (V ? 0.5 : 0.47)];
  const poolOn = interpolate(frame, [26, 50], [0, 1], clamp);
  const particles = new Array(48).fill(0).map((_, i) => {
    const s = shoots[i % shoots.length];
    const start = s.x;
    const sy = baseY - s.size * s.g * 0.8;
    const cycle = 46;
    const ph = (frame - 20 + random(`p-${i}`) * cycle) % cycle;
    const k = ph / cycle;
    const vis = frame > 20 ? 1 : 0;
    const tt = Easing.inOut(Easing.quad)(k);
    const cx = (start + pool[0]) / 2 + (random(`pc-${i}`) - 0.5) * 300;
    const cy = Math.min(sy, pool[1]) - 120;
    const x = (1 - tt) * (1 - tt) * start + 2 * (1 - tt) * tt * cx + tt * tt * pool[0];
    const y = (1 - tt) * (1 - tt) * sy + 2 * (1 - tt) * tt * cy + tt * tt * pool[1];
    return { x, y, o: vis * Math.sin(Math.PI * k) };
  });
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: V ? 170 : 90, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 70px' }}>
        <Bi en={copy.grove.en} zh={copy.grove.zh} size={V ? 80 : 82} delay={4} maxWidth={V ? 920 : 1700} />
      </div>
      {particles.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: p.x - 7, top: p.y - 7, width: 14, height: 14, borderRadius: 7, background: C.gold, opacity: p.o * 0.85, boxShadow: '0 0 12px rgba(244,183,40,0.8)' }} />
      ))}
      {/* pool */}
      <div style={{ position: 'absolute', left: pool[0] - 240, top: pool[1] - 240, width: 480, height: 480, opacity: poolOn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(244,183,40,0.38) 0%, rgba(244,183,40,0.08) 45%, rgba(0,0,0,0) 70%)',
            transform: `scale(${0.9 + 0.08 * Math.sin(frame / 8)})`,
          }}
        />
        <div style={{ position: 'absolute', inset: 70, borderRadius: '50%', border: '2px solid rgba(244,183,40,0.45)' }} />
        <div style={{ textAlign: 'center', position: 'relative', background: 'rgba(11,21,16,0.82)', borderRadius: 999, padding: '16px 34px', border: '1.5px solid rgba(244,183,40,0.5)' }}>
          <div style={{ fontFamily: FONT.ui, fontWeight: 700, fontSize: 36, color: C.gold }}>$SPROUT/ZEC</div>
          <div style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 30, color: C.paper, marginTop: 6 }}>
            Grove <span style={{ fontFamily: FONT.zhSerif }}>竹林</span>
          </div>
        </div>
      </div>
      {shoots.map((s, i) => (
        <div key={i} style={{ position: 'absolute', left: s.x - s.size / 2, top: baseY - s.size * 0.875, opacity: 0.55 + s.z * 0.45 }}>
          <StaticShoot size={s.size} grow={Math.max(0.02, s.g)} />
        </div>
      ))}
    </AbsoluteFill>
  );
};

/* 9 ─ End card ─────────────────────────────────────────────────────── */
export const SceneEnd: React.FC = () => {
  const { V } = useLayout();
  return (
    <AbsoluteFill>
      <Center style={{ padding: V ? 70 : 60, paddingBottom: V ? 220 : 130 }}>
        <SproutMark size={V ? 300 : 230} delay={0} speed={1.3} glow={0.8} />
        <div style={{ height: V ? 30 : 18 }} />
        <Wordmark size={V ? 170 : 140} delay={18} />
        <div style={{ height: V ? 34 : 22 }} />
        <Reveal delay={30}>
          <ZecChip size={V ? 34 : 30} label="$SPROUT" />
        </Reveal>
        <div style={{ height: V ? 46 : 30 }} />
        <Bi en={copy.endTag.en} zh={copy.endTag.zh} size={V ? 62 : 56} delay={38} />
        <div style={{ height: V ? 46 : 30 }} />
        <Reveal delay={54}>
          <div style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: V ? 40 : 36, color: C.leaf200, letterSpacing: '0.08em' }}>sproutbnb.cash</div>
        </Reveal>
        <div style={{ height: 12 }} />
        <Reveal delay={60}>
          <BiSmall en={copy.endBuilt.en} zh={copy.endBuilt.zh} size={V ? 24 : 22} color="rgba(244,238,220,0.55)" align="center" weight={400} />
        </Reveal>
      </Center>
      <div style={{ position: 'absolute', bottom: V ? 90 : 44, left: 0, right: 0, textAlign: 'center', padding: '0 60px' }}>
        <Reveal delay={66} y={6}>
          <div style={{ fontFamily: FONT.ui, fontSize: V ? 22 : 20, color: 'rgba(244,238,220,0.5)', lineHeight: 1.5 }}>{copy.disclaimer.en}</div>
          <div style={{ fontFamily: FONT.zhSans, fontSize: V ? 21 : 19, color: 'rgba(244,238,220,0.5)', lineHeight: 1.5 }}>{copy.disclaimer.zh}</div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};
