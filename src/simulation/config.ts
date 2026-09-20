import { EDGES, N, MODEL } from './fixture';
export interface InputChannel {
    readonly neuron: number;
    readonly side: number;
    readonly key: string;
}
export interface InputEvent {
    readonly timeMs: number;
    readonly channel: number;
}
export interface ModelConfig {
    readonly model: string;
    readonly datasetId: string;
    readonly datasetHash: string;
    readonly configHash: string;
    readonly neurons: number;
    readonly sensorOffsets: readonly number[];
    readonly dt: number;
    readonly delayTicks: number;
    readonly refractoryTicks: number;
    readonly inputs: readonly InputChannel[];
    readonly outputs: readonly (readonly number[])[];
    readonly edges: readonly {
        readonly from: number;
        readonly to: number;
        readonly weight: number;
    }[];
    readonly externalTarget: 'g' | 'v';
    readonly externalAmplitude: number;
    readonly legacyRng: boolean;
    readonly concentration: readonly [
        number,
        number
    ] | null;
    readonly inputGain: number;
    readonly inactive: readonly number[];
    readonly events: readonly InputEvent[] | null;
}
export const SYNTHETIC_CONFIG: ModelConfig = Object.freeze({
    model: MODEL, datasetId: 'synthetic-8-v1', datasetHash: '4abf809c81d5bb216f5e32b50150a6ff27f861e39ac5c3ef4551ee592867b2ee',
    configHash: 'ec767396f3c5e17aa494987d193eac13bfdc611347b7fcf2fa7d1372b79048a8', neurons: N, sensorOffsets: Object.freeze([-0.9, 0.9]), dt: .1, delayTicks: 18, refractoryTicks: 22,
    inputs: Object.freeze([{ neuron: 0, side: 0, key: 'synthetic-L' }, { neuron: 1, side: 1, key: 'synthetic-R' }].map(input => Object.freeze(input))),
    outputs: Object.freeze([Object.freeze([6]), Object.freeze([7])]), edges: EDGES,
    externalTarget: 'g', externalAmplitude: 120, legacyRng: true, concentration: null, inputGain: 1,
    inactive: Object.freeze([]), events: null,
});
export function compatible(s: {
    model: string;
    datasetId: string;
    datasetHash: string;
    configHash: string;
}, c: ModelConfig): boolean {
    return s.model === c.model && s.datasetId === c.datasetId && s.datasetHash === c.datasetHash && s.configHash === c.configHash;
}
