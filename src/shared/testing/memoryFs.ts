/**
 * In-memory implementation of a subset of the File System Access API.
 *
 * Intended only as a test double for FileStorageAdapter / fsAtomic tests.
 * It does NOT touch the real filesystem and does NOT aim for spec-complete
 * fidelity beyond the surface the production code uses.
 *
 * Key behaviors:
 *  - Writable file streams buffer writes and commit atomically on close();
 *    the parent file's content is NOT mutated until close() succeeds.
 *  - abort() discards the buffer and leaves the file unchanged.
 *  - Errors use the same DOMException names as the real API
 *    (NotFoundError, TypeMismatchError, InvalidModificationError, ...).
 */

// ---------- DOMException helpers ----------

function makeError(name: string, message?: string): DOMException {
  return new DOMException(message ?? name, name);
}

// ---------- Exported type aliases (declared first, assigned to classes below) ----------

export type MemoryDirectoryHandle = InstanceType<typeof MemoryDirectoryHandleImpl>;
export type MemoryFileHandle = InstanceType<typeof MemoryFileHandleImpl>;
export type MemoryWritableFileStream = InstanceType<typeof MemoryWritableFileStreamImpl>;

// ---------- Content buffer ----------

type WriteChunk = string | BufferSource | Blob;

/** Accumulates write chunks into a single contiguous Uint8Array snapshot. */
class ContentBuffer {
  private chunks: Uint8Array[] = [];
  private byteLength = 0;

  write(chunk: WriteChunk): void {
    const bytes = toBytes(chunk);
    this.chunks.push(bytes);
    this.byteLength += bytes.byteLength;
  }

  snapshot(): Uint8Array {
    if (this.chunks.length === 0) return new Uint8Array(0);
    if (this.chunks.length === 1) return this.chunks[0];
    const out = new Uint8Array(this.byteLength);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    this.chunks = [out];
    return out;
  }

  get text(): string {
    return new TextDecoder().decode(this.snapshot());
  }

  get size(): number {
    return this.byteLength;
  }
}

function toBytes(chunk: WriteChunk): Uint8Array {
  if (typeof chunk === 'string') {
    return new TextEncoder().encode(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return new Uint8Array(chunk);
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(new Uint8Array(chunk));
  }
  if (ArrayBuffer.isView(chunk)) {
    const view = chunk as ArrayBufferView;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  if (chunk instanceof Blob) {
    throw new Error('Blob chunks require async reading; use write(await blob.arrayBuffer()) instead in tests');
  }
  return new TextEncoder().encode(String(chunk));
}

// ---------- Writable file stream ----------

type ClosedState = 'open' | 'closed' | 'aborted';

class MemoryWritableFileStreamImpl {
  private buffer = new ContentBuffer();
  private state: ClosedState = 'open';

  constructor(private readonly file: MemoryFileHandleImpl) {}

  private ensureOpen(): void {
    if (this.state !== 'open') {
      throw makeError('InvalidStateError', 'Cannot operate on a closed writable stream');
    }
  }

  async write(data: unknown): Promise<void> {
    this.ensureOpen();
    if (typeof data === 'string' || data instanceof ArrayBuffer || ArrayBuffer.isView(data) || (typeof Blob !== 'undefined' && data instanceof Blob)) {
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        this.buffer.write(new Uint8Array(await data.arrayBuffer()));
      } else {
        this.buffer.write(data as WriteChunk);
      }
      return;
    }
    if (data && typeof data === 'object') {
      const params = data as { type?: string; data?: unknown; position?: number; size?: number };
      if (params.type === 'write' && params.data !== undefined) {
        return this.write(params.data);
      }
      if (params.type === 'seek' || params.type === 'truncate') {
        return;
      }
    }
    throw makeError('NotAllowedError', 'Unsupported write chunk type');
  }

  async seek(_position: number): Promise<void> {
    this.ensureOpen();
  }

  async truncate(_size: number): Promise<void> {
    this.ensureOpen();
  }

  async close(): Promise<void> {
    if (this.state !== 'open') return;
    this.state = 'closed';
    this.file.commitFrom(this.buffer);
  }

  async abort(): Promise<void> {
    if (this.state !== 'open') return;
    this.state = 'aborted';
    this.buffer = new ContentBuffer();
  }

  get locked(): boolean {
    return false;
  }

  getWriter(): any {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      write: (d: unknown) => self.write(d),
      close: () => self.close(),
      abort: () => self.abort(),
      releaseLock() {},
      closed: Promise.resolve(),
      ready: Promise.resolve(),
      desiredSize: 1,
    };
  }
}

// ---------- Base handle ----------

let handleCounter = 0;

abstract class MemoryBaseHandle {
  public readonly id = ++handleCounter;
  abstract readonly kind: 'file' | 'directory';
  public name: string;
  public parent: MemoryDirectoryHandleImpl | null = null;

  constructor(name: string) {
    this.name = name;
  }

  async isSameEntry(other: { kind: string; name: string }): Promise<boolean> {
    return other === (this as unknown as MemoryBaseHandle);
  }
}

// ---------- File handle ----------

