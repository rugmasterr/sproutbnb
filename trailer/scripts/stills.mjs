// Renders preview stills for visual QA.
// Usage: node scripts/stills.mjs <outDir> [h|v|hv] [frame,frame,...]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = process.argv[2] || path.join(root, 'out', 'stills');
const which = process.argv[3] || 'hv';
const frames = (process.argv[4] || '60,100,140,250,300,400,470,560,620,700,800,860,950,1010,1090,1180,1250,1300,1375')
  .split(',')
  .map(Number);
fs.mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public') });
const comps = [];
if (which.includes('h')) comps.push(['SproutTrailer', 'h']);
if (which.includes('v')) comps.push(['SproutTrailerVertical', 'v']);
for (const [id, tag] of comps) {
  const composition = await selectComposition({ serveUrl, id });
  for (const frame of frames) {
    const output = path.join(outDir, `${tag}-${String(frame).padStart(4, '0')}.jpg`);
    await renderStill({ serveUrl, composition, frame, output, imageFormat: 'jpeg', jpegQuality: 80, scale: tag === 'v' ? 0.5 : 0.6 });
    console.log('still', output);
  }
}
