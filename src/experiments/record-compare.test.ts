import { evidencePath } from '../../tests/evidence-path';
import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fingerprint } from './branch';
import { Experiment } from './experiment';
import { SYNTHETIC_CONFIG as config } from '../simulation/config';
import type { MotorSample } from '../simulation/engine';
it('profiles exact recorded measurement comparison without changing motor values', () => {
    const e = new Experiment(42, config, Array.from({ length: 8 }, (_, i) => `fixture-${i}`));
    e.advanceTo(120000);
    const a = e.records.original!.terminal.samples, b = a.map(sample => ({ ...sample }));
    const direct = () => a.length === b.length && a.every((sample, i) => (Object.keys(sample) as (keyof MotorSample)[]).every(key => Object.is(sample[key], b[i][key])));
    let start = performance.now();
    for (let i = 0; i < 100; i++)
        expect(fingerprint(a) === fingerprint(b)).toBe(true);
    const hashMs = performance.now() - start;
    start = performance.now();
    for (let i = 0; i < 100; i++)
        expect(direct()).toBe(true);
    const directMs = performance.now() - start;
    b[500].displacement += .1;
    expect(direct()).toBe(false);
    expect(fingerprint(a) === fingerprint(b)).toBe(false);
    writeFileSync(evidencePath('record-comparison-profile.json'), JSON.stringify({ runtime: process.version, samples: a.length, repeats: 100, hashMs, directMs, scope: 'Additional recorded-terminal motor comparison only; not model runtime or browser FPS' }, null, 2));
});
