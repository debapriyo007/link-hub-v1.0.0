export function getUserInitials(displayName?: string, email?: string): string {
  const cleanName = (displayName || '').trim();
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  }
  const cleanEmail = (email || '').trim();
  if (cleanEmail) {
    return cleanEmail.slice(0, 2).toUpperCase();
  }
  return 'U';
}

export function formatNavbarUserName(
  displayName?: string,
  firstName?: string,
  email?: string
): string {
  const preferred = (firstName || '').trim() || (displayName || '').trim();
  if (preferred) {
    const tokens = preferred.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      return tokens[0];
    }
    // Keep up to two words when short (e.g., "Alex Dev"), otherwise first name
    const twoWords = `${tokens[0]} ${tokens[1]}`;
    return twoWords.length <= 16 ? twoWords : tokens[0];
  }
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  return 'Account';
}

export const MAX_AVATAR_URL_LENGTH = 32768;

/**
 * Center-crops and compresses an uploaded image file to a compact data URL
 * suitable for immediate navbar rendering and Firestore user profile sync.
 */
export async function compressAvatarFile(
  file: File,
  maxSizePx = 128
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, or WebP).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image must be smaller than 10 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image.'));
      el.src = objectUrl;
    });

    const renderSquare = (dim: number, mime: string, quality: number): string => {
      const canvas = document.createElement('canvas');
      canvas.width = dim;
      canvas.height = dim;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Image processing is unavailable in this browser.');
      }
      const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
      const sx = Math.max(0, Math.floor(((img.naturalWidth || img.width) - side) / 2));
      const sy = Math.max(0, Math.floor(((img.naturalHeight || img.height) - side) / 2));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, dim, dim);
      return canvas.toDataURL(mime, quality);
    };

    const attempts: Array<[number, string, number]> = [
      [maxSizePx, 'image/webp', 0.82],
      [maxSizePx, 'image/jpeg', 0.8],
      [96, 'image/jpeg', 0.72],
      [80, 'image/jpeg', 0.65],
    ];

    for (const [dim, mime, quality] of attempts) {
      const dataUrl = renderSquare(dim, mime, quality);
      if (dataUrl.length <= MAX_AVATAR_URL_LENGTH) {
        return dataUrl;
      }
    }

    throw new Error('Image is too complex to compress cleanly. Try a simpler photo.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
