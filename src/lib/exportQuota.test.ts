import { describe, expect, it } from 'vitest';
import {
  GUEST_COUNT_KEY,
  guestExportsRemaining,
  readGuestExportCount,
  recordGuestExport,
  shouldRecordExport,
} from './exportQuota';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** Storage whose setItem always throws — simulates private mode / quota exceeded. */
class BlockedWriteStorage extends MemoryStorage {
  setItem(): void {
    throw new Error('storage blocked');
  }
}

/** Storage whose accessors always throw — simulates storage access denied. */
class BlockedReadStorage {
  getItem(): string | null {
    throw new Error('storage blocked');
  }
  setItem(): void {
    throw new Error('storage blocked');
  }
}

describe('exportQuota — guest export counting', () => {
  it('starts at zero for fresh storage and for missing storage', () => {
    expect(readGuestExportCount(new MemoryStorage())).toBe(0);
    expect(readGuestExportCount(null)).toBe(0);
  });

  it('ignores corrupt counts', () => {
    const storage = new MemoryStorage();
    storage.setItem(GUEST_COUNT_KEY, 'not-a-number');
    expect(readGuestExportCount(storage)).toBe(0);
    storage.setItem(GUEST_COUNT_KEY, '-4');
    expect(readGuestExportCount(storage)).toBe(0);
  });

  it('counting one export decrements the remaining allowance', () => {
    const storage = new MemoryStorage();
    expect(guestExportsRemaining(storage, 1)).toBe(1);
    recordGuestExport(storage, 'export-1');
    expect(guestExportsRemaining(storage, 1)).toBe(0);
  });

  it('exhausted allowance never goes negative', () => {
    const storage = new MemoryStorage();
    storage.setItem(GUEST_COUNT_KEY, '5');
    expect(guestExportsRemaining(storage, 1)).toBe(0);
  });

  it('repeated callbacks with the same exportId never double count', () => {
    const storage = new MemoryStorage();
    expect(recordGuestExport(storage, 'export-1')).toBe(1);
    expect(recordGuestExport(storage, 'export-1')).toBe(1); // re-fired download effect
    expect(recordGuestExport(storage, 'export-1')).toBe(1);
    expect(guestExportsRemaining(storage, 1)).toBe(0);
  });

  it('a genuinely new export increments the count', () => {
    const storage = new MemoryStorage();
    recordGuestExport(storage, 'export-1');
    expect(recordGuestExport(storage, 'export-2')).toBe(2);
  });

  it('missing storage is treated as uncounted and never throws', () => {
    expect(recordGuestExport(null, 'export-1')).toBe(0);
    expect(guestExportsRemaining(null, 1)).toBe(1);
  });

  it('storage that throws on write does not count and does not throw', () => {
    const storage = new BlockedWriteStorage();
    expect(recordGuestExport(storage, 'export-1')).toBe(0);
  });

  it('storage that throws on read is treated as uncounted', () => {
    const storage = new BlockedReadStorage();
    expect(readGuestExportCount(storage)).toBe(0);
    expect(recordGuestExport(storage, 'export-1')).toBe(0);
    expect(guestExportsRemaining(storage, 1)).toBe(1);
  });
});

describe('exportQuota — quota policy invariant', () => {
  it('only a completed render with output consumes allowance', () => {
    expect(shouldRecordExport('done', true)).toBe(true);
    expect(shouldRecordExport('done', false)).toBe(false);
  });

  it('cancelled and failed renders never consume allowance', () => {
    expect(shouldRecordExport('error', true)).toBe(false);
    expect(shouldRecordExport('cancelled', true)).toBe(false);
    expect(shouldRecordExport('idle', true)).toBe(false);
    expect(shouldRecordExport('processing', true)).toBe(false);
  });

  it('missing phase information never consumes allowance', () => {
    expect(shouldRecordExport(null, true)).toBe(false);
    expect(shouldRecordExport(undefined, true)).toBe(false);
  });
});