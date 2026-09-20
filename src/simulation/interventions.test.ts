import { expect, it } from 'vitest';
import { createInitialState, stepTicks, compareStates } from './engine';
import { SYNTHETIC_CONFIG } from './config';
import type { ModelConfig } from './config';
const micro: ModelConfig = { ...SYNTHETIC_CONFIG, neurons: 2, inputs: [], outputs: [[], []], edges: [], legacyRng: false };
// Independent RK4, no production integration helper. Resolution also resolves the a=.999 boundary.
function reference(a: number, v: number, g: number) {
    const h = .000001;
    const d = (u: number, q: number) => [(-u / (1 - a) + q) / 20, -q / 5];
    let u = v + 52;
    for (let n = 0; n < 100000; n++) {
        const k = d(u, g), l = d(u + h * k[0] / 2, g + h * k[1] / 2), m = d(u + h * l[0] / 2, g + h * l[1] / 2), p = d(u + h * m[0], g + h * m[1]);
        u += h * (k[0] + 2 * l[0] + 2 * m[0] + p[0]) / 6;
        g += h * (k[1] + 2 * l[1] + 2 * m[1] + p[1]) / 6;
    }
    return [u - 52, g];
}
it('extra leak matches independent integration at .75, both sides and near full clamp', () => {
    for (const a of [.2, .75 - 1e-10, .75, .75 + 1e-10, .999]) {
        const s = createInitialState(42, micro);
        s.v[0] = -49;
        s.g[0] = 2;
        const r = reference(a, -49, 2);
        stepTicks(s, 1, micro, { suppression: [a, 0] });
        expect(Math.abs(s.v[0] - r[0])).toBeLessThan(1e-8);
        expect(Math.abs(s.g[0] - r[1])).toBeLessThan(1e-8);
    }
});
it('identity is byte exact; full clamp keeps synaptic deliveries and RNG draws', () => {
    const a = createInitialState(42), b = createInitialState(42);
    stepTicks(a, 5000);
    stepTicks(b, 5000, SYNTHETIC_CONFIG, { suppression: Array(8).fill(0), odorGain: 1 });
    expect(compareStates(a, b).equal).toBe(true);
    const c = createInitialState(42), d = createInitialState(42);
    c.delay[0] = 10;
    c.v[0] = 100;
    stepTicks(c, 1000, SYNTHETIC_CONFIG, { suppression: Array(8).fill(1), odorGain: 0 });
    stepTicks(d, 1000);
    expect(c.v.every(v => v === -52)).toBe(true);
    expect(c.spikeCounts.every(v => v === 0)).toBe(true);
    expect(c.g[0]).toBeGreaterThan(0);
    expect(c.prng).toEqual(d.prng);
    expect(c.inputEvents.every(v => v === 0)).toBe(true);
    const near = createInitialState(42, micro);
    near.v[0] = -49;
    near.g[0] = 2;
    stepTicks(near, 1, micro, { suppression: [1 - Number.EPSILON, 1] });
    expect(near.v.every(Number.isFinite)).toBe(true);
    expect(Math.abs(near.v[0] + 52)).toBeLessThan(1e-10);
});
it('validates effect dimensions and finite domains before any numeric mutation', () => {
    for (const options of [{ odorGain: NaN }, { odorGain: 3 }, { suppression: [.5] }, { suppression: Array(8).fill(-.1) }]) {
        const a = createInitialState(42), b = createInitialState(42);
        expect(() => stepTicks(a, 1, SYNTHETIC_CONFIG, options)).toThrow();
        expect(compareStates(a, b).equal).toBe(true);
    }
});
