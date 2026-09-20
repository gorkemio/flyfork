import { useState } from 'react';
import { DivergencePlot } from './DivergencePlot';
import type { LabView, Telemetry } from '../worker-protocol/protocol';
import type { BranchId } from '../experiments/events';
const labels = { original: 'Original', A: 'Fork A', B: 'Fork B' };
export function MetricsPanel({ view, current, selected }: {
    view: LabView | null;
    current: Telemetry | null;
    selected: BranchId;
}) {
    const [pair, setPair] = useState<'AO' | 'BO' | 'AB'>('AO');
    const all = view?.comparisons, saved = view?.snapshot, m = view?.metrics.branches[selected], r = view?.replay;
    const different = all && (!all.A.equal || !all.B.equal), ratio = current ? (current.motorFilter[0] + current.motorFilter[1]) / 400 : 0;
    return <aside className="right-column stage3-metrics" aria-label="Measured branch outcomes" tabIndex={0} aria-description="Scrollable panel. Review all three branch outcomes and the PN speed-limit details below.">
        <section className="panel snapshot-card" title="Full neural state, delayed signals, random streams, filters and body are preserved."><div className="section-heading"><h2>Snapshot S₀</h2><code>{saved ? `${(saved.tick / 10000).toFixed(3)} s` : 'Not captured'}</code></div>{!saved && <p className="muted">Capture a full state, then fork A + B.</p>}</section>
        <section className="panel divergence-card"><div className="section-heading"><h2 title="Mean shared-sample body distance divided by the arena diagonal. The line shows instantaneous separation on its own peak scale.">Position divergence</h2><span className="micro-badge">SAME TICK</span></div><div data-testid="comparison" className="comparison-result">{all ? (different ? 'Branches differ' : 'Matched · no numeric difference') : 'Not checked'}</div>
            <div className="divergence-row"><strong className="divergence-value">{view?.metrics.divergence[pair]?.toFixed(3) ?? '—'}</strong><label className="pair-label"><select aria-label="Comparison pair" value={pair} onChange={e => setPair(e.target.value as typeof pair)}><option value="AO">A ↔ Original</option><option value="BO">B ↔ Original</option><option value="AB">A ↔ B</option></select></label></div>
            <p className="caption">Mean distance / arena diagonal</p><DivergencePlot view={view} pair={pair}/><p className="caption">Line: instantaneous difference · own peak scale</p><p className="caption window-label">{view?.metrics.reason ?? `${((view?.metrics.startTick ?? 0) / 10000).toFixed(2)}–${((view?.metrics.endTick ?? 0) / 10000).toFixed(2)} s · 10 ms samples`}</p>
        </section>
        <section className="panel replay-card"><div className="section-heading"><h2>Replay check</h2><strong data-testid="replay-status" className={r?.status === 'Matched' ? 'matched' : ''}>{r?.status ?? 'Not checked'}</strong></div><p className="caption">{r?.status === 'Matched' ? `Own histories · ${(r.tick / 10000).toFixed(3)} s · ${r.checked} state checks.` : r?.detail ?? 'Each branch is recomputed from its own start and events.'}</p></section>
        <section className="panel comparison-table"><h2>Measured outcomes</h2><table><thead><tr><th>Branch</th><th>Path (u)</th><th>Explore</th></tr></thead><tbody>{(['original', 'A', 'B'] as const).map((id, i) => { const t = id === 'original' ? view?.original : id === 'A' ? view?.branch : view?.branchB, b = view?.metrics.branches[id]; return <tr key={id}><td><i className={`dot ${['amber', 'cyan', 'violet'][i]}`}/>{labels[id]}<code className="table-tick" data-testid={['original-tick', 'fork-tick', 'fork-b-tick'][i]}>{t?.tick ?? '—'}</code></td><td>{b?.path.toFixed(2) ?? '—'}</td><td>{b ? `${(100 * b.exploration).toFixed(1)}%` : '—'}</td></tr>; })}</tbody></table>
            <details><summary>Goal proximity, entry and cost</summary><div className="proximity-list">{(['original', 'A', 'B'] as const).map((id, i) => <div key={id} title="Geometric proximity to goal region; ignores walls. Not a probability."><span>{labels[id]}</span><div className="metric-track"><i className={['amber', 'cyan', 'violet'][i]} style={{ width: `${100 * (view?.metrics.branches[id]?.proximity ?? 0)}%` }}/></div><code>{view?.metrics.branches[id]?.proximity.toFixed(2) ?? '—'}</code></div>)}</div>
            {(['original', 'A', 'B'] as const).map(id => { const b = view?.metrics.branches[id]; return <p className="caption" key={id}>{labels[id]} · entry {b?.goalTick != null ? `${b.goalTick / 10000} s` : 'not reached'} · cost {b?.cost.toFixed(4) ?? '—'}</p>; })}<p className="caption">Cost = magnitude × scope × duration / window. A game metric, not biological energy. Proximity ignores walls.</p></details>
        </section>
        <section className="panel decoder-card"><div className="section-heading"><h2>PN output · {labels[selected]}</h2><span className="unit">Hz</span></div><div className="motor-values"><strong>{(current?.motorFilter[0] ?? 0).toFixed(1)}<small> left</small></strong><strong>{(current?.motorFilter[1] ?? 0).toFixed(1)}<small> right</small></strong></div>
            <p className="cap-status">{ratio >= 1 ? 'Speed limit active' : 'Below speed limit'}<span> Δ {(current ? (current.motorFilter[1] - current.motorFilter[0]) : 0).toFixed(1)} Hz</span></p>
            <dl className="state-checks"><div><dt>Raw ratio → command</dt><dd>{ratio.toFixed(2)} → {(current?.body.speed ?? 0).toFixed(2)} u/s</dd></div><div><dt>Cap time / window</dt><dd>{m ? `${(m.capFraction * 100).toFixed(1)}% · ${m.capSeconds.toFixed(2)} s` : '—'}</dd></div><div><dt>Collision stall time</dt><dd>{m ? `${m.stallSeconds.toFixed(2)} s` : '—'}</dd></div></dl>
            <details><summary>Decoder and motion details</summary><dl className="state-checks"><div><dt>Pre-clamp speed</dt><dd>{(6 * ratio).toFixed(2)} u/s</dd></div><div><dt>Turn command</dt><dd>{(current?.body.angularVelocity ?? 0).toFixed(3)} rad/s</dd></div><div><dt>Mean actual displacement</dt><dd>{m?.displacement.toFixed(4) ?? '—'} u/10 ms</dd></div></dl><p className="caption">Fixed divisor 400, maximum 6 u/s. Collision can prevent movement. PN→body is an engineering decoder.</p></details>
        </section>
    </aside>;
}
