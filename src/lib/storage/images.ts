/** Buckets created in migration 0007. Public buckets are served by URL; private ones need signed URLs. */
export type PublicBucket = 'avatars' | 'business-media' | 'vehicle-images' | 'part-images';
export type PrivateBucket = 'vehicle-documents' | 'verification';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

/** Largest photo a user may pick before we shrink it (matches common phone cameras). */
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
/** Hard limits enforced by the storage buckets. */
export const MAX_VEHICLE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function publicStorageUrl(bucket: PublicBucket, path: string | null | undefined): string | null {
  if (!path) return null;
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/+$/, '');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

export type FileCheck = { ok: true } | { ok: false; error: string };

export function checkImageFile(file: { type: string; size: number; name: string }): FileCheck {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: `${file.name}: use a JPG, PNG or WebP photo.` };
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return { ok: false, error: `${file.name}: this photo is too large (max 25 MB).` };
  }
  return { ok: true };
}

export function checkDocumentFile(file: { type: string; size: number; name: string }): FileCheck {
  if (!(DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: `${file.name}: use a PDF or a photo (JPG, PNG, WebP).` };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: `${file.name}: documents must be 10 MB or smaller.` };
  }
  return { ok: true };
}

/** Random, unguessable file name in the user's own folder: "<userId>/<scope>/<uuid>.<ext>". */
export function storagePath(userId: string, scope: string, extension: string): string {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, '');
  const ext = extension.replace(/[^a-z0-9]/g, '') || 'bin';
  return `${userId}/${safeScope}/${crypto.randomUUID()}.${ext}`;
}

export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'application/pdf': return 'pdf';
    default: return 'bin';
  }
}

/** Longest side, in pixels, of photos we store. Big enough for full-screen, small on mobile data. */
export const PHOTO_MAX_DIMENSION = 1600;

/** Decodes a photo, trying the fast path first and a plain <img> element as a fallback (older browsers, huge photos). */
async function decodeImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    for (const options of [{ imageOrientation: 'from-image' } as ImageBitmapOptions, undefined]) {
      try {
        const bitmap = options ? await createImageBitmap(file, options) : await createImageBitmap(file);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
      } catch {
        /* try the next strategy */
      }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('this photo couldn’t be read. Try a different photo or take a screenshot of it.');
  }
}

/**
 * Shrinks a photo in the browser before upload: at most 1600px on the long
 * side, re-encoded as JPEG. Redrawing onto a canvas also strips EXIF metadata
 * (including GPS location), so the original file is never returned — if the
 * photo can't be re-encoded this throws instead of uploading it as-is.
 */
export async function compressPhoto(file: File, maxDimension = PHOTO_MAX_DIMENSION, quality = 0.82): Promise<Blob> {
  const decoded = await decodeImage(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('your browser couldn’t process this photo.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('this photo couldn’t be processed. Try a smaller photo.');
    return blob;
  } finally {
    decoded.release();
  }
}
