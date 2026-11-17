import { deflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, crc]);
}
for (const size of [192, 512]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size,
        ny = y / size;
      const distance = Math.hypot(nx - 0.49, ny - 0.51);
      const angle = Math.atan2(ny - 0.51, nx - 0.49);
      let color = [18, 63, 50];
      if (distance > 0.19 && distance < 0.29 && Math.abs(angle) > 0.65)
        color = [226, 239, 190];
      if (
        Math.abs(nx - 0.72) + Math.abs(ny - 0.25) < 0.075 ||
        (Math.abs(nx - 0.72) < 0.018 && Math.abs(ny - 0.25) < 0.1)
      )
        color = [231, 189, 101];
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      pixels.set([...color, 255], offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/icon-${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
