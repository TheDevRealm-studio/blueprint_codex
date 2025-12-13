export type AssetBlobLoader = (assetId: string) => Promise<Blob | null>;

type CacheEntry = {
  url?: string;
  refCount: number;
  lastUsed: number;
  pending?: Promise<string>;
  revokeTimer?: ReturnType<typeof setTimeout>;
};

const entries = new Map<string, CacheEntry>();

const DEFAULT_IDLE_REVOKE_MS = 30_000;
const MAX_IDLE_ENTRIES = 200;

function isObjectUrl(url: string | undefined): boolean {
  return typeof url === 'string' && url.startsWith('blob:');
}

function evictIfNeeded() {
  // Evict only entries that are not in-use.
  if (entries.size <= MAX_IDLE_ENTRIES) return;

  const idleEntries: Array<[string, CacheEntry]> = [];
  for (const pair of entries.entries()) {
    if (pair[1].refCount <= 0 && pair[1].url) idleEntries.push(pair);
  }

  idleEntries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

  const overflow = entries.size - MAX_IDLE_ENTRIES;
  for (let i = 0; i < overflow && i < idleEntries.length; i++) {
    const tuple = idleEntries[i];
    if (!tuple) continue;
    const [assetId, entry] = tuple;
    if (entry.revokeTimer) clearTimeout(entry.revokeTimer);
    if (isObjectUrl(entry.url)) URL.revokeObjectURL(entry.url!);
    entries.delete(assetId);
  }
}

export async function acquireAssetObjectUrl(
  assetId: string,
  loadAsset: AssetBlobLoader,
  _opts?: { idleRevokeMs?: number }
): Promise<string> {
  let entry = entries.get(assetId);
  if (!entry) {
    entry = { refCount: 0, lastUsed: Date.now() };
    entries.set(assetId, entry);
  }

  entry.refCount += 1;
  entry.lastUsed = Date.now();

  if (entry.revokeTimer) {
    clearTimeout(entry.revokeTimer);
    entry.revokeTimer = undefined;
  }

  if (entry.url) return entry.url;
  if (entry.pending) return entry.pending;

  entry.pending = (async () => {
    try {
      const blob = await loadAsset(assetId);
      if (!blob) return '';
      const url = URL.createObjectURL(blob);
      entry!.url = url;
      entry!.lastUsed = Date.now();
      return url;
    } finally {
      entry!.pending = undefined;
      evictIfNeeded();
    }
  })();

  return entry.pending;
}

export function releaseAssetObjectUrl(assetId: string, opts?: { idleRevokeMs?: number }) {
  const idleRevokeMs = opts?.idleRevokeMs ?? DEFAULT_IDLE_REVOKE_MS;
  const entry = entries.get(assetId);
  if (!entry) return;

  entry.refCount = Math.max(0, entry.refCount - 1);
  entry.lastUsed = Date.now();

  if (entry.refCount > 0) return;
  if (!entry.url) {
    // Nothing to revoke; keep entry around briefly in case a pending load resolves.
    return;
  }

  if (entry.revokeTimer) clearTimeout(entry.revokeTimer);
  entry.revokeTimer = setTimeout(() => {
    const current = entries.get(assetId);
    if (!current || current.refCount > 0) return;

    if (isObjectUrl(current.url)) URL.revokeObjectURL(current.url!);
    entries.delete(assetId);
  }, idleRevokeMs);
}

export function clearAllAssetObjectUrls() {
  for (const [assetId, entry] of entries.entries()) {
    if (entry.revokeTimer) clearTimeout(entry.revokeTimer);
    if (isObjectUrl(entry.url)) URL.revokeObjectURL(entry.url!);
    entries.delete(assetId);
  }
}
