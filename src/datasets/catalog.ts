import { EDGES, NEURONS } from '../simulation/fixture';
import { SYNTHETIC_CONFIG } from '../simulation/config';
import type { ModelConfig } from '../simulation/config';
import type { Dataset } from './adapter';
export interface DatasetInfo {
    kind: 'synthetic' | 'malecns';
    title: string;
    release: string;
    hash: string;
    model: string;
    neuronCount: number;
    edgeCount: number;
    cells: {
        id: string;
        type: string;
        side: string;
        sign: number;
    }[];
    groups: {
        name: string;
        indices: number[];
    }[];
    connections: {
        from: number;
        to: number;
        synapses: number;
        sign: number;
    }[];
}
export function datasetInfo(d?: Dataset, c: ModelConfig = SYNTHETIC_CONFIG): DatasetInfo {
    if (!d)
        return { kind: 'synthetic', title: 'Synthetic fixture', release: 'Fixture v1', hash: c.datasetHash, model: c.model, neuronCount: 8, edgeCount: EDGES.length,
            cells: NEURONS.map((n, i) => ({ id: `fixture-${i}`, type: n, side: i % 2 ? 'R' : 'L', sign: i === 4 || i === 5 ? -1 : 1 })), groups: [], connections: [] };
    const groups = d.types.flatMap(type => ['L', 'R'].map(side => ({ name: `${type} ${side}`, indices: d.neurons.flatMap((n, i) => n.type === type && n.side === side ? [i] : []) })));
    const connections = [];
    for (let from = 0; from < groups.length; from++)
        for (let to = 0; to < groups.length; to++) {
            const synapses = d.edges.filter(e => groups[from].indices.includes(e[0]) && groups[to].indices.includes(e[1])).reduce((sum, e) => sum + e[2], 0);
            if (synapses)
                connections.push({ from, to, synapses, sign: d.neurons[groups[from].indices[0]].sign });
        }
    return { kind: 'malecns', title: 'Selected subgraph', release: d.release, hash: d.hash, model: c.model, neuronCount: d.neurons.length, edgeCount: d.edges.length, cells: d.neurons.map(n => ({ id: n.id, type: n.type, side: n.side, sign: n.sign })), groups, connections };
}
