import type { LabView } from '../worker-protocol/protocol';
export function DivergencePlot({ view, pair }: {
    view: LabView | null;
    pair: 'AO' | 'BO' | 'AB';
}) {
    const a = pair === 'BO' ? view?.branchB : view?.branch, b = pair === 'AB' ? view?.branchB : view?.original;
    const start = view?.metrics.startTick ?? 0, end = view?.metrics.endTick ?? 0;
    if (!a || !b || end <= start)
        return <div className="plot-empty">Awaiting a shared time window</div>;
    const other = new Map(b.trail.map(p => [p.tick, p]));
    const points = a.trail.filter(p => p.tick >= start && p.tick <= end).map(p => { const q = other.get(p.tick); return { tick: p.tick, value: q ? Math.hypot(p.x - q.x, p.y - q.y) / Math.hypot(40, 80) : 0 }; });
    const last = points.at(-1);
    if (!last) return <div className="plot-empty">Awaiting a shared time window</div>;
    const lastX = 4 + (last.tick - start) / (end - start) * 252;
    const peak = Math.max(.001, ...points.map(p => p.value)), stride = Math.max(1, Math.floor(points.length / 250));
    const line = points.filter((_, i) => i % stride === 0 || i === points.length - 1).map(p => `${4 + (p.tick - start) / (end - start) * 252},${48 - p.value / peak * 42}`).join(' ');
    return <svg className="divergence-plot" viewBox="0 0 260 54" role="img" aria-label={`Instantaneous normalized separation ${pair}, peak ${peak.toFixed(5)}; horizontal axis ${(start / 10000).toFixed(2)} to ${(end / 10000).toFixed(2)} seconds`}><path className="plot-grid" d="M4 6H256M4 27H256M4 48H256M67 6V48M130 6V48M193 6V48"/><polygon className="plot-area" points={`4,48 ${line} ${lastX},48`}/><polyline points={line}/><circle className="plot-end" cx={lastX} cy={48 - last.value / peak * 42} r="2.4"/></svg>;
}
