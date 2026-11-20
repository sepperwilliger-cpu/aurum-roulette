/**
 * Prüfung hochgeladener Profilbilder. Akzeptiert nur kleine data:-URLs mit echtem
 * JPEG-, PNG- oder WebP-Inhalt (Magic Bytes werden geprüft). SVG/HTML sind ausgeschlossen,
 * damit über Bilder kein Skript eingeschleust werden kann.
 */
import { GameError } from './room';

/** Max. Länge der data:-URL (passt in eine Socket.IO-Nachricht; Client komprimiert auf ~10–30 KB). */
export const MAX_AVATAR_DATAURL = 60_000;

const PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export interface ParsedAvatar {
  mime: string;
  bytes: Buffer;
}

export function parseAvatarDataUrl(raw: string): ParsedAvatar | null {
  const m = PATTERN.exec(raw);
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  const type = m[1];
  const ok =
    (type === 'jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (type === 'png' && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (type === 'webp' && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP');
  return ok ? { mime: `image/${type}`, bytes } : null;
}

/** undefined = unverändert, null = entfernen, string = neues Bild (geprüft). */
export function validateAvatarInput(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') throw new GameError('Ungültiges Bild');
  if (raw.length > MAX_AVATAR_DATAURL) throw new GameError('Das Bild ist zu gross.');
  if (!parseAvatarDataUrl(raw)) throw new GameError('Bitte ein JPG-, PNG- oder WebP-Bild wählen.');
  return raw;
}
