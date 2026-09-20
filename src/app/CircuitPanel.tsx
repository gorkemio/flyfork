import { SelectedCircuit } from './SelectedCircuit';
import type { DatasetInfo } from '../datasets/catalog';
import { EDGES, NEURONS } from '../simulation/fixture';
import type { Telemetry } from '../worker-protocol/protocol';
const positions = [[50, 30], [210, 30], [72, 91], [188, 91], [36, 151], [224, 151], [89, 202], [171, 202]];
export function CircuitPanel({ telemetry, dataset }: {
    dataset?: DatasetInfo;
    telemetry: Telemetry | null;
}) {
    if (dataset?.kind === 'malecns')
        return <SelectedCircuit dataset={dataset} telemetry={telemetry}/>;
    if (!dataset)
        return <aside className="left-column" aria-label="Selected circuit"><section className="panel model-note">Loading selected dataset…</section></aside>;
    return <aside className="left-column" aria-label="Selected circuit">
  <section className="panel circuit-panel"><div className="section-heading"><h2>Neural circuit</h2><span className="micro-badge">LIF</span></div>
   
   <div className="fixture-label"><span className="diamond">◇</span><div><strong>Synthetic fixture</strong><span>8 neurons · {EDGES.length} directed connections</span></div></div>
   <svg className="network" viewBox="0 0 260 232" role="img" aria-label="Synthetic eight-neuron circuit: inputs, relays, inhibitory locals and outputs">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="15" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#507c90"/></marker></defs>
    {EDGES.map((e, i) => <line key={i} x1={positions[e.from][0]} y1={positions[e.from][1]} x2={positions[e.to][0]} y2={positions[e.to][1]} className={e.weight < 0 ? 'inhibitory' : 'connection'} markerEnd="url(#arrow)"/>)}
    {NEURONS.map((n, i) => <g key={n}><circle cx={positions[i][0]} cy={positions[i][1]} r="14" fill={i < 2 ? '#4fdad7' : i < 4 ? '#eec775' : i < 6 ? '#aa88d8' : '#73bcf2'} opacity={0.16 + Math.max(0, ((telemetry?.v[i] ?? -52) + 52) / 7) * 0.5}/><circle cx={positions[i][0]} cy={positions[i][1]} r="5" fill={i < 2 ? '#61efe1' : i < 4 ? '#f4cb7c' : i < 6 ? '#b18ce3' : '#82d1ff'}/><text x={positions[i][0] + (i % 2 ? 10 : -10)} y={positions[i][1] - 12} textAnchor={i % 2 ? 'start' : 'end'}>{n}</text></g>)}
   </svg>
   <p className="caption">Fixture topology · glow reflects membrane potential</p>
   <div className="hairline"/>
   <div className="section-heading"><h3>Membrane potential</h3><span className="unit">mV</span></div>
   <div className="potentials">{NEURONS.map((n, i) => <div className="potential" key={n}><span>{n}</span><div className="meter"><i style={{ width: `${Math.max(1, Math.min(100, ((telemetry?.v[i] ?? -52) + 62) / 17 * 100))}%` }}/></div><code>{(telemetry?.v[i] ?? -52).toFixed(1)}</code></div>)}</div>
   <div className="threshold-note"><span>Rest −52</span><span>Threshold −45</span></div>
  </section>
  <section className="panel model-note"><span className="eyebrow">MODEL, NOT BIOLOGY</span><p>Synthetic inputs → LIF → body.</p><span className="caption">Engineering decoder. No animal data loaded.</span></section>
 </aside>;
}
