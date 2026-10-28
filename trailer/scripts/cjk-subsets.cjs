// Computes which Google Fonts unicode-range subsets of the CJK fonts are needed for the
// Chinese copy in src/copy.json (plus a few UI glyphs), so the render only fetches those files.
// Usage: node scripts/cjk-subsets.cjs  -> writes src/cjk-subsets.json
const fs = require('fs');
const path = require('path');

const copy = require('../src/copy.json');
const extra = '春笋竹林根节印章 0123456789.%$·—…，。、（）：→';
let chars = extra;
for (const v of Object.values(copy)) chars += v.zh;
const needed = [...new Set([...chars])].map((c) => c.codePointAt(0));

function parseRanges(s) {
  return s.split(',').map((part) => {
    const p = part.trim().replace(/^U\+/i, '');
    if (p.includes('-')) {
      const [a, b] = p.split('-');
      return [parseInt(a, 16), parseInt(b, 16)];
    }
    if (p.includes('?')) {
      return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'f'), 16)];
    }
    const n = parseInt(p, 16);
    return [n, n];
  });
}

const out = {};
for (const font of ['NotoSerifSC', 'NotoSansSC']) {
  const mod = require(`@remotion/google-fonts/${font}`);
  const ranges = mod.getInfo().unicodeRanges;
  const subsets = new Set();
  const missing = [];
  for (const cp of needed) {
    let found = false;
    for (const [key, val] of Object.entries(ranges)) {
      if (parseRanges(val).some(([a, b]) => cp >= a && cp <= b)) {
        subsets.add(key.replace(/^\[|\]$/g, '') === key ? key : key);
        found = true;
      }
    }
    if (!found) missing.push(String.fromCodePoint(cp));
  }
  out[font] = [...subsets];
  console.log(font, 'subsets:', out[font].length, 'missing:', JSON.stringify(missing.join('')));
}
fs.writeFileSync(path.join(__dirname, '..', 'src', 'cjk-subsets.json'), JSON.stringify(out, null, 2));
