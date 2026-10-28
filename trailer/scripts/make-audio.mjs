// Procedurally synthesizes the original Sprout trailer score (no samples, no third-party audio):
// soft pentatonic pad + guzheng-like plucks (additive, pitch bend-in, left-hand vibrato) + light rain noise,
// a couple of soft low "thumps" and coin chimes. Writes public/sprout-score.wav (44.1 kHz, 16-bit stereo),
// peak-normalized to -1 dBFS (no clipping).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SR = 44100;
const DURATION = 47; // seconds, matches the composition (1410 frames @ 30fps)
const N = SR * DURATION;
const L = new Float32Array(N);
const R = new Float32Array(N);

// deterministic PRNG so the score is reproducible
let seed = 0x5eed5;
const rand = () => {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
};

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const add = (i, l, r) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r; } };

// ---------- pad ----------
function pad(t0, dur, notes, gain = 0.06) {
  const att = 1.6, rel = 2.4;
  const start = Math.floor(t0 * SR);
  const len = Math.floor((dur + rel) * SR);
  const voices = notes.map((m, k) => ({
    f: midiHz(m),
    det: [0.997, 1.0, 1.0032],
    ph: [rand(), rand(), rand()].map((x) => x * Math.PI * 2),
    pan: (k / Math.max(1, notes.length - 1)) * 0.6 - 0.3,
  }));
  let lp = 0, lpR = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    let env = t < att ? (1 - Math.cos((Math.PI * t) / att)) / 2 : 1;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / rel);
    const breathe = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.18 * t);
    let sl = 0, sr = 0;
    for (const v of voices) {
      let s = 0;
      for (let d = 0; d < 3; d++) {
        const ph = 2 * Math.PI * v.f * v.det[d] * t + v.ph[d];
        s += Math.sin(ph) + 0.18 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph);
      }
      s /= 3;
      sl += s * (0.5 - v.pan * 0.5);
      sr += s * (0.5 + v.pan * 0.5);
    }
    // gentle one-pole low-pass for warmth
    lp += 0.08 * (sl - lp);
    lpR += 0.08 * (sr - lpR);
    add(start + n, lp * env * breathe * gain, lpR * env * breathe * gain);
  }
}

// ---------- guzheng-like pluck ----------
function pluck(t0, midi, gain = 0.22, pan = 0, opts = {}) {
  const f = midiHz(midi);
  const dur = opts.dur ?? 2.6;
  const bend = opts.bend ?? 0.35; // semitones below, glides up in ~50ms
  const vib = opts.vib ?? true;
  const start = Math.floor(t0 * SR);
  const len = Math.floor(dur * SR);
  const partials = [1, 2, 3, 4, 5, 6, 7];
  const amps = [1, 0.55, 0.32, 0.2, 0.12, 0.07, 0.04];
  const phase = new Float64Array(partials.length);
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const bendNow = -bend * Math.exp(-t / 0.018);
    const vibNow = vib && t > 0.35 ? 0.12 * Math.sin(2 * Math.PI * 5.2 * (t - 0.35)) * Math.min(1, (t - 0.35) / 0.4) : 0;
    const fNow = f * Math.pow(2, (bendNow + vibNow) / 12);
    let s = 0;
    for (let k = 0; k < partials.length; k++) {
      phase[k] += (2 * Math.PI * fNow * partials[k] * (1 + 0.0007 * k * k)) / SR;
      const decay = Math.exp(-t * (1.3 + k * 1.1));
      s += amps[k] * decay * Math.sin(phase[k]);
    }
    const attack = Math.min(1, t / 0.003);
    const tail = n > len - SR * 0.2 ? (len - n) / (SR * 0.2) : 1;
    const v = s * attack * tail * gain;
    add(start + n, v * (0.5 - pan * 0.5) * 2 * 0.7, v * (0.5 + pan * 0.5) * 2 * 0.7);
  }
}

// ---------- coin chime (inharmonic bell) ----------
function chime(t0, midi, gain = 0.12) {
  const f = midiHz(midi);
  const start = Math.floor(t0 * SR);
  const len = Math.floor(2.4 * SR);
  const ratios = [1, 2.76, 5.4, 8.93];
  const amps = [1, 0.5, 0.25, 0.12];
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    let s = 0;
    for (let k = 0; k < ratios.length; k++) s += amps[k] * Math.exp(-t * (2.2 + k * 2)) * Math.sin(2 * Math.PI * f * ratios[k] * t);
    const v = s * Math.min(1, t / 0.002) * gain;
    add(start + n, v * 0.9, v);
  }
}

// ---------- soft low thump ----------
function thump(t0, gain = 0.35) {
  const start = Math.floor(t0 * SR);
  const len = Math.floor(1.6 * SR);
  let ph = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const f = 48 + 40 * Math.exp(-t / 0.05);
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * Math.exp(-t / 0.45) * Math.min(1, t / 0.004) * gain;
    add(start + n, v, v);
  }
}

