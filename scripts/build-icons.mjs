import sharp from 'sharp';
import fs from 'fs';

const src = 'public/icon-omninet.svg';
const outDir = 'public/icons';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function makePng(name, size, maskable=false) {
  const svg = fs.readFileSync(src);
  // For maskable, add safe padding so Android can crop
  const pad = maskable ? Math.round(size * 0.12) : 0;
  const s = size - pad*2;
  // Render SVG onto a transparent canvas, centered
  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: { r:0, g:0, b:0, alpha:0 } }
  })
  .composite([{ input: await sharp(svg).resize(s, s).toBuffer(), left: pad, top: pad }])
  .png()
  .toBuffer();
  fs.writeFileSync(`${outDir}/${name}-${size}.png`, png);
}

await makePng('icon', 192);
await makePng('icon', 512);
await makePng('maskable', 192, true);
await makePng('maskable', 512, true);
await makePng('apple-touch-icon', 180); // iOS uses 180x180
console.log('✅ Icons generated into /public/icons');
