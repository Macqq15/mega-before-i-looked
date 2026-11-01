// Plan morning-digest § 3–4. Saves one rig page as a single self-contained HTML file (ADR 0001,
// ADR 0003). Previews never go in the repo: pass an output path outside it.
//
//   pnpm preview:save <path> <out.html> [--no-marker]
//
// --no-marker renders with LANE_MARKER unset, so the banner reads "no marker set".
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from '../src/app.js';

const args = process.argv.slice(2);
const noMarker = args.includes('--no-marker');
const [path, out] = args.filter((a) => a !== '--no-marker');

if (!path?.startsWith('/') || !out) {
  console.error('usage: pnpm preview:save <path, e.g. /digest/2026-10-28> <out.html> [--no-marker]');
  process.exit(2);
}

const outPath = resolve(out);
if (outPath.startsWith(resolve('.') + (process.platform === 'win32' ? '\\' : '/'))) {
  console.error('refusing to write a preview inside the repo (ADR 0003)');
  process.exit(2);
}

if (noMarker) delete process.env.LANE_MARKER;

const res = await createApp().request(path);
if (res.status !== 200) {
  console.error(`${path} answered ${res.status}`);
  process.exit(1);
}
const html = await res.text();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, 'utf8');
const marker = process.env.LANE_MARKER?.trim() || 'no marker set';
console.log(`saved ${path} -> ${outPath} (${html.length} chars, banner: ${marker})`);
