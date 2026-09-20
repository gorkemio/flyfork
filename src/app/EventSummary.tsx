import type { LabView } from '../worker-protocol/protocol';
import type { BranchId } from '../experiments/events';
export function EventSummary({ view, branch }: {
    view: LabView | null;
    branch: BranchId;
}) {
    if (branch === 'original')
        return <p>Control · no intervention</p>;
    const events = view?.events.filter(e => e.branch === branch) ?? [];
    if (!events.length)
        return <p>No recorded intervention</p>;
    const tick = view!.original.tick;
    const current = events.find(e => e.startTick <= tick && tick < e.endTick) ?? events.find(e => e.startTick > tick) ?? events.at(-1)!;
    const group = view!.dataset.groups.find(g => g.indices.length === current.sourceIds.length && g.indices.every(i => current.sourceIds.includes(view!.dataset.cells[i].id)));
    const target = current.operation === 'odor-gain' ? 'both antennae' : group?.name ?? current.sourceIds.join(', ');
    const phase = current.endTick <= tick ? 'Ended' : current.startTick <= tick ? 'Active' : 'Scheduled';
    return <p className="recorded-event" data-testid={`event-summary-${branch}`}><span>{current.operation} {current.magnitude} · {target}</span><span>{current.startTick / 10000}–{current.endTick / 10000} s · {phase}{events.length > 1 ? ` · ${events.length} recorded events` : ''}</span></p>;
}
