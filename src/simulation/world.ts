export const WORLD = Object.freeze({ width: 40, height: 80, goalX: 28, goalY: 10, goalRadius: 3, bodyRadius: 0.7 });
export const WALLS = Object.freeze([
    { x: 1, y: 40, w: 2, h: 80 }, { x: 39, y: 40, w: 2, h: 80 },
    { x: 20, y: 1, w: 40, h: 2 }, { x: 20, y: 79, w: 40, h: 2 },
    { x: 9, y: 18, w: 16, h: 3 }, { x: 16, y: 11, w: 3, h: 14 },
    { x: 11, y: 34, w: 4, h: 14 }, { x: 28, y: 43, w: 5, h: 17 },
    { x: 7, y: 50, w: 12, h: 3 }, { x: 35, y: 28, w: 8, h: 4 },
    { x: 9, y: 69, w: 5, h: 10 }, { x: 33, y: 72, w: 12, h: 3 },
].map(wall => Object.freeze(wall)));
export function isFree(x: number, y: number): boolean {
    const r = WORLD.bodyRadius;
    return !WALLS.some(w => Math.abs(x - w.x) < w.w / 2 + r && Math.abs(y - w.y) < w.h / 2 + r);
}
