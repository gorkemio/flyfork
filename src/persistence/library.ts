import Dexie from 'dexie';
import { z } from 'zod';
import type { Table } from 'dexie';
import { inspectExperiment, MAX_FILE_BYTES } from './format';
export const MAX_RECORDS = 50, MAX_LIBRARY_BYTES = 128 * 1024 * 1024;
const count = z.number().int().nonnegative();
const recoverySchema = z.object({
    id: z.literal('slot'), owner: z.string().min(1).max(80), revision: count, sequence: count,
    file: z.string().max(MAX_FILE_BYTES).nullable(),
    entry: z.object({ id: z.string().min(1).max(80), name: z.string().min(1).max(100), savedAt: z.iso.datetime(), dataset: z.enum(['malecns', 'synthetic']), model: z.string().min(1).max(80), playhead: count.max(1200000), frontier: count.max(1200000), branches: count.min(1).max(3), bytes: count.max(MAX_FILE_BYTES) }).nullable()
}).refine(r => (r.file === null) === (r.entry === null) && (!r.entry || r.entry.playhead <= r.entry.frontier));
export interface Entry {
    id: string;
    name: string;
    savedAt: string;
    dataset: 'malecns' | 'synthetic';
    model: string;
    playhead: number;
    frontier: number;
    branches: number;
    bytes: number;
    revision: number;
}
export interface Prepared {
    file: string;
    entry: Omit<Entry, 'revision'>;
}
export interface Recovery {
    id: 'slot';
    owner: string;
    revision: number;
    sequence: number;
    file: string | null;
    entry: Omit<Entry, 'revision'> | null;
}
export async function prepareFile(file: string): Promise<Prepared> {
    const { content } = await inspectExperiment(file), m = content.metadata;
    return { file, entry: { id: m.id, name: m.name, savedAt: m.savedAt, dataset: m.dataset,
            model: content.snapshots[0].state.model, playhead: content.playhead, frontier: content.frontier,
            branches: content.records.length, bytes: new TextEncoder().encode(file).length } };
}
export class Library extends Dexie {
    entries!: Table<Entry, string>;
    payloads!: Table<{
        id: string;
        file: string;
    }, string>;
    recovery!: Table<Recovery, string>;
    constructor(report: (message: string) => void, name = 'flyfork-library') {
        super(name);
        this.version(1).stores({ entries: 'id, savedAt, name', payloads: 'id', recovery: 'id' });
        this.on('blocked', () => report('Storage upgrade blocked. Close other FlyFork tabs; no records were deleted.'));
        this.on('versionchange', () => { this.close(); report('Storage changed in another tab. Reload to reopen Library; this experiment remains in memory.'); });
    }
    list(search = ''): Promise<Entry[]> {
        return this.entries.orderBy('savedAt').reverse().filter(e => e.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).limit(MAX_RECORDS).toArray();
    }
    async readRecovery(): Promise<Recovery | null> {
        const stored = await this.recovery.get('slot');
        if (!stored)
            return null;
        const result = recoverySchema.safeParse(stored);
        if (!result.success)
            throw new Error('Recovery metadata is corrupt. Named Library records were preserved. Open a named record or export the current experiment.');
        return result.data;
    }
    async read(id: string): Promise<{
        entry: Entry;
        file: string;
    }> {
        return this.transaction('r', this.entries, this.payloads, async () => {
            const entry = await this.entries.get(id), payload = await this.payloads.get(id);
            if (!entry || !payload)
                throw new Error('Record is missing or incomplete. Other records were preserved.');
            return { entry, file: payload.file };
        });
    }
    async save(prepared: Prepared, expectedRevision: number | null, isCurrent = () => true): Promise<Entry> {
        if (prepared.entry.bytes > MAX_FILE_BYTES)
            throw new Error('File exceeds 16 MiB limit');
        // No Worker, digest, file read or unrelated promise may enter this transaction.
        return this.transaction('rw', this.entries, this.payloads, async () => {
            const old = await this.entries.get(prepared.entry.id);
            if ((old?.revision ?? null) !== expectedRevision)
                throw new Error('Conflict: this record changed in another tab. Use Save as copy.');
            const entries = await this.entries.toArray(); // Bounded lightweight metadata only.
            if (!old && entries.length >= MAX_RECORDS)
                throw new Error('Library limit: 50 records. Export or delete a record first.');
            const bytes = entries.reduce((n, e) => n + e.bytes, 0) - (old?.bytes ?? 0) + prepared.entry.bytes;
            if (bytes > MAX_LIBRARY_BYTES)
                throw new Error('Library limit: 128 MiB. Export or delete a record first.');
            if (!isCurrent())
                throw new Error('Obsolete save cancelled; the current experiment was preserved.');
            const entry = { ...prepared.entry, revision: (old?.revision ?? 0) + 1 };
            await this.payloads.put({ id: entry.id, file: prepared.file });
            await this.entries.put(entry);
            if (!isCurrent())
                throw new Error('Obsolete save cancelled; the current experiment was preserved.');
            return entry;
        });
    }
    async remove(id: string, revision: number): Promise<void> {
        await this.transaction('rw', this.entries, this.payloads, async () => {
            if ((await this.entries.get(id))?.revision !== revision)
                throw new Error('Conflict: record changed. Refresh Library before deleting.');
            await this.entries.delete(id);
            await this.payloads.delete(id);
        });
    }
    async claimRecovery(owner: string, expectedRevision: number | null): Promise<void> {
        await this.transaction('rw', this.recovery, async () => {
            const old = await this.recovery.get('slot');
            if ((old?.revision ?? null) !== expectedRevision)
                throw new Error('Recovery changed; reopen its preview.');
            await this.recovery.put({ id: 'slot', owner, revision: (old?.revision ?? 0) + 1, sequence: 0, file: old?.file ?? null, entry: old?.entry ?? null });
        });
    }
    async saveRecovery(prepared: Prepared, owner: string, sequence: number, isCurrent = () => true): Promise<Recovery> {
        if (prepared.entry.bytes > MAX_FILE_BYTES)
            throw new Error('Recovery exceeds 16 MiB');
        return this.transaction('rw', this.recovery, async () => {
            const old = await this.recovery.get('slot');
            if (!old || old.owner !== owner || old.sequence >= sequence || !isCurrent())
                throw new Error('Obsolete recovery or another tab owns recovery; existing durable record preserved.');
            const saved: Recovery = { id: 'slot', owner, sequence, revision: old.revision + 1, file: prepared.file, entry: prepared.entry };
            await this.recovery.put(saved);
            if (!isCurrent())
                throw new Error('Obsolete recovery cancelled; existing durable record preserved.');
            return saved;
        });
    }
}
// Web Locks gives reload-safe ownership without relying on wall-clock lease expiry.
// Browsers without it retain Library/export; automatic recovery is explicitly unavailable.
export async function recoveryOwnership(): Promise<{
    owned: boolean;
    release(): void;
}> {
    if (!navigator.locks)
        return { owned: false, release() { } };
    let release = () => { };
    const lifetime = new Promise<void>(resolve => { release = resolve; });
    return new Promise(resolve => {
        void navigator.locks.request('flyfork-recovery', { ifAvailable: true }, async (lock) => {
            resolve({ owned: Boolean(lock), release });
            if (lock)
                await lifetime;
        }).catch(() => resolve({ owned: false, release }));
    });
}
export function storageError(error: unknown): string {
    const name = error instanceof Error ? error.name : '';
    if (name === 'QuotaExceededError')
        return 'Storage quota exceeded. The previous durable record is safe. Export this experiment to a file.';
    if (['SecurityError', 'MissingAPIError', 'DatabaseClosedError', 'InvalidStateError'].includes(name))
        return 'Storage unavailable: memory-only. Export remains available; this experiment is not saved.';
    return error instanceof Error ? error.message : 'Storage operation failed; previous records were preserved.';
}
