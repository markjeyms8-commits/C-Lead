const mimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export function validateFile(name: string, mime: string, bytes: Uint8Array) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (
    !name ||
    name.length > 160 ||
    /[/\\\r\n\x00]/.test(name) ||
    mimeByExtension[ext] !== mime ||
    bytes.length < 4 ||
    bytes.length > (mime.startsWith('image/') ? 5242880 : 10485760)
  )
    throw new Error('Invalid file');
  const starts = (signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  if (mime === 'image/jpeg') {
    if (!starts([255, 216, 255])) throw new Error('Invalid JPEG');
    return;
  }
  if (mime === 'image/png') {
    if (!starts([137, 80, 78, 71, 13, 10, 26, 10]))
      throw new Error('Invalid PNG');
    return;
  }
  const text = (start: number, end: number) =>
    new TextDecoder().decode(bytes.slice(start, end));
  if (mime === 'image/webp') {
    if (text(0, 4) !== 'RIFF' || text(8, 12) !== 'WEBP')
      throw new Error('Invalid WebP');
    return;
  }
  if (mime === 'application/pdf') {
    if (text(0, 5) !== '%PDF-') throw new Error('Invalid PDF');
    return;
  }
  if (!starts([80, 75, 3, 4])) throw new Error('Invalid Office file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('Invalid ZIP directory');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true),
    total = 0;
  const entries: string[] = [];
  if (count > 2000 || count === 0) throw new Error('Invalid ZIP entries');
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw new Error('Invalid ZIP entry');
    if (view.getUint16(offset + 8, true) & 1) throw new Error('Encrypted file');
    total += view.getUint32(offset + 24, true);
    if (total > 50 * 1024 * 1024) throw new Error('Expanded file too large');
    const length = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true);
    if (offset + 46 + length + extra + comment > bytes.length)
      throw new Error('Truncated ZIP');
    const path = text(offset + 46, offset + 46 + length);
    if (/(^|\/)\.\.($|\/)|vbaProject|\.(exe|js|vbs|ps1|bat|cmd)$/i.test(path))
      throw new Error('Unsupported embedded content');
    entries.push(path);
    offset += 46 + length + extra + comment;
  }
  const required =
    ext === 'docx'
      ? 'word/document.xml'
      : ext === 'pptx'
        ? 'ppt/presentation.xml'
        : 'xl/workbook.xml';
  if (!entries.includes('[Content_Types].xml') || !entries.includes(required))
    throw new Error('Office type mismatch');
}
export async function readFileBytes(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing file');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 10485760) {
      await reader.cancel();
      throw new Error('File too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
