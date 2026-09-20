import { copyBranchSnapshot } from './branch';
import type { BranchSnapshot } from './branch';
export const CHECKPOINT_BUDGET = 64 * 1024 * 1024;
export function checkpointKey(s: BranchSnapshot): string {
    return [s.state.datasetHash, s.state.model, s.state.configHash, s.operatorVersion, s.eventRevision, s.branch, s.state.tick].join(':');
}
export function snapshotBytes(s: BranchSnapshot): number {
    // Conservative JS ownership estimate: buffers + 256 bytes/object sample/pose + UTF-16 metadata.
    return Object.values(s.state).reduce<number>((sum, v) => sum + (ArrayBuffer.isView(v) ? v.byteLength : 0), 0)
        + (s.state.trail.length + s.samples.length) * 256 + JSON.stringify(s.events).length * 2 + 8192;
}
export class CheckpointPool {
    private entries = new Map<string, {
        snapshot: BranchSnapshot;
        bytes: number;
    }>();
    bytes = 0;
    constructor(readonly budget = CHECKPOINT_BUDGET) { }
    put(s: BranchSnapshot): void {
        const key = checkpointKey(s), bytes = snapshotBytes(s);
        const old = this.entries.get(key);
        if (old)
            this.bytes -= old.bytes;
        this.entries.delete(key);
        if (bytes > this.budget)
            return;
        while (this.bytes + bytes > this.budget) {
            const first = this.entries.keys().next().value;
            if (first === undefined)
                break;
            const item = this.entries.get(first)!;
            this.bytes -= item.bytes;
            this.entries.delete(first);
        }
        this.entries.set(key, { snapshot: copyBranchSnapshot(s), bytes });
        this.bytes += bytes;
    }
    nearest(identity: BranchSnapshot, tick: number): BranchSnapshot | null {
        let found: BranchSnapshot | null = null;
        const prefix = checkpointKey(identity).split(':').slice(0, -1).join(':') + ':';
        for (const [key, item] of this.entries)
            if (key.startsWith(prefix) && item.snapshot.state.tick <= tick && (!found || item.snapshot.state.tick > found.state.tick))
                found = item.snapshot;
        return found ? copyBranchSnapshot(found) : null;
    }
    clear(): void { this.entries.clear(); this.bytes = 0; }
    get size() { return this.entries.size; }
}
