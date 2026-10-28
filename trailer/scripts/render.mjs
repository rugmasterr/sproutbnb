// Renders the final outputs into ../public/trailer/:
//   sprout-trailer.mp4 (1920x1080@30, H.264), sprout-trailer-vertical.mp4 (1080x1920@30, H.264), poster.jpg
// Usage: node scripts/render.mjs [all|h|v|poster]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, '..', 'public', 'trailer');
const which = process.argv[2] || 'all';
fs.mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public') });

async function video(id, file, crf) {
  const composition = await selectComposition({ serveUrl, id });
  const outputLocation = path.join(outDir, file);
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    crf,
    pixelFormat: 'yuv420p',
    audioCodec: 'aac',
    audioBitrate: '160k',
    outputLocation,
    concurrency: Number(process.env.CONCURRENCY || 0) || null,
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== last) { last = p; console.log(`${id}: ${p * 10}%`); }
    },
  });
  console.log('wrote', outputLocation, (fs.statSync(outputLocation).size / 1e6).toFixed(2), 'MB');
}

if (which === 'all' || which === 'h') await video('SproutTrailer', 'sprout-trailer.mp4', Number(process.env.CRF_H || 23));
if (which === 'all' || which === 'v') await video('SproutTrailerVertical', 'sprout-trailer-vertical.mp4', Number(process.env.CRF_V || 24));
if (which === 'all' || which === 'poster') {
  // poster = the fully revealed end card (frame 1375, before the final fade)
  const composition = await selectComposition({ serveUrl, id: 'SproutTrailer' });
  const output = path.join(outDir, 'poster.jpg');
  await renderStill({ serveUrl, composition, frame: 1375, output, imageFormat: 'jpeg', jpegQuality: 90 });
  console.log('wrote', output, (fs.statSync(output).size / 1e3).toFixed(0), 'KB');
}
