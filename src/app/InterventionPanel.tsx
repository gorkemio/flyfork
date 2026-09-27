import { useState } from 'react';
import type { LabView, Action } from '../worker-protocol/protocol';
import { secondsToTick } from '../experiments/events';
export function InterventionPanel({ view, paused, pending, send }: {
    view: LabView | null;
    paused: boolean;
    pending: boolean;
    send: (a: Action, trigger?: HTMLElement) => void;
}) {
    const [branch, setBranch] = useState<'A' | 'B'>('A'), [operation, setOperation] = useState<'suppression' | 'odor-gain'>('suppression'), [group, setGroup] = useState('DM1_lPN L');
    const [magnitude, setMagnitude] = useState(.5), [delay, setDelay] = useState(1), [duration, setDuration] = useState(5);
    const now = view?.original.tick ?? 0;
    const valid = Number.isFinite(delay) && Number.isFinite(duration) && delay >= 0 && duration > 0 && delay + duration <= 120;
    const startTick = valid && now / 10000 + delay <= 120 ? secondsToTick(now / 10000 + delay, .1) : null;
    const endTick = startTick !== null && startTick / 10000 + duration <= 120 ? secondsToTick(startTick / 10000 + duration, .1) : null;
    const ids = operation === 'suppression' ? (view?.dataset.groups.find(g => g.name === group)?.indices.map(i => view.dataset.cells[i].id) ?? []) : [];
    const eligible = paused && view?.branch && view.original.tick === view.highWater && startTick !== null && endTick !== null && endTick > startTick && (operation === 'odor-gain' || ids.length > 0);
    function apply(trigger: HTMLElement) {
        if (!eligible || !view || startTick === null || endTick === null)
            return;
        send({ type: 'SCHEDULE_INTERVENTION', payload: { id: crypto.randomUUID(), branch, model: view.dataset.model, datasetHash: view.dataset.hash, configHash: view.configHash, operatorVersion: 1, operation, sourceIds: ids, sensoryChannel: operation === 'odor-gain' ? 'odor' : null, magnitude, startTick, endTick, sequence: view.eventRevisions[branch] + 1 } }, trigger);
    }
    return <section className="panel interventions"><div className="section-heading"><h2>Connectome intervention</h2></div><p className="caption draft-disclaimer"><strong>Draft · Not applied</strong></p>
        <div className="draft-row"><label>Branch<select aria-label="Intervention branch" value={branch} onChange={e => setBranch(e.target.value as 'A' | 'B')}><option value="A">Fork A</option><option value="B">Fork B</option></select></label><label>Operator<select aria-label="Operator" value={operation} onChange={e => { const op = e.target.value as typeof operation; setOperation(op); setMagnitude(op === 'suppression' ? .5 : 1); }}><option value="suppression">Suppression</option><option value="odor-gain">Odor gain</option></select></label></div>
        {operation === 'suppression' ? <label className="draft-target">Source group<select aria-label="Source group" value={group} onChange={e => setGroup(e.target.value)}>{view?.dataset.groups.map(g => <option key={g.name}>{g.name}</option>)}</select></label> : <p className="draft-target">Sensory channel <strong>Odor · both antennae</strong></p>}
        <label className="magnitude-label">{operation === 'suppression' ? 'Modeled suppression' : 'Odor gain'}<output>{magnitude.toFixed(2)}{operation === 'odor-gain' ? '×' : ''}</output><input aria-label="Magnitude" type="range" min="0" max={operation === 'suppression' ? 1 : 2} step="0.05" value={magnitude} onChange={e => setMagnitude(Number(e.target.value))}/></label>
        <p className="caption operator-note">{operation === 'suppression' ? 'Shunting, not spike reduction %. At 1 while active: cells stay at rest; filters and queued signals remain.' : 'Scales new odor input at both antennae; existing activity and events remain.'}</p>
        <div className="draft-row"><label>Start after (s)<input aria-label="Start after seconds" type="number" min="0" max="120" step="0.1" value={Number.isNaN(delay) ? '' : delay} onChange={e => setDelay(e.target.value === '' ? NaN : Number(e.target.value))}/></label><label>Duration (s)<input aria-label="Duration seconds" type="number" min="0.0001" max="120" step="0.1" value={Number.isNaN(duration) ? '' : duration} onChange={e => setDuration(e.target.value === '' ? NaN : Number(e.target.value))}/></label></div>
        <p className="event-preview">{startTick !== null && endTick !== null ? `${(startTick / 10000).toFixed(4)}–${(endTick / 10000).toFixed(4)} s · [${startTick}, ${endTick})` : 'Enter an interval within 120 s'}</p>
        <button className="button primary apply-event" disabled={!eligible} aria-disabled={pending || undefined} onClick={event => apply(event.currentTarget)}>Apply intervention</button>
        {!view?.branch ? <p className="caption">Capture S₀ and fork before applying.</p> : now !== view.highWater ? <p className="caption">Viewing history. Seek to the recorded present to apply.</p> : <p className="caption">Apply creates an immutable event.</p>}
        <details className="event-log"><summary>Applied events ({view?.events.length ?? 0})</summary>{view?.events.length ? view.events.map(e => <p key={e.id}><b>Fork {e.branch}</b> · {e.operation} {e.magnitude}<br />{e.startTick / 10000}–{e.endTick / 10000} s · {e.endTick <= now ? 'Ended' : e.startTick <= now ? 'Active' : 'Scheduled'}</p>) : <p>No intervention applied.</p>}</details>
    </section>;
}
