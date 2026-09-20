import { z } from 'zod';
import { MAX_TICK } from '../simulation/fixture';
import { metadataSchema, MAX_FILE_BYTES } from '../persistence/format';
const integer = z.number().int().nonnegative();
const tick = integer.max(MAX_TICK);
const finite = z.number().finite();
const poseSchema = z.strictObject({ tick, x: finite.min(0).max(40), y: finite.min(0).max(80), heading: finite });
const bodySchema = z.strictObject({ x: finite.min(0).max(40), y: finite.min(0).max(80), heading: finite, speed: finite.min(0).max(6), angularVelocity: finite.min(-1.5).max(1.5), pathLength: finite.min(0) });
const envelope = { protocolVersion: z.union([z.literal(1), z.literal(3), z.literal(4)]), requestId: integer.positive(), sessionId: z.string().min(1).max(80), epoch: integer, expectedRevision: integer };
export const eventSchema = z.strictObject({ id: z.string().min(1).max(80), branch: z.enum(['A', 'B']), model: z.string(), datasetHash: z.string(), configHash: z.string(), operatorVersion: z.literal(1), operation: z.enum(['suppression', 'odor-gain']), sourceIds: z.array(z.string()).max(512), sensoryChannel: z.literal('odor').nullable(), magnitude: finite.min(0).max(2), startTick: tick, endTick: tick, sequence: integer.positive() });
export const commandSchema = z.discriminatedUnion('type', [
    z.strictObject({ ...envelope, type: z.literal('EXPORT_STATE'), payload: metadataSchema }),
    z.strictObject({ ...envelope, type: z.literal('LOAD'), payload: z.strictObject({ file: z.string().max(MAX_FILE_BYTES) }) }),
    z.strictObject({ ...envelope, type: z.literal('INIT'), payload: z.strictObject({ seed: integer.max(0xffffffff), dataset: z.enum(['synthetic', 'malecns']).optional() }) }),
    z.strictObject({ ...envelope, type: z.literal('RUN'), payload: z.strictObject({ speed: z.union([z.literal(0.5), z.literal(1), z.literal(2), z.literal(4)]) }) }),
    z.strictObject({ ...envelope, type: z.literal('STEP'), payload: z.strictObject({ ticks: integer.positive().max(50000) }) }),
    z.strictObject({ ...envelope, type: z.literal('SCHEDULE_INTERVENTION'), payload: eventSchema }),
    z.strictObject({ ...envelope, type: z.literal('SEEK'), payload: z.strictObject({ tick }) }),
    z.strictObject({ ...envelope, type: z.literal('REPLAY'), payload: z.strictObject({}) }),
    z.strictObject({ ...envelope, type: z.enum(['PAUSE', 'SNAPSHOT', 'FORK', 'RESTORE', 'COMPARE']), payload: z.strictObject({}) }),
]).refine(c => c.protocolVersion >= 3 || !['SEEK', 'REPLAY', 'SCHEDULE_INTERVENTION'].includes(c.type), 'Use protocol v3 or later for experiment commands')
    .refine(c => c.protocolVersion === 4 || !['EXPORT_STATE', 'LOAD'].includes(c.type), 'Use protocol v4 for persistence');
export type Command = z.infer<typeof commandSchema>;
export type Action = Command extends infer C ? C extends Command ? Pick<C, 'type' | 'payload'> : never : never;
export const telemetrySchema = z.strictObject({ tick, body: bodySchema, v: z.array(finite).min(1).max(1000),
    motorFilter: z.array(finite).length(2), spikes: z.array(integer).min(1).max(1000), trail: z.array(poseSchema).min(1).max(12001), goalReachedTick: tick.nullable() });
export type Telemetry = z.infer<typeof telemetrySchema>;
const comparisonSchema = z.strictObject({ equal: z.boolean(), tick, firstDifference: z.string().nullable() });
const datasetSchema = z.strictObject({ kind: z.enum(['synthetic', 'malecns']), title: z.string(), release: z.string(), hash: z.string(), model: z.string(), neuronCount: integer.positive().max(1000), edgeCount: integer.max(1000000),
    cells: z.array(z.strictObject({ id: z.string(), type: z.string(), side: z.string(), sign: z.number().int() })).min(1).max(1000),
    groups: z.array(z.strictObject({ name: z.string(), indices: z.array(integer) })).max(6), connections: z.array(z.strictObject({ from: integer, to: integer, synapses: integer, sign: z.number().int() })).max(36) });
