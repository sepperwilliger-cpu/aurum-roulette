'use client';

const SIZE = 160;
const MAX_LEN = 55_000; // muss unter dem Server-Limit (60 000) bleiben

/**
 * Liest ein Bild aus der Galerie, schneidet es quadratisch (Mitte) zu, verkleinert auf 160×160
 * und komprimiert es als JPEG. Ergebnis: data:-URL von ca. 8–25 KB.
 */
export async function prepareAvatarImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei wählen.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Das Bild ist zu gross (max. 25 MB).');

  let source: ImageBitmap | HTMLImageElement;
  let w: number;
  let h: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    source = bmp;
    w = bmp.width;
    h = bmp.height;
  } catch {
    // Fallback für ältere Browser
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    } catch {
      throw new Error('Dieses Bildformat kann der Browser nicht öffnen (z. B. HEIC). Bitte JPG oder PNG wählen.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const side = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#16191f';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
  if ('close' in source) source.close();

  for (const q of [0.86, 0.75, 0.62, 0.5]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= MAX_LEN) return url;
  }
  throw new Error('Das Bild lässt sich nicht genug verkleinern.');
}

export const avatarUrl = (id: string, img: number | null | undefined) => (img ? `/avatar/${id}?v=${img}` : null);
