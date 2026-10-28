'use client';

import { useEffect, useRef } from 'react';

type RGB = [number, number, number];
const Y: RGB = [240, 185, 11];
const YH: RGB = [252, 213, 53];
const G: RGB = [46, 189, 107];
const GH: RGB = [124, 227, 160];
const FG: RGB = [242, 240, 232];
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Small deterministic PRNG so stalks look the same on every load. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Stalk = {
  x: number;
  w: number;
  seg: number;
  count: number;
  delay: number;
  speed: number; // segments per second
  phase: number;
  tone: 'y' | 'g';
  leaves: { k: number; side: 1 | -1; len: number }[];
  sap: { p: number; v: number }[];
};
type Drop = { x: number; y: number; v: number; len: number; glyph: string | null; tone: 'y' | 'g' | 'f'; a: number };

const GLYPHS = '0123456789abcdef竹笋节';

export type HeroCanvasProps = {
  className?: string;
  /** Number of stalks (default: responsive 5–9). */
  stalks?: number;
  /** Particle density multiplier (default 1). */
  density?: number;
  /** Pointer reactivity (default true). */
  interactive?: boolean;
  /** Where the grove stands: 'right' leaves room for copy on the left on wide screens. */
  align?: 'center' | 'right';
  /** RNG seed for a different grove. */
  seed?: number;
};

/**
 * Animated hero centrepiece: segmented bamboo stalks (BNB-yellow + bamboo-green) growing up
 * through a faint hex dot grid, with falling data rain and sap rising inside the stalks.
 * Leans subtly toward the pointer. Pauses when offscreen / tab hidden. Reduced motion: one
 * static, fully-grown frame. Purely decorative (aria-hidden). Size it with className
 * (it fills its box, e.g. `absolute inset-0`).
 */
