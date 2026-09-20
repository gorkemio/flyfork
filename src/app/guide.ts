import type { LabClient } from './lab-client';
import type { Action } from '../worker-protocol/protocol';
export async function guidedStep(client: LabClient, step: number, cancelled: () => boolean): Promise<void> {
    const command = async (action: Action) => {
        if (cancelled())
            throw new Error('Guide cancelled. The computed experiment remains paused.');
        await client.request(action);
        if (cancelled())
            throw new Error('Guide cancelled. The computed experiment remains paused.');
    };
    if (step === 0) {
        await command({ type: 'STEP', payload: { ticks: 20000 } });
        await command({ type: 'SNAPSHOT', payload: {} });
        await command({ type: 'FORK', payload: {} });
    }
    else if (step === 1) {
        const v = client.view!;
        const sourceIds = v.dataset.groups.find(g => g.name === 'DM1_lPN L')?.indices.map(i => v.dataset.cells[i].id);
        if (v.dataset.kind !== 'malecns' || !sourceIds?.length)
            throw new Error('Guided source group unavailable; no substitute was used.');
        for (const branch of ['A', 'B'] as const)
            await command({ type: 'SCHEDULE_INTERVENTION', payload: { id: crypto.randomUUID(), branch, model: v.dataset.model, datasetHash: v.dataset.hash, configHash: v.configHash, operatorVersion: 1, operation: branch === 'A' ? 'suppression' : 'odor-gain', sourceIds: branch === 'A' ? sourceIds : [], sensoryChannel: branch === 'A' ? null : 'odor', magnitude: branch === 'A' ? 1 : 0, startTick: 30000, endTick: 80000, sequence: 1 } });
    }
    else if (step === 2) {
        await command({ type: 'STEP', payload: { ticks: 50000 } });
        await command({ type: 'STEP', payload: { ticks: 50000 } });
        await command({ type: 'COMPARE', payload: {} });
    }
    else if (step === 3) {
        await command({ type: 'REPLAY', payload: {} });
        await command({ type: 'COMPARE', payload: {} });
    }
}
