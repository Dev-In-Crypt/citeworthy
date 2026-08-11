/**
 * Контракт хранилища файлов. Реализации живут в приложениях (I/O за границей core):
 * локальный диск для разработки, S3-совместимое хранилище в проде.
 * Сюда складываются логотипы агентств, raw-ответы платформ (T17) и PDF отчётов (T53).
 */
export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

export interface StorageAdapter {
  /** Кладёт объект и возвращает публичный путь для отдачи. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export interface UploadValidationResult {
  ok: boolean;
  error?: string;
}

/** Чистая валидация загружаемого логотипа — тестируется без файловой системы. */
export function validateLogoUpload(contentType: string, byteLength: number): UploadValidationResult {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return { ok: false, error: "Use a PNG, JPEG, WebP or SVG image." };
  }
  if (byteLength <= 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (byteLength > MAX_LOGO_BYTES) {
    return { ok: false, error: "Keep the logo under 2 MB." };
  }
  return { ok: true };
}

/** Ключ объекта всегда несёт agencyId — файлы разных тенантов не пересекаются. */
export function logoKey(agencyId: string, extension: string): string {
  return `agencies/${agencyId}/logo.${extension}`;
}
