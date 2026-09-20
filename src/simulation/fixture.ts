export const MODEL = 'synthetic-lif-v1' as const;
export const DT_MS = 0.1;
export const MAX_TICK = 1200000;
export const N = 8;
export const DELAY_SLOTS = 19;
export const NEURONS = Object.freeze(['Input L', 'Input R', 'Relay L', 'Relay R', 'Local L', 'Local R', 'Output L', 'Output R']);
export const EDGES = Object.freeze([
    { from: 0, to: 2, weight: 80 }, { from: 1, to: 3, weight: 80 },
    { from: 2, to: 6, weight: 95 }, { from: 3, to: 7, weight: 95 },
    { from: 2, to: 4, weight: 65 }, { from: 3, to: 5, weight: 65 },
    { from: 4, to: 3, weight: -12 }, { from: 5, to: 2, weight: -12 },
    { from: 6, to: 2, weight: 18 }, { from: 7, to: 3, weight: 18 },
    { from: 0, to: 3, weight: 8 }, { from: 1, to: 2, weight: 8 },
].map(edge => Object.freeze(edge)));
