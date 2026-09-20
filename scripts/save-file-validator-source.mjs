// Test-only entry bundled in memory. Never served by the runtime image.
export { inspectExperiment, canonical, metadataSchema } from '../src/persistence/format.ts';
import { inspectExperiment, deserializeExperiment } from '../src/persistence/format.ts';
import { loadDataset, modelConfig } from '../src/datasets/adapter.ts';
import { SYNTHETIC_CONFIG } from '../src/simulation/config.ts';
import datasetText from '../data/prepared/male-cns-dm1.json?raw';

let real;
export async function validateFile(text) {
    const file = await inspectExperiment(text);
    let config = SYNTHETIC_CONFIG, ids = Array.from({ length: 8 }, (_, i) => `fixture-${i}`);
    if (file.content.metadata.dataset === 'malecns') {
        real ??= loadDataset(datasetText, '38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d').then(async dataset => ({ config: await modelConfig(dataset), ids: dataset.neurons.map(n => n.id) }));
        ({ config, ids } = await real);
    }
    const restored = await deserializeExperiment(text, config, ids);
    return { file, replay: restored.experiment.replayStatus.status };
}
