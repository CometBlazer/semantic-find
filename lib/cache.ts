// ============================================================
// lib/cache.ts
// ============================================================
// IndexedDB cache for computed chunk embeddings.
//
// Why IndexedDB and not localStorage?
//   - localStorage is string-only and capped around 5 MB;
//   - IndexedDB stores ArrayBuffers natively (structured clone),
//     so Float32Arrays round-trip without JSON bloat.
//
// Cache key = modelId + a hash of the full document text, so:
//   - switching models re-indexes,
//   - editing the document re-indexes,
//   - otherwise a reload skips embedding entirely.
//
// Raw IndexedDB is callback-based; the tiny helpers below wrap
// the three requests we need in promises. No library required.
// ============================================================

const DB_NAME = "semantic-find";
const DB_VERSION = 1;
const STORE = "embeddings";

interface CachedEmbeddings {
  key: string;
  dims: number;
  count: number;
  /** All vectors concatenated into one buffer: count × dims floats. */
  data: ArrayBuffer;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Load cached vectors for this (model, document) pair, or null. */
export async function loadEmbeddings(
  key: string
): Promise<Float32Array[] | null> {
  try {
    const db = await openDb();
    const record = await new Promise<CachedEmbeddings | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as CachedEmbeddings);
        req.onerror = () => reject(req.error);
      }
    );
    db.close();
    if (!record) return null;

    // Re-slice the flat buffer back into per-chunk vectors.
    const flat = new Float32Array(record.data);
    const vectors: Float32Array[] = [];
    for (let i = 0; i < record.count; i++) {
      vectors.push(flat.slice(i * record.dims, (i + 1) * record.dims));
    }
    return vectors;
  } catch (err) {
    console.warn("[cache] load failed (continuing without cache):", err);
    return null;
  }
}

/** Persist vectors as one flat Float32Array buffer. */
export async function saveEmbeddings(
  key: string,
  vectors: Float32Array[]
): Promise<void> {
  if (vectors.length === 0) return;
  try {
    const dims = vectors[0].length;
    const flat = new Float32Array(vectors.length * dims);
    vectors.forEach((v, i) => flat.set(v, i * dims));

    const record: CachedEmbeddings = {
      key,
      dims,
      count: vectors.length,
      data: flat.buffer,
      createdAt: Date.now(),
    };

    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    // Cache failures are never fatal — search still works in memory.
    console.warn("[cache] save failed:", err);
  }
}
