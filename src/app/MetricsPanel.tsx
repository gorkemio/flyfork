import { useState } from 'react';
import type { ReactNode } from 'react';
import { DivergencePlot } from './DivergencePlot';
import type { LabView, Telemetry } from '../worker-protocol/protocol';
import type { BranchId } from '../experiments/events';
const labels = { original: 'Original', A: 'Fork A', B: 'Fork B' };
export function PNComparison({ view, children }: { view: LabView | null; children: ReactNode }) {
    return <section className="panel pn-card"><div className="section-heading"><h2 title="Current left/right filter readouts, not spike-count window rates.">PN output · filtered Hz</h2></div>

            <table className="pn-table" aria-label="Current filtered PN output at viewing time"><thead><tr><th scope="col">Branch</th><th scope="col">Left</th><th scope="col">Right</th></tr></thead><tbody>{(['original', 'A', 'B'] as const).map(id => { const t = id === 'original' ? view?.original : id === 'A' ? view?.branch : view?.branchB; return <tr key={id}><th scope="row"><span className={`branch-line ${id}`} aria-hidden="true"/>{labels[id]}</th><td data-testid={`pn-${id}-left`}>{t?.motorFilter[0].toFixed(1) ?? '—'}</td><td data-testid={`pn-${id}-right`}>{t?.motorFilter[1].toFixed(1) ?? '—'}</td></tr>; })}</tbody></table>
            {(!view || !view.branch || !view.branchB) && <p className="caption">{view ? '— unavailable at viewing time' : 'Waiting for experiment telemetry.'}</p>}
        {children}</section>;
}
export function MetricsPanel({ view, current, selected }: {
    view: LabView | null;
    current: Telemetry | null;
    selected: BranchId;
}) {
    const [pair, setPair] = useState<'AO' | 'BO' | 'AB'>('AO');
    const all = view?.comparisons, m = view?.metrics.branches[selected], r = view?.replay;
    const different = all && (!all.A.equal || !all.B.equal), ratio = current ? (current.motorFilter[0] + current.motorFilter[1]) / 400 : null;
    return <aside className="right-column stage3-metrics" aria-label="Measured branch outcomes" tabIndex={0} aria-description="Shared-window outcomes, position separation, separate numerical checks and selected branch decoder.">
        <section className="panel comparison-table"><h2>Measured outcomes</h2><table><thead><tr><th>Branch</th><th>Path (u)</th><th>Explore</th></tr></thead><tbody>{(['original', 'A', 'B'] as const).map((id, i) => { const t = id === 'original' ? view?.original : id === 'A' ? view?.branch : view?.branchB, b = view?.metrics.branches[id]; return <tr key={id}><td><i className={`dot ${['amber', 'cyan', 'violet'][i]}`}/>{labels[id]}<code className="table-tick" data-testid={['original-tick', 'fork-tick', 'fork-b-tick'][i]}>{t?.tick ?? '—'}</code></td><td>{b?.path.toFixed(2) ?? '—'}</td><td>{b ? `${(100 * b.exploration).toFixed(1)}%` : '—'}</td></tr>; })}</tbody></table>
            <details><summary>Goal proximity, entry and cost</summary><div className="proximity-list">{(['original', 'A', 'B'] as const).map((id, i) => <div key={id} title="Geometric proximity to goal region; ignores walls. Not a probability."><span>{labels[id]}</span><div className="metric-track" aria-hidden="true"><i className={['amber', 'cyan', 'violet'][i]} style={{ width: `${100 * (view?.metrics.branches[id]?.proximity ?? 0)}%` }}/></div><code>{view?.metrics.branches[id]?.proximity.toFixed(2) ?? '—'}</code></div>)}</div>
            {(['original', 'A', 'B'] as const).map(id => { const b = view?.metrics.branches[id]; return <p className="caption" key={id}>{labels[id]} · entry {!b ? '—' : b.goalTick != null ? `${b.goalTick / 10000} s` : 'not reached'} · cost {b?.cost.toFixed(4) ?? '—'}</p>; })}<p className="caption">Cost = magnitude × scope × duration / window. A game metric, not biological energy. Proximity ignores walls.</p></details>
        </section>
        <section className="panel divergence-card"><div className="section-heading"><h2 title="Mean shared-sample body distance divided by the arena diagonal. The line shows instantaneous separation on its own peak scale.">Position divergence</h2><span className="micro-badge">SAME TICK</span></div>
            <dl className="divergence-pairs">{(['AO', 'BO', 'AB'] as const).map(id => <div key={id}><dt>{id === 'AO' ? 'A ↔ Original' : id === 'BO' ? 'B ↔ Original' : 'A ↔ B'}</dt><dd data-testid={`divergence-${id}`}>{view?.metrics.divergence[id]?.toFixed(3) ?? '—'}</dd></div>)}</dl>
            <label className="pair-label">Plot pair<select aria-label="Comparison pair" value={pair} onChange={e => setPair(e.target.value as typeof pair)}><option value="AO">A ↔ Original</option><option value="BO">B ↔ Original</option><option value="AB">A ↔ B</option></select></label>
            <p className="caption">Mean distance / arena diagonal</p><DivergencePlot view={view} pair={pair}/><p className="caption">Line: instantaneous difference · own peak scale</p><p className="caption window-label">{view?.metrics.reason ?? `${((view?.metrics.startTick ?? 0) / 10000).toFixed(2)}–${((view?.metrics.endTick ?? 0) / 10000).toFixed(2)} s · 10 ms samples`}</p>
        </section>
        <section className="panel checks-card"><h2>Numerical checks</h2><h3>State comparison</h3><div data-testid="comparison" className="comparison-result">{all ? (different ? 'Branches differ' : 'Matched · no numeric difference') : 'Not checked'}</div><p className="caption">{all ? `Full states compared at ${(all.A.tick / 10000).toFixed(3)} s.` : 'Compare states checks full numeric states at the same tick.'}</p>
            <div className="replay-result"><div className="section-heading"><h3>Replay check</h3><strong data-testid="replay-status" className={r?.status === 'Matched' ? 'matched' : ''}>{r?.status ?? 'Not checked'}</strong></div><p className="caption">{r?.status === 'Matched' ? `Own histories · ${(r.tick / 10000).toFixed(3)} s · ${r.checked} state checks.` : r?.detail ?? 'Each branch is recomputed from its own start and events.'}</p><p className="caption">Numerical reproduction, not biological validation.</p></div>
        </section>
        <section className="panel decoder-card"><div className="section-heading"><h2>Decoder · {labels[selected]}</h2></div>
            <p className="cap-status">{ratio === null ? 'Readout unavailable' : ratio >= 1 ? 'Speed limit active' : 'Below speed limit'}<span> Right − left {current ? (current.motorFilter[1] - current.motorFilter[0]).toFixed(1) : '—'} Hz</span></p>
            <dl className="state-checks"><div><dt>Raw ratio → command</dt><dd>{ratio?.toFixed(2) ?? '—'} → {current?.body.speed.toFixed(2) ?? '—'} u/s</dd></div><div><dt>Cap time / window</dt><dd>{m ? `${(m.capFraction * 100).toFixed(1)}% · ${m.capSeconds.toFixed(2)} s` : '—'}</dd></div><div><dt>Collision stall time</dt><dd>{m ? `${m.stallSeconds.toFixed(2)} s` : '—'}</dd></div></dl>
            <details><summary>Decoder and motion details</summary><dl className="state-checks"><div><dt>Pre-clamp speed</dt><dd>{ratio === null ? '—' : (6 * ratio).toFixed(2)} u/s</dd></div><div><dt>Turn command</dt><dd>{current?.body.angularVelocity.toFixed(3) ?? '—'} rad/s</dd></div><div><dt>Mean actual displacement</dt><dd>{m?.displacement.toFixed(4) ?? '—'} u/10 ms</dd></div></dl><p className="caption">Speed cap: (left + right filtered Hz) / 400 ≥ 1; maximum 6 u/s. Collision can prevent movement. PN→body is an engineering decoder.</p></details>
        </section>
    </aside>;
}
