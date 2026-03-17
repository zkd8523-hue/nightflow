import sharp from 'sharp';
import { readFileSync } from 'fs';

const svgBuffer = readFileSync('./public/app-icon.svg');

await sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile('/Users/gimmingi/Desktop/app-icon.png');

console.log('✅ PNG saved to Desktop/app-icon.png');