export function HeroCanvas({ className = '', stalks, density = 1, interactive = true, align = 'right', seed = 7 }: HeroCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let grid: { x: number; y: number; r: number }[] = [];
    let grove: Stalk[] = [];
    let rain: Drop[] = [];
    let t0 = performance.now();
    let raf = 0;
    let visible = true;
    let running = false;
    const ptr = { x: -9999, y: -9999, tx: 0, lean: 0, active: false };

    const build = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // hex dot lattice
      const sp = w < 640 ? 22 : 26;
      const rowH = sp * 0.866;
      grid = [];
      for (let row = 0, y = rowH / 2; y < h + rowH; row++, y += rowH) {
        for (let x = row % 2 ? sp / 2 : 0; x < w + sp; x += sp) grid.push({ x, y, r: 0.9 });
      }

      // grove
      const rand = mulberry(seed);
      const n = stalks ?? (w < 640 ? 5 : w < 1100 ? 7 : 9);
      const left = align === 'right' && w >= 1024 ? 0.54 : 0.06;
      const right = 0.96;
      const scale = Math.min(1.25, Math.max(0.6, h / 640));
      grove = [];
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0.5 : i / (n - 1);
        const centre = 1 - Math.abs(u - 0.55) * 1.6; // taller near the middle
        const sw = (7 + rand() * 9 + centre * 5) * scale;
        const seg = (52 + rand() * 30) * scale;
        const target = h * (0.38 + Math.max(0, centre) * 0.5 + rand() * 0.12);
        const count = Math.max(3, Math.round(target / seg));
        const leaves: Stalk['leaves'] = [];
        for (let k = 1; k < count; k++) if (rand() < 0.28) leaves.push({ k, side: rand() < 0.5 ? -1 : 1, len: (26 + rand() * 30) * scale });
        grove.push({
          x: w * (left + (right - left) * u) + (rand() - 0.5) * 30,
          w: sw,
          seg,
          count,
          delay: 0.15 + i * 0.12 + rand() * 0.3,
          speed: 2.2 + rand() * 1.6,
          phase: rand() * Math.PI * 2,
          tone: centre > 0.55 || rand() < 0.3 ? 'y' : 'g',
          leaves,
          sap: Array.from({ length: 2 + Math.floor(rand() * 3) }, () => ({ p: rand(), v: 0.05 + rand() * 0.08 })),
        });
      }
      // draw yellow stalks last (on top)
      grove.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'g' ? -1 : 1));

      // rain
      const nDrops = Math.round(Math.min(170, (w * h) / 9000) * density);
      rain = Array.from({ length: nDrops }, () => newDrop(true));
    };

    const newDrop = (anywhere: boolean): Drop => {
      const glyph = Math.random() < 0.28 ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : null;
      const tr = Math.random();
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : -20 - Math.random() * 80,
        v: 30 + Math.random() * 70,
        len: 6 + Math.random() * 18,
        glyph,
        tone: tr < 0.45 ? 'y' : tr < 0.7 ? 'g' : 'f',
        a: 0.08 + Math.random() * 0.22,
      };
    };

    const sway = (s: Stalk, t: number, y: number) => {
      const k = Math.pow(Math.max(0, (h - y) / h), 1.6);
      const breeze = reduced ? 0 : Math.sin(t * 0.55 + s.phase) * 5 + Math.sin(t * 1.3 + s.phase * 2) * 1.6;
      return k * (breeze + ptr.lean * 22);
    };

    const drawStalk = (s: Stalk, t: number) => {
      const grown = reduced ? s.count : Math.max(0, Math.min(s.count, (t - s.delay) * s.speed));
      if (grown <= 0) return;
      const base = h + 6;
      const col = s.tone === 'y' ? Y : G;
      const hi = s.tone === 'y' ? YH : GH;
      const full = Math.floor(grown);
      const frac = grown - full;
      const topY = base - grown * s.seg;

      // trunk segments
      for (let k = 0; k < Math.ceil(grown); k++) {
        const y0 = base - k * s.seg;
        const len = k < full ? s.seg : frac * s.seg;
        const y1 = y0 - len + 2.5;
        const taper = 1 - (k / (s.count + 2)) * 0.45;
        const hw = (s.w * taper) / 2;
        const x0 = s.x + sway(s, t, y0);
        const x1 = s.x + sway(s, t, y1);
        // glow body
        ctx.fillStyle = rgba(col, 0.055);
        ctx.beginPath();
        ctx.moveTo(x0 - hw - 3, y0);
        ctx.lineTo(x1 - hw * 0.94 - 3, y1);
        ctx.lineTo(x1 + hw * 0.94 + 3, y1);
        ctx.lineTo(x0 + hw + 3, y0);
        ctx.closePath();
        ctx.fill();
        // body
        const g = ctx.createLinearGradient(x0 - hw, 0, x0 + hw, 0);
        g.addColorStop(0, rgba(col, 0.04));
        g.addColorStop(0.5, rgba(col, 0.16));
        g.addColorStop(1, rgba(col, 0.04));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0 - hw, y0);
        ctx.lineTo(x1 - hw * 0.94, y1);
        ctx.lineTo(x1 + hw * 0.94, y1);
        ctx.lineTo(x0 + hw, y0);
        ctx.closePath();
        ctx.fill();
        // edges
        ctx.strokeStyle = rgba(col, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 - hw, y0);
        ctx.lineTo(x1 - hw * 0.94, y1);
        ctx.moveTo(x0 + hw, y0);
        ctx.lineTo(x1 + hw * 0.94, y1);
        ctx.stroke();
        // centre highlight
        ctx.strokeStyle = rgba(hi, 0.14);
        ctx.beginPath();
        ctx.moveTo(x0 - hw * 0.35, y0 - 3);
        ctx.lineTo(x1 - hw * 0.33, y1 + 3);
        ctx.stroke();

        // node ring at the top of each completed segment
        if (k < full) {
          const ny = y0 - s.seg;
          const nx = s.x + sway(s, t, ny);
          const rw = hw * 1.25 + 2;
          ctx.fillStyle = rgba(col, 0.16);
          ctx.beginPath();
          ctx.ellipse(nx, ny, rw + 5, 5.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = rgba(hi, 0.9);
          ctx.beginPath();
          ctx.ellipse(nx, ny, rw, 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // growing tip: a shoot cone while growing, a soft bead when done
      const tx = s.x + sway(s, t, topY);
      if (grown < s.count) {
        const hw = (s.w * 0.6) / 2;
        ctx.fillStyle = rgba(hi, 0.85);
        ctx.beginPath();
        ctx.moveTo(tx - hw, topY + 2);
        ctx.lineTo(tx, topY - s.w * 1.4);
        ctx.lineTo(tx + hw, topY + 2);
        ctx.closePath();
        ctx.fill();
        const gl = ctx.createRadialGradient(tx, topY, 0, tx, topY, 26);
        gl.addColorStop(0, rgba(hi, 0.45));
        gl.addColorStop(1, rgba(hi, 0));
        ctx.fillStyle = gl;
        ctx.fillRect(tx - 26, topY - 26, 52, 52);
      } else {
        ctx.fillStyle = rgba(hi, 0.75);
        ctx.beginPath();
        ctx.ellipse(tx, topY + 1, (s.w * 0.6) / 2 + 1, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // leaves on grown nodes
      for (const lf of s.leaves) {
        if (lf.k > full) continue;
        const ny = base - lf.k * s.seg;
        const nx = s.x + sway(s, t, ny);
        const flutter = reduced ? 0 : Math.sin(t * 1.4 + s.phase + lf.k) * 0.08;
        const ang = (lf.side > 0 ? -0.55 : Math.PI + 0.55) + flutter * lf.side;
        const ex = nx + Math.cos(ang) * lf.len;
        const ey = ny + Math.sin(ang) * lf.len;
        const mx = nx + Math.cos(ang - 0.35 * lf.side) * lf.len * 0.55;
        const my = ny + Math.sin(ang - 0.35 * lf.side) * lf.len * 0.55;
        const mx2 = nx + Math.cos(ang + 0.35 * lf.side) * lf.len * 0.55;
        const my2 = ny + Math.sin(ang + 0.35 * lf.side) * lf.len * 0.55;
        ctx.fillStyle = rgba(GH, 0.13);
        ctx.strokeStyle = rgba(GH, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.quadraticCurveTo(mx2, my2, nx, ny);
        ctx.fill();
        ctx.stroke();
      }

      // sap: green-hi beads rising inside the stalk
      if (!reduced && grown >= 1) {
        for (const sp of s.sap) {
          sp.p = (sp.p + sp.v / 60) % 1;
          const y = base - sp.p * grown * s.seg;
          const x = s.x + sway(s, t, y);
          ctx.fillStyle = rgba(s.tone === 'y' ? YH : GH, 0.9 * Math.sin(sp.p * Math.PI));
          ctx.fillRect(x - 0.75, y - 4, 1.5, 8);
        }
      }
    };

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);

      // pointer easing
      ptr.lean += ((ptr.active ? ptr.tx : 0) - ptr.lean) * 0.04;

      // dot grid: faint, brighter near pointer + a slow upward wave
      for (const d of grid) {
        let a = 0.07;
        if (!reduced) a += 0.05 * Math.max(0, Math.sin(d.y * 0.012 + t * 0.9 - d.x * 0.002));
        if (ptr.active) {
          const dx = d.x - ptr.x;
          const dy = d.y - ptr.y;
          const dd = dx * dx + dy * dy;
          if (dd < 160 * 160) a += 0.38 * (1 - Math.sqrt(dd) / 160);
        }
        ctx.fillStyle = a > 0.2 ? rgba(YH, a) : rgba(FG, a);
        ctx.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
      }

      // ground glow
      const gg = ctx.createRadialGradient(w * (align === 'right' && w >= 1024 ? 0.7 : 0.5), h, 0, w * 0.6, h, h * 0.9);
      gg.addColorStop(0, rgba(Y, 0.12));
      gg.addColorStop(0.5, rgba(G, 0.04));
      gg.addColorStop(1, rgba(G, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, w, h);

      // rain
      ctx.font = '10px ui-monospace, monospace';
      for (const r of rain) {
        if (!reduced) r.y += r.v / 60;
        if (r.y - r.len > h) Object.assign(r, newDrop(false));
        const c = r.tone === 'y' ? Y : r.tone === 'g' ? G : FG;
        if (r.glyph) {
          ctx.fillStyle = rgba(c, r.a * 1.6);
          ctx.fillText(r.glyph, r.x, r.y);
        } else {
          const lg = ctx.createLinearGradient(0, r.y - r.len, 0, r.y);
          lg.addColorStop(0, rgba(c, 0));
          lg.addColorStop(1, rgba(c, r.a));
          ctx.fillStyle = lg;
          ctx.fillRect(r.x, r.y - r.len, 1, r.len);
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      // narrow screens: the grove sits behind the copy, so keep it quieter
      ctx.globalAlpha = w < 1024 ? 0.5 : 1;
      for (const s of grove) drawStalk(s, t);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (running) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    build();
    if (reduced) frame(performance.now() + 60_000);
    else {
      t0 = performance.now();
      start();
    }

    const ro = new ResizeObserver(() => {
      build();
      if (reduced) frame(performance.now() + 60_000);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);

    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);

    const onMove = (e: PointerEvent) => {
      if (!interactive || e.pointerType === 'touch') return;
      const r = canvas.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.active = ptr.y > -40 && ptr.y < h + 40;
      ptr.tx = Math.max(-1, Math.min(1, (ptr.x / w) * 2 - 1));
    };
    const onLeave = () => (ptr.active = false);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [stalks, density, interactive, align, seed]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none block h-full w-full ${className}`} />;
}