// ---------- rain ----------
function rain(levelAt) {
  let hpL = 0, hpR = 0, lpL = 0, lpR = 0, prevL = 0, prevR = 0;
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    const lvl = levelAt(t);
    const wl = rand() * 2 - 1, wr = rand() * 2 - 1;
    // band-limit: one-pole LP then HP
    lpL += 0.35 * (wl - lpL); lpR += 0.35 * (wr - lpR);
    hpL = 0.985 * (hpL + lpL - prevL); hpR = 0.985 * (hpR + lpR - prevR);
    prevL = lpL; prevR = lpR;
    L[n] += hpL * lvl; R[n] += hpR * lvl;
  }
  // droplets: short filtered ticks
  for (let t = 0; t < DURATION; t += 0.012 + rand() * 0.05) {
    const lvl = levelAt(t);
    if (lvl < 0.004 || rand() > 0.6) continue;
    const start = Math.floor(t * SR);
    const f = 2200 + rand() * 3800;
    const g = lvl * (1.5 + rand() * 3);
    const pan = rand() * 2 - 1;
    const len = Math.floor(0.025 * SR);
    for (let n = 0; n < len; n++) {
      const tt = n / SR;
      const v = Math.sin(2 * Math.PI * f * tt * (1 - tt * 8)) * Math.exp(-tt / 0.004) * g;
      add(start + n, v * (1 - pan) * 0.5, v * (1 + pan) * 0.5);
    }
  }
}

// ================= arrangement =================
// D major pentatonic: D E F# A B
// Scene timing (s): rain 0-4.5 | grow 4.5-10 | wallet 10-15.5 | launch 15.5-21 | fees 21-28.5 | stages 28.5-33.5
//                   cash out 33.5-38.5 | grove 38.5-42 | end 42-47
rain((t) => {
  if (t < 4.5) return 0.05 * Math.min(1, t / 1.2);
  if (t < 7) return 0.05 - (t - 4.5) * 0.014; // fade to bed
  if (t > 44) return 0.015 * Math.max(0, (47 - t) / 3);
  return 0.015;
});

const chords = [
  [0.0, 5.0, [50, 57, 64, 66]], // D(add9)
  [4.5, 6.0, [47, 54, 57, 62, 66]], // Bm7
  [10.0, 5.8, [43, 50, 59, 64]], // G6/9-ish
  [15.5, 5.8, [45, 52, 57, 59, 64]], // Asus
  [21.0, 7.8, [50, 57, 62, 66, 69]], // D
  [28.5, 5.3, [47, 54, 59, 62, 66]], // Bm
  [33.5, 5.3, [43, 50, 57, 62, 66]], // Gmaj9
  [38.5, 3.8, [45, 52, 57, 61, 64]], // A
  [42.0, 3.4, [50, 57, 62, 66, 69, 74]], // D (final)
];
for (const [t, d, notes] of chords) pad(t, d, notes, t >= 42 ? 0.075 : 0.06);

// opening: a few lonely plucks in the rain
pluck(1.2, 74, 0.16, -0.3);
pluck(2.6, 71, 0.14, 0.3);
pluck(3.5, 69, 0.13, 0.0);

// shoot breaks through: rising gliss + thump
thump(4.5, 0.4);
[62, 64, 66, 69, 71, 74, 76, 78].forEach((m, i) => pluck(4.5 + i * 0.055, m, 0.1 + i * 0.01, -0.5 + i * 0.13, { vib: i === 7 }));

// main pentatonic motif, varied per scene
const scale = [50, 52, 54, 57, 59, 62, 64, 66, 69, 71, 74, 76, 78, 81];
const motifs = [
  [9, 8, 6, 8, 9, 11, 10, 8],
  [6, 8, 9, 8, 6, 5, 6, 8],
  [8, 9, 11, 12, 11, 9, 8, 9],
  [11, 9, 8, 6, 8, 9, 6, 5],
];
const beat = 0.68;
let mi = 0;
for (let t = 6.0; t < 41.6; t += beat * 8) {
  const motif = motifs[mi % motifs.length];
  motif.forEach((deg, i) => {
    const tt = t + i * beat + (i % 2 ? 0.03 : 0);
    if (tt > 41.6) return;
    const accent = i === 0 ? 1.25 : 1;
    pluck(tt, scale[deg], 0.12 * accent, ((i % 4) - 1.5) * 0.25, { dur: 2.2 });
    if (i === 0) pluck(tt, scale[deg] - 12, 0.08, 0, { dur: 2.6, vib: false });
  });
  mi++;
}

// coin chimes: ZEC drops in (scene 3), launch confirm (scene 4), cash-out arrives (scene 7)
chime(12.0, 86, 0.1);
chime(12.15, 93, 0.06);
chime(19.0, 88, 0.08);
chime(36.2, 86, 0.09);
chime(36.35, 90, 0.06);

// grove + end card
thump(42.0, 0.42);
[57, 62, 66, 69, 74, 78, 81, 86].forEach((m, i) => pluck(42.0 + i * 0.06, m, 0.12, -0.6 + i * 0.17, { dur: 4.5, vib: i > 5 }));
pluck(43.6, 74, 0.12, 0, { dur: 3.3 });

// ================= master =================
// gentle fade in/out, normalize to -1 dBFS
const fadeIn = 0.4 * SR, fadeOut = 2.0 * SR;
let peak = 0;
for (let n = 0; n < N; n++) {
  let g = 1;
  if (n < fadeIn) g = n / fadeIn;
  if (n > N - fadeOut) g = Math.max(0, (N - n) / fadeOut);
  L[n] *= g; R[n] *= g;
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const target = Math.pow(10, -1 / 20);
const norm = target / peak;

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
let clipped = 0;
for (let n = 0; n < N; n++) {
  for (const [ch, arr] of [[0, L], [1, R]]) {
    let v = arr[n] * norm;
    if (Math.abs(v) > 1) { clipped++; v = Math.sign(v); }
    buf.writeInt16LE(Math.round(v * 32767), 44 + n * 4 + ch * 2);
  }
}
const outDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'sprout-score.wav');
fs.writeFileSync(out, buf);
console.log(`wrote ${out}: ${DURATION}s, raw peak ${peak.toFixed(3)}, gain ${norm.toFixed(3)}, normalized peak -1 dBFS, clipped samples: ${clipped}`);
