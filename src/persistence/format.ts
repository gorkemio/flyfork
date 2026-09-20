import { z } from 'zod';
import type { ModelConfig } from '../simulation/config';
import type { SimState, MotorSample } from '../simulation/engine';
import type { BranchSnapshot } from '../experiments/branch';
import { restoreExperiment } from './recording';
import type { ExperimentRecord } from './recording';
export const MAX_FILE_BYTES = 16 * 1024 * 1024;
const finite = z.number().finite(), uint = finite.int().min(0).max(0xffffffff), tick = uint.max(1200000);
const id = z.string().regex(/^[\w-]{1,80}$/);
const bufferSchema = z.strictObject({ type: z.enum(['Float64', 'Uint32']), length: uint.max(100000), endian: z.literal('LE'), data: z.string().max(1100000) });
type PackedBuffer = z.infer<typeof bufferSchema>;
const floats = ['v', 'g', 'delay', 'inputFilter', 'motorFilter'] as const;
const integers = ['inputEvents', 'refractoryUntil', 'prng', 'spikeCounts'] as const;
const eventSchema = z.strictObject({ id, branch: z.enum(['A', 'B']), model: z.string().max(80), datasetHash: z.string().max(80), configHash: z.string().max(80), operatorVersion: z.literal(1), operation: z.enum(['suppression', 'odor-gain']), sourceIds: z.array(z.string().max(80)).max(512), sensoryChannel: z.literal('odor').nullable(), magnitude: finite.min(0).max(2), startTick: tick, endTick: tick, sequence: uint.max(256) });
const stateSchema = z.strictObject({ version: z.literal(2), model: z.string().max(80), datasetId: z.string().max(80), datasetHash: z.string().max(80), configHash: z.string().max(80), neurons: uint.max(512), edgeCount: uint.max(65536), sensorChannels: uint.max(512), delaySlots: uint.max(100), dt: finite.refine((n): boolean => n === .1), inputChannels: uint.max(512), outputChannels: uint.max(512), eventCursor: uint, tick,
    inputEvents: bufferSchema, v: bufferSchema, g: bufferSchema, refractoryUntil: bufferSchema, delay: bufferSchema, prng: bufferSchema, inputFilter: bufferSchema, motorFilter: bufferSchema, spikeCounts: bufferSchema,
    body: z.strictObject({ x: finite, y: finite, heading: finite, speed: finite, angularVelocity: finite, pathLength: finite }), trail: bufferSchema, goalReachedTick: tick.nullable() });
const branchSchema = z.strictObject({ version: z.literal(3), operatorVersion: z.literal(1), branch: z.enum(['original', 'A', 'B']), eventRevision: uint.max(256), events: z.array(eventSchema).max(256), cursor: uint.max(256), activeIds: z.array(id).max(256), state: stateSchema, samples: bufferSchema });
export const metadataSchema = z.strictObject({ id, name: z.string().trim().min(1).max(100), savedAt: z.iso.datetime(), runtime: z.string().min(1).max(200), dataset: z.enum(['synthetic', 'malecns']) });
export type FileMetadata = z.infer<typeof metadataSchema>;
const ref = uint.max(15);
const contentSchema = z.strictObject({ metadata: metadataSchema, seed: uint, playhead: tick, frontier: tick, forkTick: tick.nullable(), recordRevision: uint,
    anchor: stateSchema.nullable(), snapshots: z.array(branchSchema).min(1).max(16), live: z.array(ref).min(1).max(3),
    records: z.array(z.strictObject({ branch: z.enum(['original', 'A', 'B']), start: ref, terminal: ref, proofs: z.array(z.tuple([tick, z.string().regex(/^[a-f0-9]{16}$/)])).max(60) })).min(1).max(3) });
