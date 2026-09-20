import { SYNTHETIC_CONFIG, compatible } from './config';
import type { ModelConfig } from './config';
import { seedStreams, seedCellStreams, randomStream } from './prng';
import { WORLD, isFree } from './world';
import type { SimState } from './state';
export { snapshot, restore, fork, compareStates } from './state';
export type { SimState } from './state';
export function createInitialState(seed: number, c: ModelConfig = SYNTHETIC_CONFIG): SimState {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new Error('Seed must be uint32');
    const N = c.neurons, DELAY_SLOTS = c.delayTicks + 1;
    const body = { x: 20, y: 66, heading: -Math.PI / 2, speed: 0, angularVelocity: 0, pathLength: 0 };
    return { version: 2, model: c.model, datasetId: c.datasetId, datasetHash: c.datasetHash, configHash: c.configHash, neurons: N, edgeCount: c.edges.length, sensorChannels: c.sensorOffsets.length, delaySlots: DELAY_SLOTS, dt: c.dt, inputChannels: c.inputs.length, outputChannels: c.outputs.length, eventCursor: 0, inputEvents: new Uint32Array(c.inputs.length), tick: 0, v: new Float64Array(N).fill(-52), g: new Float64Array(N),
        refractoryUntil: new Uint32Array(N), delay: new Float64Array(DELAY_SLOTS * N), prng: c.legacyRng ? seedStreams(seed) : seedCellStreams(seed, c.inputs.map(i => i.key)),
        inputFilter: new Float64Array(c.sensorOffsets.length), motorFilter: new Float64Array(c.outputs.length), spikeCounts: new Uint32Array(N), body,
        trail: [{ tick: 0, x: body.x, y: body.y, heading: body.heading }], goalReachedTick: null };
}
const edgeCache = new WeakMap<ModelConfig, ModelConfig['edges'][]>();
function outgoingEdges(c: ModelConfig): ModelConfig['edges'][] {
    const cached = edgeCache.get(c);
    if (cached)
        return cached;
    const rows: ModelConfig['edges'][number][][] = Array.from({ length: c.neurons }, () => []);
    for (const edge of c.edges)
        rows[edge.from].push(edge);
    if (Object.isFrozen(c) && Object.isFrozen(c.edges))
        edgeCache.set(c, rows);
    return rows;
}
export interface MotorSample {
    tick: number;
    leftHz: number;
    rightHz: number;
    ratio: number;
    speed: number;
    turn: number;
    displacement: number;
    blocked: boolean;
}
export interface StepOptions {
    suppression?: readonly number[];
    odorGain?: number;
    onBodyStep?: (sample: MotorSample) => void;
}
interface Effects {
    decay: number[];
    integral: number[];
    suppression: readonly number[];
    odorGain: number;
    onBodyStep?: StepOptions['onBodyStep'];
}
function effects(c: ModelConfig, o: StepOptions): Effects {
    const suppression = o.suppression ?? Array<number>(c.neurons).fill(0), odorGain = o.odorGain ?? 1;
    if (suppression.length !== c.neurons || suppression.some(a => !Number.isFinite(a) || a < 0 || a > 1) || !Number.isFinite(odorGain) || odorGain < 0 || odorGain > 2 || c.events !== null)
        throw new Error('Invalid intervention effects or prescheduled input model');
    const decay: number[] = [], integral: number[] = [];
    for (const a of suppression) {
        if (a === 1) {
            decay.push(0);
            integral.push(0);
            continue;
        }
        const lambda = 1 / (20 * (1 - a)), delta = Math.abs(lambda - 1 / 5);
        decay.push(Math.exp(-lambda * c.dt));
        // Stable at equal decay rates (a=.75), and as a approaches one.
        integral.push(Math.exp(-Math.min(lambda, 1 / 5) * c.dt) * (delta === 0 ? c.dt : -Math.expm1(-delta * c.dt) / delta) / 20);
    }
    return { decay, integral, suppression, odorGain, onBodyStep: o.onBodyStep };
}
export function stepTicks(s: SimState, count: number, c: ModelConfig = SYNTHETIC_CONFIG, options?: StepOptions): void {
    if (!compatible(s, c))
        throw new Error('Incompatible model/dataset/config');
    if (!Number.isSafeInteger(count) || count < 0 || s.tick + count > 120000 / c.dt)
        throw new Error('Invalid tick count or 120 s limit exceeded');
    const outgoing = outgoingEdges(c);
    const effect = options ? effects(c, options) : undefined;
    for (let k = 0; k < count; k++)
        step(s, c, outgoing, effect);
}
function step(s: SimState, c: ModelConfig, outgoing: readonly (readonly ModelConfig['edges'][number][])[], effect?: Effects): void {
    const DT_MS = c.dt, N = c.neurons, DELAY_SLOTS = c.delayTicks + 1;
    const em = Math.exp(-DT_MS / 20), es = Math.exp(-DT_MS / 5);
    const synapticIntegral = (es - em) * 5 / (5 - 20);
    const rateDecay = Math.exp(-DT_MS / 50), sensorDecay = Math.exp(-DT_MS / 20);
    const n = s.tick;
    for (let side = 0; side < c.sensorOffsets.length; side++) {
        const offset = c.sensorOffsets[side];
        const x = s.body.x + Math.cos(s.body.heading + Math.PI / 2) * offset;
        const y = s.body.y + Math.sin(s.body.heading + Math.PI / 2) * offset;
        const concentration = c.concentration?.[side] ?? (0.35 + Math.exp(-Math.hypot(x - WORLD.goalX, y - WORLD.goalY) / 35));
        s.inputFilter[side] = concentration + (s.inputFilter[side] - concentration) * sensorDecay;
    }
    for (let side = 0; side < c.outputs.length; side++)
        s.motorFilter[side] *= rateDecay;
    for (let channel = 0; channel < c.inputs.length; channel++) {
        const input = c.inputs[channel], concentration = s.inputFilter[input.side];
        const baseRate = 150 * concentration / (concentration + 0.5) * c.inputGain;
        const rate = effect && effect.odorGain !== 1 ? baseRate * effect.odorGain : baseRate;
        const random = randomStream(s.prng, channel);
        if (c.events === null && random < 1 - Math.exp(-rate * DT_MS / 1000))
            applyInput(s, c, channel);
    }
    if (c.events !== null)
        while (s.eventCursor < c.events.length && Math.round(c.events[s.eventCursor].timeMs / DT_MS) === n) {
            applyInput(s, c, c.events[s.eventCursor].channel);
            s.eventCursor++;
        }
    const slot = (n % DELAY_SLOTS) * N;
    for (let i = 0; i < N; i++) {
        s.g[i] += s.delay[slot + i];
        s.delay[slot + i] = 0;
    }
    for (let i = 0; i < N; i++) {
        const g = s.g[i];
        s.g[i] = g * es;
        if (n < s.refractoryUntil[i] || c.inactive.includes(i) || effect?.suppression[i] === 1) {
            s.v[i] = -52;
            continue;
        }
        s.v[i] = effect && effect.suppression[i] !== 0
            ? -52 + (s.v[i] + 52) * effect.decay[i] + g * effect.integral[i]
            : -52 + (s.v[i] + 52) * em + g * synapticIntegral;
        if (s.v[i] >= -45) {
            s.v[i] = -52;
            s.g[i] = 0;
            s.refractoryUntil[i] = n + 1 + c.refractoryTicks;
            s.spikeCounts[i]++;
            c.outputs.forEach((cells, side) => {
                if (cells.includes(i))
                    s.motorFilter[side] += 20 / cells.length;
            });
            for (const e of outgoing[i])
                s.delay[((n + 1 + c.delayTicks) % DELAY_SLOTS) * N + e.to] += e.weight;
        }
    }
    s.tick++;
    if (s.tick % Math.round(10 / DT_MS) === 0) {
        const path = s.body.pathLength;
        const blocked = updateBody(s);
        effect?.onBodyStep?.({ tick: s.tick, leftHz: s.motorFilter[0], rightHz: s.motorFilter[1], ratio: (s.motorFilter[0] + s.motorFilter[1]) / 400,
            speed: s.body.speed, turn: s.body.angularVelocity, displacement: s.body.pathLength - path, blocked });
    }
}
function applyInput(s: SimState, c: ModelConfig, channel: number): void {
    const neuron = c.inputs[channel].neuron;
    s.inputEvents[channel]++;
    s[c.externalTarget][neuron] += c.externalAmplitude;
}
function updateBody(s: SimState): boolean {
    const b = s.body;
    b.speed = 6 * Math.min((s.motorFilter[0] + s.motorFilter[1]) / 400, 1);
    b.angularVelocity = 1.5 * Math.max(-1, Math.min(1, (s.motorFilter[1] - s.motorFilter[0]) / 200));
    b.heading += b.angularVelocity * 0.01;
    const x = b.x + Math.cos(b.heading) * b.speed * 0.01;
    const y = b.y + Math.sin(b.heading) * b.speed * 0.01;
    const free = isFree(x, y);
    if (free) {
        b.pathLength += Math.hypot(x - b.x, y - b.y);
        b.x = x;
        b.y = y;
    }
    if (s.goalReachedTick === null && Math.hypot(b.x - WORLD.goalX, b.y - WORLD.goalY) <= WORLD.goalRadius)
        s.goalReachedTick = s.tick;
    s.trail.push({ tick: s.tick, x: b.x, y: b.y, heading: b.heading });
    return !free && b.speed > 0;
}
