/** Display resolution only. Limits never alter camera aspect or model coordinates. */
export function standardTargetSize(width: number, height: number, dpr: number, narrow: boolean) {
    const w = Math.max(1, width), h = Math.max(1, height);
    const scale = Math.min(Math.max(1, dpr), narrow ? 1 : 1.25, 576 / w, 1152 / h);
    return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)), scale };
}

/** An illustrative alternating tripod, keyed only by actual engine pathLength. */
export function gaitPose(pathLength: number, reducedMotion = false): number[] {
    const phase = reducedMotion ? 0 : pathLength * Math.PI * 2 / 1.8;
    return Array.from({ length: 6 }, (_, i) => reducedMotion ? 0 : Math.sin(phase + (i % 2) * Math.PI) * .19);
}