const metricSchema = z.strictObject({ startTick: tick, endTick: tick, samples: integer, path: finite, exploration: finite, proximity: finite, goalTick: tick.nullable(), cost: finite, leftHz: finite, rightHz: finite, pnDifference: finite, rawRatio: finite, rawSpeed: finite, speed: finite, turn: finite, capFraction: finite, capSeconds: finite, stallFraction: finite, stallSeconds: finite, displacement: finite });
export const viewSchema = z.strictObject({
    dataset: datasetSchema, seed: integer.max(0xffffffff), running: z.boolean(), speed: finite, original: telemetrySchema, branch: telemetrySchema.nullable(),
    snapshot: z.strictObject({ tick, activePotentials: integer, queuedSignals: integer, filterSum: finite, prng: z.array(integer).min(4).max(4000) }).nullable(),
    comparison: comparisonSchema.nullable(),
    branchB: telemetrySchema.nullable(), configHash: z.string(),
    comparisons: z.strictObject({ A: comparisonSchema, B: comparisonSchema, AB: comparisonSchema }).nullable(),
    events: z.array(eventSchema).max(256), eventRevisions: z.strictObject({ A: integer, B: integer }), recordRevision: integer, highWater: tick, forkTick: tick.nullable(),
    metrics: z.strictObject({ reason: z.string().nullable(), startTick: tick, endTick: tick, branches: z.strictObject({ original: metricSchema.optional(), A: metricSchema.optional(), B: metricSchema.optional() }), divergence: z.strictObject({ AO: finite.nullable(), BO: finite.nullable(), AB: finite.nullable() }) }),
    replay: z.strictObject({ status: z.enum(['Not checked', 'Checking', 'Matched', 'Mismatch', 'Unavailable']), tick, detail: z.string(), checked: integer }),
    job: z.strictObject({ type: z.enum(['seek', 'replay', 'step']), target: tick, progress: tick }).nullable(),
    memory: z.strictObject({ cacheBytes: integer, checkpointCount: integer, anchorBytes: integer }),
}).refine(v => v.dataset.cells.length === v.dataset.neuronCount && v.original.v.length === v.dataset.neuronCount && v.original.spikes.length === v.dataset.neuronCount && (!v.branch || (v.branch.v.length === v.dataset.neuronCount && v.branch.spikes.length === v.dataset.neuronCount)) && (!v.branchB || (v.branchB.v.length === v.dataset.neuronCount && v.branchB.spikes.length === v.dataset.neuronCount && v.branchB.tick === v.original.tick)) && (!v.branch || v.branch.tick === v.original.tick) && (!v.snapshot || v.snapshot.prng.length === (v.dataset.kind === 'synthetic' ? 8 : v.dataset.cells.filter(n => n.type === 'ORN_DM1').length * 4)), 'Dataset telemetry dimension mismatch');
export type LabView = z.infer<typeof viewSchema>;
export const replySchema = z.strictObject({ protocolVersion: z.union([z.literal(1), z.literal(3), z.literal(4)]), kind: z.enum(['ACK', 'ERROR', 'FRAME', 'PROGRESS']),
    requestId: integer, sessionId: z.string(), epoch: integer, revision: integer, sequence: integer,
    view: viewSchema.optional(), error: z.string().optional(), file: z.string().max(MAX_FILE_BYTES).optional(),
}).refine(r => r.kind === 'ERROR' ? Boolean(r.error) : Boolean(r.view));
export type Reply = z.infer<typeof replySchema>;
export interface Cursor {
    sessionId: string;
    epoch: number;
    revision: number;
    sequence: number;
}
export function acceptReply(input: unknown, current: Cursor, pendingRequest: number | null): Reply | null {
    const parsed = replySchema.safeParse(input);
    if (!parsed.success)
        return null;
    const r = parsed.data;
    if (r.sessionId !== current.sessionId || r.epoch !== current.epoch || r.revision < current.revision || r.sequence <= current.sequence)
        return null;
    if (pendingRequest !== null && (r.kind === 'FRAME' || r.requestId !== pendingRequest))
        return null;
    return r;
}
