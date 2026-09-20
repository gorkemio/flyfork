import { z } from 'zod';
import type { ModelConfig, InputEvent } from '../simulation/config';
const uint = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const neuron = z.strictObject({ id: z.string().regex(/^[1-9][0-9]*$/), type: z.enum(['ORN_DM1', 'DM1_lPN', 'lLN2F_b']), side: z.enum(['L', 'R']), sideField: z.enum(['rootSide', 'somaSide']), nt: z.enum(['acetylcholine', 'gaba']), ntConfidence: z.number().finite().min(.5).max(1), ntPredictions: uint.positive(), sign: z.union([z.literal(1), z.literal(-1)]) });
const schema = z.strictObject({ version: z.literal(1), id: z.literal('male-cns-v1.0-dm1'), release: z.literal('male-cns:v1.0'), types: z.tuple([z.literal('ORN_DM1'), z.literal('DM1_lPN'), z.literal('lLN2F_b')]),
    neurons: z.array(neuron).min(3).max(1000), edges: z.array(z.tuple([uint, uint, uint.positive(), z.union([z.literal(1), z.literal(-1)])])).max(1000000),
    cuts: z.strictObject({ internal: uint, incomingCut: uint, outgoingCut: uint, incomingTotal: uint, outgoingTotal: uint }),
    policy: z.strictObject({ selection: z.string(), duplicates: z.literal('reject incident duplicate pairs'), selfEdges: z.literal('retain'), nt: z.string() }),
    license: z.strictObject({ id: z.literal('CC-BY-4.0'), url: z.literal('https://creativecommons.org/licenses/by/4.0/'), source: z.literal('https://male-cns.janelia.org/download/'), attribution: z.string().min(1), changes: z.string().min(1) }),
    sourceSha256: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)), converterVersion: z.literal('1') });
export type Dataset = z.infer<typeof schema> & {
    readonly hash: string;
};
async function sha(text: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export function freeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
export async function loadDataset(text: string, expectedHash: string): Promise<Dataset> {
    if (text.length > 2 * 1024 * 1024 || await sha(text) !== expectedHash)
        throw new Error('Dataset size/hash mismatch');
    const d = schema.parse(JSON.parse(text));
    const ids = new Set<string>();
    let previous = 0n;
    for (const n of d.neurons) {
        if (ids.has(n.id) || BigInt(n.id) <= previous || BigInt(n.id) > 0xffffffffffffffffn || n.sign !== (n.nt === 'gaba' ? -1 : 1) || n.sideField !== (n.type === 'ORN_DM1' ? 'rootSide' : 'somaSide'))
            throw new Error('Invalid neuron identity/sign/side');
        ids.add(n.id);
        previous = BigInt(n.id);
    }
    if (new Set(d.neurons.map(n => n.type)).size !== 3)
        throw new Error('Missing neuron type');
    let previousEdge = -1, total = 0;
    for (const [from, to, count, sign] of d.edges) {
        const key = from * d.neurons.length + to;
        if (from >= d.neurons.length || to >= d.neurons.length || key <= previousEdge || sign !== d.neurons[from].sign)
            throw new Error('Invalid directed edge');
        previousEdge = key;
        total += count;
    }
    if (!Number.isSafeInteger(total) || total !== d.cuts.internal || total + d.cuts.incomingCut !== d.cuts.incomingTotal || total + d.cuts.outgoingCut !== d.cuts.outgoingTotal || Object.keys(d.sourceSha256).length !== 3)
        throw new Error('Invalid source counts');
    return freeze({ ...d, hash: expectedHash });
}
export interface ModelOptions {
    dt?: .1 | .05;
    concentration?: readonly [
        number,
        number
    ];
    inputGain?: number;
    cutOrnPn?: boolean;
    cutReadout?: boolean;
    inactiveLocal?: boolean;
    shuffle?: boolean;
    events?: readonly InputEvent[];
}
export async function modelConfig(d: Dataset, o: ModelOptions = {}): Promise<ModelConfig> {
    const dt = o.dt ?? .1;
    if (![.1, .05].includes(dt) || (o.concentration && o.concentration.some(v => !Number.isFinite(v) || v < 0)) || (o.inputGain !== undefined && ![0, 1].includes(o.inputGain)))
        throw new Error('Invalid model configuration');
    const inputs = d.neurons.flatMap((n, i) => n.type === 'ORN_DM1' ? [{ neuron: i, side: n.side === 'L' ? 0 : 1, key: `${n.id}:odor` }] : []);
    const outputs = [0, 1].map(side => o.cutReadout ? [] : d.neurons.flatMap((n, i) => n.type === 'DM1_lPN' && (n.side === 'L' ? 0 : 1) === side ? [i] : []));
    if (!o.cutReadout && outputs.some(a => a.length === 0))
        throw new Error('Missing sided PN');
    const permutation = Array.from({ length: d.neurons.length }, (_, i) => i);
    let x = 17;
    if (o.shuffle)
        for (let i = permutation.length - 1; i > 0; i--) {
            x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
            const j = x % (i + 1);
            [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
        }
    const edges = d.edges.filter(([from, to]) => !(o.cutOrnPn && d.neurons[from].type === 'ORN_DM1' && d.neurons[to].type === 'DM1_lPN')).map(([from, to, count, sign]) => ({ from, to: permutation[to], weight: sign * count * .275 })).sort((a, b) => a.from - b.from || a.to - b.to);
    let previous = -1;
    for (const e of o.events ?? []) {
        if (!Number.isFinite(e.timeMs) || e.timeMs < 0 || e.timeMs < previous || Math.abs(e.timeMs / dt - Math.round(e.timeMs / dt)) > 1e-7 || !Number.isInteger(e.channel) || e.channel < 0 || e.channel >= inputs.length)
            throw new Error('Invalid physical input event');
        previous = e.timeMs;
    }
    const content = { model: 'male-cns-dm1-lif-v1', datasetId: d.id, datasetHash: d.hash, neurons: d.neurons.length, sensorOffsets: [-0.9, 0.9], dt, delayTicks: Math.round(1.8 / dt), refractoryTicks: Math.round(2.2 / dt), inputs, outputs, edges, externalTarget: 'v' as const, externalAmplitude: 68.75, legacyRng: false, concentration: o.concentration ?? null, inputGain: o.inputGain ?? 1, inactive: o.inactiveLocal ? d.neurons.flatMap((n, i) => n.type === 'lLN2F_b' ? [i] : []) : [], events: o.events ?? null };
    return freeze({ ...content, configHash: await sha(JSON.stringify(content)) });
}