const fileSchema = z.strictObject({ format: z.literal('FlyFork'), version: z.literal(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), content: contentSchema });
type PackedState = z.infer<typeof stateSchema>;
// IEEE values are written explicitly, so host byte order is never part of the file format.
function pack(a: Float64Array | Uint32Array): PackedBuffer {
    const float = a instanceof Float64Array, bytes = new Uint8Array(a.length * (float ? 8 : 4)), view = new DataView(bytes.buffer);
    for (let i = 0; i < a.length; i++)
        if (float)
            view.setFloat64(i * 8, a[i], true);
        else
            view.setUint32(i * 4, a[i], true);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { type: float ? 'Float64' : 'Uint32', length: a.length, endian: 'LE', data: btoa(binary) };
}
function size(b: PackedBuffer, type: PackedBuffer['type'], length: number): number {
    const bytes = length * (type === 'Float64' ? 8 : 4);
    if (b.type !== type || b.length !== length || b.data.length !== 4 * Math.ceil(bytes / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.data))
        throw new Error('Invalid buffer type, length or Base64');
    return bytes;
}
function unpack(b: PackedBuffer): Float64Array | Uint32Array {
    const binary = atob(b.data);
    if (btoa(binary) !== b.data)
        throw new Error('Non-canonical Base64');
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0)), view = new DataView(bytes.buffer), a = b.type === 'Float64' ? new Float64Array(b.length) : new Uint32Array(b.length);
    for (let i = 0; i < a.length; i++)
        a[i] = b.type === 'Float64' ? view.getFloat64(i * 8, true) : view.getUint32(i * 4, true);
    if (!a.every(Number.isFinite))
        throw new Error('Non-finite buffer value');
    return a;
}
function packState(s: SimState): PackedState {
    return { ...s, inputEvents: pack(s.inputEvents), v: pack(s.v), g: pack(s.g), refractoryUntil: pack(s.refractoryUntil), delay: pack(s.delay), prng: pack(s.prng), inputFilter: pack(s.inputFilter), motorFilter: pack(s.motorFilter), spikeCounts: pack(s.spikeCounts),
        trail: pack(new Float64Array(s.trail.flatMap(p => [p.tick, p.x, p.y, p.heading]))) };
}
function stateSize(s: PackedState, c: ModelConfig): number {
    const lengths = { v: c.neurons, g: c.neurons, delay: c.neurons * (c.delayTicks + 1), inputFilter: c.sensorOffsets.length, motorFilter: c.outputs.length, inputEvents: c.inputs.length, refractoryUntil: c.neurons, prng: c.inputs.length * 4, spikeCounts: c.neurons };
    if (s.model !== c.model || s.datasetHash !== c.datasetHash || s.configHash !== c.configHash)
        throw new Error('Unsupported model/dataset/config identity');
    return floats.reduce((n, k) => n + size(s[k], 'Float64', lengths[k]), 0) + integers.reduce((n, k) => n + size(s[k], 'Uint32', lengths[k]), 0) + size(s.trail, 'Float64', (Math.floor(s.tick / 100) + 1) * 4);
}
function unpackState(s: PackedState): SimState {
    const values = unpack(s.trail), trail = [];
    for (let i = 0; i < values.length; i += 4)
        trail.push({ tick: values[i], x: values[i + 1], y: values[i + 2], heading: values[i + 3] });
    return { ...s, v: unpack(s.v) as Float64Array, g: unpack(s.g) as Float64Array, delay: unpack(s.delay) as Float64Array, inputFilter: unpack(s.inputFilter) as Float64Array, motorFilter: unpack(s.motorFilter) as Float64Array, inputEvents: unpack(s.inputEvents) as Uint32Array, refractoryUntil: unpack(s.refractoryUntil) as Uint32Array, prng: unpack(s.prng) as Uint32Array, spikeCounts: unpack(s.spikeCounts) as Uint32Array, trail };
}
function packBranch(b: BranchSnapshot) {
    return { ...b, state: packState(b.state), samples: pack(new Float64Array(b.samples.flatMap(s => [s.tick, s.leftHz, s.rightHz, s.ratio, s.speed, s.turn, s.displacement, Number(s.blocked)]))) };
}
function unpackBranch(b: z.infer<typeof branchSchema>): BranchSnapshot {
    const v = unpack(b.samples), samples: MotorSample[] = [];
    for (let i = 0; i < v.length; i += 8) {
        if (v[i + 7] !== 0 && v[i + 7] !== 1)
            throw new Error('Invalid blocked measurement');
        samples.push({ tick: v[i], leftHz: v[i + 1], rightHz: v[i + 2], ratio: v[i + 3], speed: v[i + 4], turn: v[i + 5], displacement: v[i + 6], blocked: v[i + 7] === 1 });
    }
    return { ...b, state: unpackState(b.state), samples };
}
export function canonical(value: unknown): string {
    if (typeof value === 'number' && Object.is(value, -0))
        return '-0';
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value !== null && typeof value === 'object')
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(Reflect.get(value, k))}`).join(',')}}`;
    return JSON.stringify(value);
}
async function digest(content: unknown) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(content)))), b => b.toString(16).padStart(2, '0')).join(''); }
export async function serializeExperiment(record: ExperimentRecord, metadata: FileMetadata): Promise<string> {
    const snapshots: ReturnType<typeof packBranch>[] = [], unique = new Map<string, number>();
    const add = (b: BranchSnapshot) => {
        const packed = packBranch(b), key = canonical(packed), old = unique.get(key);
        if (old !== undefined)
            return old;
        const index = snapshots.push(packed) - 1;
        unique.set(key, index);
        return index;
    };
    const records = record.records.map(r => ({ branch: r.branch, start: add(r.start), terminal: add(r.terminal), proofs: r.proofs })), live = record.live.map(add);
    const content = contentSchema.parse({ metadata, seed: record.seed, playhead: record.playhead, frontier: record.frontier, forkTick: record.forkTick, recordRevision: record.recordRevision, anchor: record.anchor ? packState(record.anchor) : null, snapshots, records, live });
    const text = canonical({ format: 'FlyFork', version: 1, content, sha256: await digest(content) });
    if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
        throw new Error('Experiment exceeds 16 MiB file limit');
    return text;
}
function parseBounded(text: string): unknown {
    if (text.length > MAX_FILE_BYTES || new TextEncoder().encode(text).length > MAX_FILE_BYTES)
        throw new Error('File exceeds 16 MiB limit');
    let depth = 0, quoted = false, escape = false;
    for (const ch of text) {
        if (quoted) {
            if (escape)
                escape = false;
            else if (ch === '\\')
                escape = true;
            else if (ch === '"')
                quoted = false;
        }
        else if (ch === '"')
            quoted = true;
        else if (ch === '[' || ch === '{') {
            if (++depth > 24)
                throw new Error('File depth limit exceeded');
        }
        else if (ch === ']' || ch === '}')
            depth--;
    }
    return JSON.parse(text, (key, value: unknown) => {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
            throw new Error('Forbidden object key');
        return value;
    });
}
export async function readExperimentFile(file: {
    size: number;
    text(): Promise<string>;
}): Promise<string> {
    if (file.size > MAX_FILE_BYTES)
        throw new Error('File exceeds 16 MiB limit');
    return file.text();
}
export async function inspectExperiment(text: string) {
    const file = fileSchema.parse(parseBounded(text));
    if (await digest(file.content) !== file.sha256)
        throw new Error('File content hash mismatch');
    return file;
}
export async function deserializeExperiment(text: string, config: ModelConfig, ids: readonly string[]) {
    const { content } = await inspectExperiment(text);
    // Validate every byte count before any payload typed array is allocated.
    let bytes = content.anchor ? stateSize(content.anchor, config) : 0;
    for (const b of content.snapshots)
        bytes += stateSize(b.state, config) + size(b.samples, 'Float64', Math.floor(b.state.tick / 100) * 8);
    if (bytes > 12 * 1024 * 1024)
        throw new Error('Decoded buffer budget exceeded');
    const snapshots = content.snapshots.map(unpackBranch);
    const get = (index: number) => {
        const s = snapshots[index];
        if (!s)
            throw new Error('Missing snapshot reference');
        return s;
    };
    const record: ExperimentRecord = { version: 1, seed: content.seed, playhead: content.playhead, frontier: content.frontier, forkTick: content.forkTick, recordRevision: content.recordRevision, anchor: content.anchor ? unpackState(content.anchor) : null, live: content.live.map(get), records: content.records.map(r => ({ ...r, start: get(r.start), terminal: get(r.terminal) })) };
    return { ...restoreExperiment(record, config, ids), metadata: content.metadata, record };
}