class MemoryFileHandleImpl extends MemoryBaseHandle {
  readonly kind = 'file' as const;
  private content = new ContentBuffer();

  constructor(name: string) {
    super(name);
  }

  async getFile(): Promise<File> {
    const bytes = new Uint8Array(this.content.snapshot());
    return new File([bytes], this.name, { type: '' });
  }

  async createWritable(_options?: { keepExistingData?: boolean }): Promise<MemoryWritableFileStreamImpl> {
    return new MemoryWritableFileStreamImpl(this);
  }

  async remove(): Promise<void> {
    if (this.parent) {
      this.parent.removeChild(this.name);
      this.parent = null;
    }
  }

  async move(targetDirOrName: MemoryDirectoryHandle | string, maybeName?: string): Promise<void> {
    let targetDir: MemoryDirectoryHandle | null;
    let newName: string;
    if (typeof targetDirOrName === 'string') {
      targetDir = this.parent;
      newName = targetDirOrName;
    } else {
      targetDir = targetDirOrName;
      newName = typeof maybeName === 'string' ? maybeName : this.name;
    }
    if (!targetDir) {
      throw makeError('NotFoundError', 'Cannot move: file has no parent directory');
    }
    if (targetDir === this.parent && newName === this.name) return;

    const existing = targetDir.getChildOptional(newName);
    if (existing && existing !== this) {
      if (existing.kind === 'directory') {
        throw makeError('TypeMismatchError', `Name ${newName} is a directory`);
      }
      targetDir.removeChild(newName);
    }

    if (this.parent && this.parent !== targetDir) {
      this.parent.removeChild(this.name);
    } else if (this.parent === targetDir && newName !== this.name) {
      this.parent.removeChild(this.name);
    }

    this.name = newName;
    targetDir.appendChild(this);
    this.parent = targetDir;
  }

  commitFrom(buffer: ContentBuffer): void {
    this.content = buffer;
  }
}

// ---------- Directory handle ----------

class MemoryDirectoryHandleImpl extends MemoryBaseHandle {
  readonly kind = 'directory' as const;
  private readonly children = new Map<string, MemoryBaseHandle>();

  constructor(name: string) {
    super(name);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFileHandleImpl> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'file') {
        throw makeError('TypeMismatchError', `Path ${name} is a directory`);
      }
      return existing as MemoryFileHandleImpl;
    }
    if (!options?.create) {
      throw makeError('NotFoundError', `File ${name} not found`);
    }
    const fh = new MemoryFileHandleImpl(name);
    fh.parent = this;
    this.children.set(name, fh);
    return fh;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectoryHandleImpl> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'directory') {
        throw makeError('TypeMismatchError', `Path ${name} is a file`);
      }
      return existing as MemoryDirectoryHandleImpl;
    }
    if (!options?.create) {
      throw makeError('NotFoundError', `Directory ${name} not found`);
    }
    const dh = new MemoryDirectoryHandleImpl(name);
    dh.parent = this;
    this.children.set(name, dh);
    return dh;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const child = this.children.get(name);
    if (!child) {
      throw makeError('NotFoundError', `Entry ${name} not found`);
    }
    if (child.kind === 'directory') {
      const dir = child as MemoryDirectoryHandle;
      if (!options?.recursive && (dir as MemoryDirectoryHandleImpl).childrenSize > 0) {
        throw makeError('InvalidModificationError', `Directory ${name} is not empty`);
      }
    }
    this.children.delete(name);
    child.parent = null;
  }

  async *entries(): AsyncIterableIterator<[string, MemoryFileHandleImpl | MemoryDirectoryHandleImpl]> {
    for (const [name, handle] of this.children) {
      yield [name, handle as MemoryFileHandleImpl | MemoryDirectoryHandleImpl];
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    for (const name of this.children.keys()) {
      yield name;
    }
  }

  async *values(): AsyncIterableIterator<MemoryFileHandleImpl | MemoryDirectoryHandleImpl> {
    for (const handle of this.children.values()) {
      yield handle as MemoryFileHandleImpl | MemoryDirectoryHandleImpl;
    }
  }

  async resolve(possibleDescendant: MemoryBaseHandle): Promise<string[] | null> {
    const path: string[] = [];
    let cur: MemoryBaseHandle | null = possibleDescendant;
    const seen = new Set<MemoryBaseHandle>();
    while (cur && cur !== this) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      path.unshift(cur.name);
      cur = cur.parent;
    }
    if (cur === this) return path;
    return null;
  }

  getChildOptional(name: string): MemoryBaseHandle | undefined {
    return this.children.get(name);
  }

  appendChild(child: MemoryBaseHandle): void {
    this.children.set(child.name, child);
  }

  removeChild(name: string): void {
    this.children.delete(name);
  }

  /** Test-only accessor for recursive-remove checks. */
  get childrenSize(): number {
    return this.children.size;
  }
}

// ---------- Public API ----------

/**
 * Create a fresh in-memory root directory handle. This is the entry point
 * used by tests; the returned object satisfies the File System Access API
 * subset that FileStorageAdapter relies on.
 */
export function createMemoryDirectory(name: string = ''): MemoryDirectoryHandle {
  return new MemoryDirectoryHandleImpl(name);
}
