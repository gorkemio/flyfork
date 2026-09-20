import { WORLD, isFree } from '../simulation/world';
import type { SimState } from '../simulation/state';
import type { MotorSample } from '../simulation/engine';
import type { InterventionEvent } from '../experiments/events';
const diagonal = Math.hypot(WORLD.width, WORLD.height);
export function accessibleCells(): Set<string> {
    const seen = new Set<string>(), queue: [
        [
            number,
            number
        ]
    ] | [
        number,
        number
    ][] = [[20, 66]];
    for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i], key = `${x},${y}`;
        if (x < 0 || x >= 40 || y < 0 || y >= 80 || seen.has(key) || !isFree(x + .5, y + .5))
            continue;
        seen.add(key);
        queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    return seen;
}
const accessible = accessibleCells();
export interface BranchMetrics {
    startTick: number;
    endTick: number;
    samples: number;
    path: number;
    exploration: number;
    proximity: number;
    goalTick: number | null;
    cost: number;
    leftHz: number;
    rightHz: number;
    pnDifference: number;
    rawRatio: number;
    rawSpeed: number;
    speed: number;
    turn: number;
    capFraction: number;
    capSeconds: number;
    stallFraction: number;
    stallSeconds: number;
    displacement: number;
}
export interface WindowMetrics {
    reason: string | null;
    startTick: number;
    endTick: number;
    branches: Partial<Record<'original' | 'A' | 'B', BranchMetrics>>;
    divergence: {
        AO: number | null;
        BO: number | null;
        AB: number | null;
    };
}
export function interventionCost(events: readonly InterventionEvent[], start: number, end: number, neurons: number): number {
    return events.reduce((sum, e) => sum + Math.max(0, Math.min(end, e.endTick) - Math.max(start, e.startTick)) / (end - start)
        * (e.operation === 'suppression' ? e.magnitude * e.sourceIds.length / neurons : Math.abs(e.magnitude - 1)), 0);
}
export function branchMetrics(state: SimState, samples: readonly MotorSample[], events: readonly InterventionEvent[], start: number, end: number): BranchMetrics | null {
    const points = state.trail.filter(p => p.tick >= start && p.tick <= end);
    const measures = samples.filter(s => s.tick > start && s.tick <= end);
    if (end <= start || points.length < 2 || points[0].tick !== start || points.at(-1)!.tick !== end || measures.length !== points.length - 1)
        return null;
    let path = 0;
    for (let i = 1; i < points.length; i++)
        path += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const visited = new Set(points.map(p => `${Math.floor(p.x)},${Math.floor(p.y)}`).filter(key => accessible.has(key)));
    const last = points.at(-1)!, mean = (get: (s: MotorSample) => number) => measures.reduce((sum, s) => sum + get(s), 0) / measures.length;
    const capFraction = mean(s => Number(s.ratio >= 1)), stallFraction = mean(s => Number(s.blocked)), duration = (end - start) * state.dt / 1000;
    return { startTick: start, endTick: end, samples: points.length, path, exploration: visited.size / accessible.size,
        proximity: Math.max(0, Math.min(1, 1 - Math.max(0, Math.hypot(last.x - WORLD.goalX, last.y - WORLD.goalY) - WORLD.goalRadius) / diagonal)),
        goalTick: state.goalReachedTick !== null && state.goalReachedTick <= end ? state.goalReachedTick : null, cost: interventionCost(events, start, end, state.neurons),
        leftHz: mean(s => s.leftHz), rightHz: mean(s => s.rightHz), pnDifference: mean(s => s.rightHz - s.leftHz), rawRatio: mean(s => s.ratio), rawSpeed: 6 * mean(s => s.ratio), speed: mean(s => s.speed), turn: mean(s => s.turn),
        capFraction, capSeconds: capFraction * duration, stallFraction, stallSeconds: stallFraction * duration, displacement: mean(s => s.displacement) };
}
export function divergence(a: SimState, b: SimState, start: number, end: number): number | null {
    if (a.tick !== b.tick || end <= start)
        return null;
    const aa = a.trail.filter(p => p.tick >= start && p.tick <= end), bb = b.trail.filter(p => p.tick >= start && p.tick <= end);
    if (aa.length < 2 || aa.length !== bb.length || aa[0].tick !== start || aa.at(-1)!.tick !== end || aa.some((p, i) => p.tick !== bb[i].tick))
        return null;
    return aa.reduce((sum, p, i) => sum + Math.hypot(p.x - bb[i].x, p.y - bb[i].y), 0) / aa.length / diagonal;
}
