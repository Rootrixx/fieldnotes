const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'assets/fieldnote-source.png');
const brandYellow = '#f1be29';

function hexToRgba(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
    255,
  ];
}

function createCanvas(width, height, fill = [0, 0, 0, 0]) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      png.data[index] = fill[0];
      png.data[index + 1] = fill[1];
      png.data[index + 2] = fill[2];
      png.data[index + 3] = fill[3];
    }
  }
  return png;
}

function getPixel(png, x, y) {
  const index = (png.width * y + x) << 2;
  return [
    png.data[index],
    png.data[index + 1],
    png.data[index + 2],
    png.data[index + 3],
  ];
}

function setPixel(png, x, y, rgba) {
  const index = (png.width * y + x) << 2;
  png.data[index] = rgba[0];
  png.data[index + 1] = rgba[1];
  png.data[index + 2] = rgba[2];
  png.data[index + 3] = rgba[3];
}

function cropToLogo(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const [r, g, b, a] = getPixel(png, x, y);
      const isOuterBlack = a > 0 && r < 6 && g < 6 && b < 6;
      if (a > 0 && !isOuterBlack) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const padding = 0;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(png.width - 1, maxX + padding);
  maxY = Math.min(png.height - 1, maxY + padding);

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const output = createCanvas(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(output, x, y, getPixel(png, minX + x, minY + y));
    }
  }
  return output;
}

function sampleBilinear(source, x, y) {
  const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(source.width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(source.height - 1, y0 + 1));
  const tx = x - x0;
  const ty = y - y0;
  const p00 = getPixel(source, x0, y0);
  const p10 = getPixel(source, x1, y0);
  const p01 = getPixel(source, x0, y1);
  const p11 = getPixel(source, x1, y1);

  return [0, 1, 2, 3].map((channel) => {
    const top = p00[channel] * (1 - tx) + p10[channel] * tx;
    const bottom = p01[channel] * (1 - tx) + p11[channel] * tx;
    return Math.round(top * (1 - ty) + bottom * ty);
  });
}

function resize(source, width, height) {
  const output = createCanvas(width, height);
  const scaleX = source.width / width;
  const scaleY = source.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(output, x, y, sampleBilinear(source, (x + 0.5) * scaleX - 0.5, (y + 0.5) * scaleY - 0.5));
    }
  }
  return output;
}

function fitOnCanvas(source, size, scale = 1, background = null) {
  const fill = background ? hexToRgba(background) : [0, 0, 0, 0];
  const output = createCanvas(size, size, fill);
  const fittedSize = Math.round(size * scale);
  const fitted = resize(source, fittedSize, fittedSize);
  const offset = Math.round((size - fittedSize) / 2);

  for (let y = 0; y < fittedSize; y += 1) {
    for (let x = 0; x < fittedSize; x += 1) {
      setPixel(output, offset + x, offset + y, getPixel(fitted, x, y));
    }
  }
  return output;
}

function writePng(relativePath, png) {
  const outputPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, PNG.sync.write(png));
}

const source = cropToLogo(PNG.sync.read(fs.readFileSync(sourcePath)));

writePng('assets/icon.png', fitOnCanvas(source, 1024, 1, brandYellow));
writePng('assets/adaptive-icon.png', fitOnCanvas(source, 1024, 0.72));
writePng('assets/splash-icon.png', fitOnCanvas(source, 1024, 0.78));
writePng('assets/favicon.png', fitOnCanvas(source, 48, 1, brandYellow));

writePng('ios/FieldNotes/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png', fitOnCanvas(source, 1024, 1, brandYellow));
for (const name of ['image.png', 'image@2x.png', 'image@3x.png']) {
  writePng(`ios/FieldNotes/Images.xcassets/SplashScreenLegacy.imageset/${name}`, fitOnCanvas(source, 1024, 0.78));
}

const androidScales = [
  ['mipmap-mdpi', 48, 108],
  ['mipmap-hdpi', 72, 162],
  ['mipmap-xhdpi', 96, 216],
  ['mipmap-xxhdpi', 144, 324],
  ['mipmap-xxxhdpi', 192, 432],
];

for (const [folder, iconSize, foregroundSize] of androidScales) {
  writePng(`android/app/src/main/res/${folder}/ic_launcher.webp`, fitOnCanvas(source, iconSize, 1, brandYellow));
  writePng(`android/app/src/main/res/${folder}/ic_launcher_round.webp`, fitOnCanvas(source, iconSize, 1, brandYellow));
  writePng(`android/app/src/main/res/${folder}/ic_launcher_foreground.webp`, fitOnCanvas(source, foregroundSize, 0.72));
}

const splashScales = [
  ['drawable-mdpi', 288],
  ['drawable-hdpi', 432],
  ['drawable-xhdpi', 576],
  ['drawable-xxhdpi', 864],
  ['drawable-xxxhdpi', 1152],
];

for (const [folder, size] of splashScales) {
  writePng(`android/app/src/main/res/${folder}/splashscreen_logo.png`, fitOnCanvas(source, size, 0.78));
}

console.log(`Generated FieldNote assets from ${sourcePath}.`);
