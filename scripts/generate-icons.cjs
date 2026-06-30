const fs = require('fs');
const { createCanvas } = require('canvas');

function generateIcon(size, filename, borderRadius = 0) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#7C6EF0';
  if (borderRadius > 0) {
    ctx.beginPath();
    ctx.moveTo(borderRadius, 0);
    ctx.lineTo(size - borderRadius, 0);
    ctx.quadraticCurveTo(size, 0, size, borderRadius);
    ctx.lineTo(size, size - borderRadius);
    ctx.quadraticCurveTo(size, size, size - borderRadius, size);
    ctx.lineTo(borderRadius, size);
    ctx.quadraticCurveTo(0, size, 0, size - borderRadius);
    ctx.lineTo(0, borderRadius);
    ctx.quadraticCurveTo(0, 0, borderRadius, 0);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, size, size);
  }

  // Text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${size * 0.6}px sans-serif`;
  ctx.fillText('F', size / 2, size / 2);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`./public/${filename}`, buffer);
  console.log(`Generated ${filename}`);
}

generateIcon(32, 'favicon.png', 8);
generateIcon(192, 'icon-192.png', 48);
generateIcon(512, 'icon-512.png', 128);
