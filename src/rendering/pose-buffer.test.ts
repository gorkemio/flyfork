import { expect, it } from 'vitest';
import { PoseBuffer } from './pose-buffer';
import { createInitialState, stepTicks, compareStates, snapshot } from '../simulation/engine';
it('interpolates only between confirmed samples and clears discontinuities', () => {
    const b = new PoseBuffer();
    b.push({ tick: 0, x: 0, y: 0, heading: 0 }, 'A', 0);
    b.push({ tick: 100, x: 10, y: 20, heading: 1 }, 'A', 50);
    expect(b.sample(75)).toMatchObject({ x: 5, y: 10, heading: 0.5 });
    expect(b.sample(500)).toMatchObject({ x: 10, y: 20 });
    b.push({ tick: 0, x: 2, y: 3, heading: 0 }, 'restore', 500);
    expect(b.sample(500)).toMatchObject({ x: 2, y: 3 });
    b.push({ tick: 10, x: 9, y: 9, heading: 0 }, 'B', 501);
    expect(b.sample(501)).toMatchObject({ x: 9, y: 9 });
});
it('renderer off, 15 FPS and 144 FPS leave the complete motor state identical', () => {
    const expected = createInitialState(42);
    stepTicks(expected, 20000);
    for (const fps of [0, 15, 144]) {
        const s = createInitialState(42);
        const b = new PoseBuffer();
        let frame = 0;
        for (let tick = 0; tick < 20000; tick += 500) {
            stepTicks(s, 500);
            const copy = snapshot(s);
            b.push({ tick: s.tick, ...s.body }, 'A', tick / 10);
            while (fps > 0 && frame * 1000 / fps < tick / 10 + 50) {
                b.sample(frame * 1000 / fps);
                frame++;
            }
            expect(compareStates(s, copy).equal).toBe(true);
        }
        expect(frame).toBe(fps * 2);
        expect(compareStates(s, expected).equal).toBe(true);
    }
});
