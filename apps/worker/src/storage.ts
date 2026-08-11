import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StorageAdapter, StoredObject } from "@repo/core/storage/types";

/**
 * Локальное хранилище воркера. Намеренно дублирует реализацию из apps/web:
 * интерфейс общий (`@repo/core/storage/types`), а сама реализация — I/O,
 * которому нельзя жить в core. Обе схлопнутся в один S3-адаптер при выходе в прод.
 */
class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    const target = resolve(this.root, key);
    if (!target.startsWith(resolve(this.root))) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    await writeFile(`${path}.meta`, contentType, "utf8");
    return `/api/files/${key}`;
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const [bytes, contentType] = await Promise.all([
        readFile(this.pathFor(key)),
        readFile(`${this.pathFor(key)}.meta`, "utf8").catch(() => "application/octet-stream"),
      ]);
      return { bytes: new Uint8Array(bytes), contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
    await rm(`${this.pathFor(key)}.meta`, { force: true });
  }
}

const storageRoot = process.env.STORAGE_DIR ?? join(process.cwd(), "..", "..", ".storage");

export const storage: StorageAdapter = new LocalDiskStorage(storageRoot);

/** Ключ сырого ответа: по прогону, чтобы переобработка парсером шла пачкой (инвариант 6). */
export function rawResponseKey(runId: string, responseId: string): string {
  return `runs/${runId}/${responseId}.txt`;
}
