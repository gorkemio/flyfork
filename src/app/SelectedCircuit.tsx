import type { DatasetInfo } from '../datasets/catalog';
import type { Telemetry } from '../worker-protocol/protocol';
const positions = [[57, 20], [201, 20], [57, 72], [201, 72], [57, 124], [201, 124]];
export function SelectedCircuit({ dataset, telemetry }: {
    dataset: DatasetInfo;
    telemetry: Telemetry | null;
}) {
    const pn = dataset.cells.flatMap((n, i) => n.type === 'DM1_lPN' ? [{ ...n, index: i }] : []);
    return <aside className="left-column real-circuit">
        <section className="panel circuit-panel"><div className="section-heading"><h2>Selected subgraph</h2><span className="micro-badge">LIF</span></div>
        <div className="fixture-label"><span className="diamond">◇</span><div><strong>{dataset.release}</strong><span>{dataset.neuronCount} neurons · {dataset.edgeCount.toLocaleString('en-US')} directed edges</span></div></div>
        <svg className="network" viewBox="0 0 260 160" role="img" aria-label="Real MaleCNS connectivity aggregated by neuron type and source side">
            {dataset.connections.map(e => <line key={`${e.from}-${e.to}`} x1={positions[e.from][0]} y1={positions[e.from][1]} x2={positions[e.to][0]} y2={positions[e.to][1]} className={e.sign < 0 ? 'inhibitory' : 'connection'} strokeWidth={Math.max(.5, Math.log10(e.synapses) / 2)}><title>{dataset.groups[e.from].name} → {dataset.groups[e.to].name}: {e.synapses} synapses</title></line>)}
            {dataset.groups.map((g, i) => <g key={g.name}><circle cx={positions[i][0]} cy={positions[i][1]} r="15" fill={i < 2 ? '#61efe1' : i < 4 ? '#f4cb7c' : '#b18ce3'} opacity=".22"/><circle cx={positions[i][0]} cy={positions[i][1]} r="5" fill={i < 2 ? '#61efe1' : i < 4 ? '#f4cb7c' : '#b18ce3'}/><text x={positions[i][0]} y={positions[i][1] + 21} textAnchor="middle">{g.name} ({g.indices.length})</text></g>)}
        </svg>
        <p className="caption">Type/side aggregation · source synapse counts</p><div className="hairline"/>
        <details><summary>PN cell readouts · mV / filtered Hz</summary>
        <div className="real-readouts">{pn.map(n => <div key={n.id}><span>DM1_lPN {n.side}<small> ID {n.id}</small></span><code>{telemetry?.v[n.index].toFixed(1) ?? '—'} / {telemetry?.motorFilter[n.side === 'L' ? 0 : 1].toFixed(1) ?? '—'}</code></div>)}</div></details>
        <p className="caption model-id">{dataset.model}</p><p className="caption">ORN side: nerve entry. PN side: soma.<br />Bilateral source connections retained.</p>
        </section>
        <section className="panel model-note"><span className="eyebrow">REAL CONNECTIVITY · ASSUMED DYNAMICS</span><p>ORN → LIF network → PN readout → body.</p><span className="caption">PNs are projection neurons. The motion decoder is engineered; animal behavior is unvalidated.</span><a className="caption credit-link" href="https://male-cns.janelia.org/download/" target="_blank" rel="noreferrer">MaleCNS collaboration</a><a className="caption" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 · selected and transformed</a></section>
    </aside>;
}
