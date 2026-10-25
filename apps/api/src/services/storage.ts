import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';

/** Yerel dosya deposu. S3/MinIO adaptörü aynı arayüzü uygulayacak. */
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<{ key: string; url: string }>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
}

const IMAGE_SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

/** Dosya türünü uzantıya değil içerik imzasına göre belirler. */
export function sniffImage(data: Buffer): { mime: string; ext: string } | null {
  const hit = IMAGE_SIGNATURES.find((s) => data.length > 12 && s.test(data));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

/** PNG/JPEG boyutlarını başlıktan okur (doku boyutu kalite kontrolü için). */
export function imageSize(data: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png' && data.length > 24) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i < data.length - 9) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      const len = data.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

export class LocalStorage implements ObjectStorage {
  constructor(private root: string) {}

  private resolve(key: string): string {
    const safe = normalize(key).replace(/^([/\\])+/, '');
    if (safe.includes('..') || !/^[\w\-./\\]+$/.test(safe)) throw new Error('Geçersiz dosya anahtarı');
    return join(this.root, safe.split('/').join(sep));
  }

  async put(key: string, data: Buffer, contentType: string) {
    const file = this.resolve(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    await writeFile(`${file}.meta`, JSON.stringify({ contentType }));
    return { key, url: `/api/files/${key}` };
  }

  async get(key: string) {
    let file: string;
    try {
      file = this.resolve(key);
      await stat(file);
    } catch {
      return null;
    }
    const meta = JSON.parse(await readFile(`${file}.meta`, 'utf8').catch(() => '{}')) as { contentType?: string };
    return { data: await readFile(file), contentType: meta.contentType ?? 'application/octet-stream' };
  }
}

export const contentHash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
