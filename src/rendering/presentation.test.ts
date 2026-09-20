import { describe, expect, it } from 'vitest';
import { standardTargetSize, gaitPose } from './presentation';
import { createRibbon } from './trail';
import type { BufferAttribute } from 'three';

describe('Standard presentation is bounded and independent of the experiment', () => {
    it('preserves each real viewport aspect at different DPRs and at the RT ceiling', () => {
        for (const [width, height, dpr, narrow] of [[330, 570, 2, false], [281, 510, 1, false], [366, 590, 3, true], [900, 2000, 2, false]] as const) {
            const size = standardTargetSize(width, height, dpr, narrow);
            expect(size.width).toBeLessThanOrEqual(576);
            expect(size.height).toBeLessThanOrEqual(1152);
            expect(Math.abs(size.width / size.height - width / height)).toBeLessThan(2 / size.height);
            expect(size.scale).toBeLessThanOrEqual(narrow ? 1 : 1.25);
        }
    });
    it('uses actual accumulated displacement: pause/stall cannot advance gait; seek is reversible', () => {
        const atFive = gaitPose(7.345);
        expect(gaitPose(7.345)).toEqual(atFive);
        expect(gaitPose(9.12)).not.toEqual(atFive);
        expect(gaitPose(7.345)).toEqual(atFive);
        expect(gaitPose(0, true)).toEqual(gaitPose(100, true));
        expect(gaitPose(1e6).every(Number.isFinite)).toBe(true);
    });
    it('keeps exact recorded segment centres, cuts future samples, and reuses every GPU attribute', () => {
        const ribbon = createRibbon('#4de4ec', 1);
        const trail = [{ tick: 0, x: 1, y: 2, heading: 0 }, { tick: 100, x: 4, y: 6, heading: 0 }, { tick: 200, x: 4, y: 6, heading: 1 }, { tick: 300, x: 7, y: 2, heading: 2 }];
        const attributes = { ...ribbon.geometry.attributes };
        ribbon.update(trail, 300, 'session');
        expect(ribbon.geometry.drawRange.count).toBe(18);
        const positions = ribbon.geometry.getAttribute('position') as BufferAttribute;
        for (let i = 0; i < trail.length; i++) {
            expect(positions.getX(i * 2)).toBe(trail[i].x);
            expect(positions.getZ(i * 2)).toBe(trail[i].y);
        }
        expect(ribbon.distanceAt(300)).toBe(10);
        ribbon.update(trail, 100, 'session');
        expect(ribbon.geometry.drawRange.count).toBe(6);
        expect(ribbon.sampleCount).toBe(2);
        const version = positions.version;
        ribbon.update(trail, 100, 'session');
        expect(positions.version).toBe(version);
        ribbon.update(trail, 300, 'session');
        expect(ribbon.distanceAt(300)).toBe(10);
        for (const name of Object.keys(attributes)) expect(ribbon.geometry.attributes[name]).toBe(attributes[name]);
        ribbon.update([{ tick: 0, x: 9, y: 9, heading: 0 }], 0, 'new-session');
        expect(ribbon.geometry.drawRange.count).toBe(0);
        expect(positions.getX(0)).toBe(9);
        ribbon.dispose();
    });
});
