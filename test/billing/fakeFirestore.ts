/**
 * Minimal in-memory Firestore used to run the REAL billing ledger and API
 * handlers under test (api/_billingLedger.ts, api/record-export.ts,
 * api/check-subscription.ts) with no network or emulator.
 *
 * It models only what those modules use, but models it faithfully where it
 * matters for correctness:
 *   - transaction reads see the state from BEFORE the transaction's own writes
 *   - writes are buffered and applied atomically at commit
 *   - create() fails on an existing document (the idempotency primitive)
 *   - set(..., {merge:true}) deep-merges plain objects, replaces arrays/Dates
 *   - queries support ==, >= and limit()
 * It is NOT a general emulator; test/browser/* runs against the real emulator.
 */
type Doc = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && Object.getPrototypeOf(v) === Object.prototype;

function deepMerge(target: Doc, patch: Doc): Doc {
  const out: Doc = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) throw new Error(`Firestore rejects undefined field "${key}"`);
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key] as Doc, value) : clone(value);
  }
  return out;
}

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (isPlainObject(value)) {
    const out: Doc = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) throw new Error(`Firestore rejects undefined field "${k}"`);
      out[k] = clone(v);
    }
    return out as T;
  }
  return value;
}

export class FakeDocRef {
  constructor(readonly db: FakeFirestore, readonly path: string) {}
  get id(): string { return this.path.split('/').pop()!; }
  collection(name: string): FakeCollectionRef { return new FakeCollectionRef(this.db, `${this.path}/${name}`); }
  async get(): Promise<FakeSnapshot> { return this.db.snapshot(this.path); }
}

export class FakeCollectionRef {
  constructor(readonly db: FakeFirestore, readonly path: string) {}
  doc(id: string): FakeDocRef { return new FakeDocRef(this.db, `${this.path}/${id}`); }
  where(field: string, op: string, value: unknown): FakeQuery { return new FakeQuery(this.db, this.path, [{ field, op, value }]); }
}

interface Filter { field: string; op: string; value: unknown }

export class FakeQuery {
  private max = Infinity;
  constructor(readonly db: FakeFirestore, readonly collectionPath: string, readonly filters: Filter[]) {}
  where(field: string, op: string, value: unknown): FakeQuery {
    const q = new FakeQuery(this.db, this.collectionPath, [...this.filters, { field, op, value }]);
    q.max = this.max;
    return q;
  }
  limit(n: number): FakeQuery { const q = new FakeQuery(this.db, this.collectionPath, this.filters); q.max = n; return q; }
  run(): FakeQuerySnapshot {
    const prefix = `${this.collectionPath}/`;
    const docs: FakeSnapshot[] = [];
    for (const [path, data] of this.db.docs) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
      if (!this.filters.every((f) => matches(data[f.field], f.op, f.value))) continue;
      docs.push(this.db.snapshot(path));
      if (docs.length >= this.max) break;
    }
    return { size: docs.length, docs, empty: docs.length === 0 };
  }
  async get(): Promise<FakeQuerySnapshot> { return this.run(); }
  count(): { get(): Promise<{ data(): { count: number } }> } {
    return { get: async () => ({ data: () => ({ count: this.run().size }) }) };
  }
}

function matches(actual: unknown, op: string, expected: unknown): boolean {
  if (op === '==') return JSON.stringify(actual) === JSON.stringify(expected);
  const num = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Number.NaN);
  if (op === '>=') return num(actual) >= num(expected);
  throw new Error(`FakeFirestore: unsupported operator ${op}`);
}

export interface FakeSnapshot { exists: boolean; id: string; data(): Doc | undefined }
export interface FakeQuerySnapshot { size: number; docs: FakeSnapshot[]; empty: boolean }

class FakeTransaction {
  private writes: Array<() => void> = [];
  constructor(private readonly db: FakeFirestore) {}
  async getAll(...refs: FakeDocRef[]): Promise<FakeSnapshot[]> { return refs.map((r) => this.db.snapshot(r.path)); }
  async get(target: FakeDocRef | FakeQuery): Promise<FakeSnapshot | FakeQuerySnapshot> {
    return target instanceof FakeQuery ? target.run() : this.db.snapshot(target.path);
  }
  create(ref: FakeDocRef, data: Doc): void {
    const cloned = clone(data);
    this.writes.push(() => {
      if (this.db.docs.has(ref.path)) throw new Error(`ALREADY_EXISTS: ${ref.path}`);
      this.db.docs.set(ref.path, cloned);
    });
  }
  set(ref: FakeDocRef, data: Doc, options?: { merge?: boolean }): void {
    const cloned = clone(data);
    this.writes.push(() => {
      const existing = this.db.docs.get(ref.path);
      this.db.docs.set(ref.path, options?.merge && existing ? deepMerge(existing, cloned) : cloned);
    });
  }
  update(ref: FakeDocRef, data: Doc): void {
    const cloned = clone(data);
    this.writes.push(() => {
      const existing = this.db.docs.get(ref.path);
      if (!existing) throw new Error(`NOT_FOUND: ${ref.path}`);
      this.db.docs.set(ref.path, { ...existing, ...cloned });
    });
  }
  commit(): void { this.writes.forEach((w) => w()); }
}

export class FakeFirestore {
  readonly docs = new Map<string, Doc>();
  collection(path: string): FakeCollectionRef { return new FakeCollectionRef(this, path); }
  doc(path: string): FakeDocRef { return new FakeDocRef(this, path); }
  snapshot(path: string): FakeSnapshot {
    const data = this.docs.get(path);
    return { exists: data !== undefined, id: path.split('/').pop()!, data: () => (data ? clone(data) : undefined) };
  }
  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    const tx = new FakeTransaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }
  /** Test helper: seed or read a document directly. */
  seed(path: string, data: Doc): void { this.docs.set(path, clone(data)); }
  read(path: string): Doc | undefined { const d = this.docs.get(path); return d ? clone(d) : undefined; }
}
