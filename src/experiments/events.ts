import type { ModelConfig } from '../simulation/config';
export type BranchId = 'original' | 'A' | 'B';
export const OPERATOR_VERSION = 1;
export interface InterventionEvent {
    readonly id: string;
    readonly branch: 'A' | 'B';
    readonly model: string;
    readonly datasetHash: string;
    readonly configHash: string;
    readonly operatorVersion: 1;
    readonly operation: 'suppression' | 'odor-gain';
    readonly sourceIds: readonly string[];
    readonly sensoryChannel: 'odor' | null;
    readonly magnitude: number;
    readonly startTick: number;
    readonly endTick: number;
    readonly sequence: number;
}
export function secondsToTick(seconds: number, dt: number): number {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120)
        throw new Error('Seconds must be within 0–120');
    return Math.round(seconds * 1000 / dt);
}
export function validateEvent(e: InterventionEvent, branch: BranchId, c: ModelConfig, ids: readonly string[], log: readonly InterventionEvent[], earliest: number): InterventionEvent {
    if (branch === 'original' || e.branch !== branch || e.model !== c.model || e.datasetHash !== c.datasetHash || e.configHash !== c.configHash || e.operatorVersion !== OPERATOR_VERSION || c.events !== null)
        throw new Error('Event branch/model/operator mismatch');
    if (typeof e.id !== 'string' || !/^[\w-]{1,80}$/.test(e.id) || log.some(x => x.id === e.id) || e.sequence !== log.length + 1 || log.length >= 256)
        throw new Error('Invalid event ID/sequence or event limit');
    if (!Number.isSafeInteger(e.startTick) || !Number.isSafeInteger(e.endTick) || e.startTick < earliest || e.endTick <= e.startTick || e.endTick > 120000 / c.dt)
        throw new Error('Invalid interval or past event; start a new experiment to change history');
    if (!Number.isFinite(e.magnitude) || e.magnitude < 0 || e.magnitude > (e.operation === 'odor-gain' ? 2 : 1))
        throw new Error('Invalid magnitude');
    if (!Array.isArray(e.sourceIds) || new Set(e.sourceIds).size !== e.sourceIds.length)
        throw new Error('Invalid source IDs');
    if (e.operation === 'suppression') {
        if (e.sensoryChannel !== null || !e.sourceIds.length || e.sourceIds.some(id => !ids.includes(id)))
            throw new Error('Unknown suppression source ID');
    }
    else if (e.operation !== 'odor-gain' || e.sensoryChannel !== 'odor' || e.sourceIds.length)
        throw new Error('Unknown sensory channel/operator');
    for (const p of log)
        if (p.operation === e.operation && e.startTick < p.endTick && p.startTick < e.endTick && (e.operation === 'odor-gain' || e.sourceIds.some(id => p.sourceIds.includes(id))))
            throw new Error('Overlapping intervention on the same target');
    return Object.freeze({ ...e, sourceIds: Object.freeze([...e.sourceIds]) });
}
export function eventPhase(events: readonly InterventionEvent[], tick: number) {
    return { cursor: events.filter(e => e.startTick < tick).length,
        activeIds: events.filter(e => e.startTick <= tick && tick < e.endTick).sort((a, b) => a.sequence - b.sequence).map(e => e.id) };
}
