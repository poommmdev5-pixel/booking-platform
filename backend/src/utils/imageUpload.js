const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');
const config = require('../config');
const { badRequest } = require('./httpError');

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Minimal magic-byte sniffer so uploads are validated by real content, not just the
// client-supplied extension/MIME type.
function detectImageMime(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function processEntityImage(kind, entityId, buffer) {
  if (buffer.length > MAX_BYTES) throw badRequest('Image exceeds 10MB limit');
  const mime = detectImageMime(buffer);
  if (!mime || !ALLOWED_MIME.has(mime)) throw badRequest('File is not a valid JPEG/PNG/WebP image');

  const dir = path.join(config.uploadsDir, kind, String(entityId));
  await fs.mkdir(dir, { recursive: true });
  const id = randomUUID();

  const variants = [
    ['urlThumbnail', 300],
    ['urlMedium', 800],
    ['urlOriginal', 1920],
  ];

  const result = {};
  for (const [key, width] of variants) {
    const filename = `${id}-${width}.webp`;
    await sharp(buffer).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(dir, filename));
    result[key] = `/uploads/${kind}/${entityId}/${filename}`;
  }
  return result;
}

const processProductImage = (productId, buffer) => processEntityImage('products', productId, buffer);
const processExtraImage = (extraId, buffer) => processEntityImage('extras', extraId, buffer);
const processEmployeeImage = (employeeId, buffer) => processEntityImage('employees', employeeId, buffer);

module.exports = { processProductImage, processExtraImage, processEmployeeImage };
