import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadSerifSC } from '@remotion/google-fonts/NotoSerifSC';
import { loadFont as loadSansSC } from '@remotion/google-fonts/NotoSansSC';
import subsets from './cjk-subsets.json';

// Only the unicode-range chunks that contain the Chinese copy are fetched (see scripts/cjk-subsets.cjs).
const serifSC = loadSerifSC('normal', { weights: ['600', '700'], subsets: subsets.NotoSerifSC as any, ignoreTooManyRequestsWarning: true }).fontFamily;
const sansSC = loadSansSC('normal', { weights: ['400', '500'], subsets: subsets.NotoSansSC as any, ignoreTooManyRequestsWarning: true }).fontFamily;
const fraunces = loadFraunces('normal', { weights: ['400', '600', '700'], subsets: ['latin'] }).fontFamily;
const inter = loadInter('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily;

export const FONT = {
  display: `"${fraunces}", "${serifSC}", serif`,
  ui: `"${inter}", "${sansSC}", sans-serif`,
  zhSerif: `"${serifSC}", serif`,
  zhSans: `"${sansSC}", sans-serif`,
};

// SPEC Brand palette
export const C = {
  bg: '#0B1510',
  bamboo900: '#0E2A1B',
  bamboo700: '#1F6B43',
  bamboo500: '#2F8F57',
  shoot300: '#7CC36E',
  leaf200: '#A8DC7A',
  paper: '#F4EEDC',
  ink: '#141613',
  soil: '#6B4F2A',
  seal: '#C8402F',
  gold: '#F4B728',
};

export const FPS = 30;
export const TOTAL = 1410; // 47 s

// scene timeline [from, duration] — overlaps of 15 frames are crossfades
export const SCENES = {
  rain: [0, 150],
  grow: [135, 180],
  wallet: [300, 180],
  launch: [465, 180],
  fees: [630, 240],
  stages: [855, 165],
  cashout: [1005, 165],
  grove: [1155, 120],
  end: [1260, 150],
} as const;
