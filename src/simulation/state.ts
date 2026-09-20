import { SYNTHETIC_CONFIG } from './config';
import type { ModelConfig } from './config';
export interface Pose {
    tick: number;
    x: number;
    y: number;
    heading: number;
}
export interface Body {
    x: number;
    y: number;
    heading: number;
    speed: number;
    angularVelocity: number;
    pathLength: number;
}
export interface SimState {
    version: 2;
    model: string;
    datasetId: string;
    datasetHash: string;
    configHash: string;
    neurons: number;
    edgeCount: number;
    sensorChannels: number;
    delaySlots: number;
    dt: number;
    inputChannels: number;
    outputChannels: number;
    eventCursor: number;
    inputEvents: Uint32Array;
    tick: number;
    v: Float64Array;
    g: Float64Array;
    refractoryUntil: Uint32Array;
    delay: Float64Array;
    prng: Uint32Array;
    inputFilter: Float64Array;
    motorFilter: Float64Array;
    spikeCounts: Uint32Array;
    body: Body;
    trail: Pose[];
    goalReachedTick: number | null;
}
export function snapshot(s: SimState): SimState {
    return { ...s, inputEvents: s.inputEvents.slice(), v: s.v.slice(), g: s.g.slice(), refractoryUntil: s.refractoryUntil.slice(), delay: s.delay.slice(),
        prng: s.prng.slice(), inputFilter: s.inputFilter.slice(), motorFilter: s.motorFilter.slice(), spikeCounts: s.spikeCounts.slice(),
        body: { ...s.body }, trail: s.trail.map(p => ({ ...p })) };
}
function check(condition: unknown): asserts condition {
    if (!condition)
        throw new Error('Invalid or incompatible simulation snapshot');
}
function record(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null; }
function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }
function validTick(v: unknown): v is number { return finite(v) && Number.isInteger(v) && v >= 0 && v <= 2400000; }
function validPose(v: unknown): v is Body { return record(v) && finite(v.x) && v.x >= 0 && v.x <= 40 && finite(v.y) && v.y >= 0 && v.y <= 80 && finite(v.heading); }
export function restore(input: unknown, c: ModelConfig = SYNTHETIC_CONFIG): SimState {
    check(record(input));
    const s = input;
    const N = c.neurons, DELAY_SLOTS = c.delayTicks + 1;
    check(s.version === 2 && s.model === c.model && s.datasetId === c.datasetId && s.datasetHash === c.datasetHash && s.configHash === c.configHash && validTick(s.tick) && s.tick <= 120000 / c.dt);
    check(s.neurons === N && s.edgeCount === c.edges.length && s.sensorChannels === c.sensorOffsets.length && s.delaySlots === DELAY_SLOTS && s.dt === c.dt && s.inputChannels === c.inputs.length && s.outputChannels === c.outputs.length);
    check(typeof s.eventCursor === 'number' && Number.isInteger(s.eventCursor) && s.eventCursor >= 0 && s.eventCursor <= (c.events?.length ?? 0));
    const cursor = s.eventCursor;
    check(!c.events || ((!cursor || Math.round(c.events[cursor - 1].timeMs / c.dt) < s.tick) && (cursor === c.events.length || Math.round(c.events[cursor].timeMs / c.dt) >= s.tick)));
    for (const [name, length] of [['v', N], ['g', N], ['delay', N * DELAY_SLOTS], ['inputFilter', c.sensorOffsets.length], ['motorFilter', c.outputs.length]] as const) {
        const a = s[name];
        check(a instanceof Float64Array && a.length === length && a.every(Number.isFinite));
    }
    for (const [name, length] of [['refractoryUntil', N], ['spikeCounts', N], ['prng', c.inputs.length * 4], ['inputEvents', c.inputs.length]] as const) {
        const a = s[name];
        check(a instanceof Uint32Array && a.length === length);
    }
    const prng = s.prng as Uint32Array;
    for (let i = 0; i < c.inputs.length; i++)
        check(prng.slice(i * 4, i * 4 + 4).some(Boolean));
    check(validPose(s.body));
    check(finite(s.body.speed) && s.body.speed >= 0 && s.body.speed <= 6 && finite(s.body.angularVelocity) && Math.abs(s.body.angularVelocity) <= 1.5 && finite(s.body.pathLength) && s.body.pathLength >= 0);
    check(Array.isArray(s.trail) && s.trail.length === Math.floor(s.tick / Math.round(10 / c.dt)) + 1 && s.trail.every((p: unknown, i: number) => validPose(p) && 'tick' in p && p.tick === i * Math.round(10 / c.dt)));
    check(s.goalReachedTick === null || (validTick(s.goalReachedTick) && s.goalReachedTick <= s.tick));
    // Every field above is validated before copying; unknown fields are not retained.
    return snapshot({ version: 2, model: c.model, datasetId: c.datasetId, datasetHash: c.datasetHash, configHash: c.configHash, neurons: N, edgeCount: c.edges.length, sensorChannels: c.sensorOffsets.length, delaySlots: DELAY_SLOTS, dt: c.dt, inputChannels: c.inputs.length, outputChannels: c.outputs.length, eventCursor: cursor, inputEvents: s.inputEvents as Uint32Array, tick: s.tick, v: s.v as Float64Array, g: s.g as Float64Array,
        refractoryUntil: s.refractoryUntil as Uint32Array, delay: s.delay as Float64Array, prng, inputFilter: s.inputFilter as Float64Array,
        motorFilter: s.motorFilter as Float64Array, spikeCounts: s.spikeCounts as Uint32Array, body: s.body, trail: s.trail as Pose[], goalReachedTick: s.goalReachedTick });
}
export function fork(input: unknown, c: ModelConfig = SYNTHETIC_CONFIG): SimState { return restore(input, c); }
export interface Comparison {
    equal: boolean;
    tick: number;
    firstDifference: string | null;
}
export function compareStates(a: SimState, b: SimState): Comparison {
    const difference = firstDifference(a, b, '');
    return { equal: difference === null, tick: a.tick, firstDifference: difference };
}
function firstDifference(a: unknown, b: unknown, path: string): string | null {
    if (typeof a !== 'object' || a === null || b === null || typeof b !== 'object')
        return Object.is(a, b) ? null : path;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length)
        return `${path}.length`;
    for (const key of ak) {
        const next = /^\d+$/.test(key) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
        const diff = firstDifference(Reflect.get(a, key), Reflect.get(b, key), next);
        if (diff !== null)
            return diff;
    }
    return null;
}
