import { SimulationHost } from './host';
import { commandSchema } from './protocol';
import { loadDataset, modelConfig } from '../datasets/adapter';
import datasetText from '../../data/prepared/male-cns-dm1.json?raw';
const DATASET_HASH = '38f691ce9d38faddb8277ada9f7ae70b198eb347742ede6b67fc8697925c2d0d';
let host: SimulationHost | null = null;
let initializing = false;
let jobScheduled = false, lastProgress = 0;
function continueWork() {
    if (!host?.computing) {
        jobScheduled = false;
        return;
    }
    const reply = host.continueJob();
    if (reply && (reply.kind !== 'PROGRESS' || performance.now() - lastProgress >= 50)) {
        self.postMessage(reply);
        lastProgress = performance.now();
    }
    setTimeout(continueWork, 0);
}
// Dataset/model selection is accepted only by a fresh worker's INIT. No runtime fallback.
self.onmessage = async (event: MessageEvent<unknown>) => {
    const parsed = commandSchema.safeParse(event.data);
    if (!host && parsed.success && parsed.data.type === 'INIT' && !initializing) {
        initializing = true;
        try {
            if (parsed.data.payload.dataset === 'malecns') {
                const d = await loadDataset(datasetText, DATASET_HASH);
                host = new SimulationHost(await modelConfig(d), d);
            }
            else
                host = new SimulationHost();
        }
        catch (error) {
            const c = parsed.data;
            self.postMessage({ protocolVersion: c.protocolVersion, kind: 'ERROR', requestId: c.requestId, sessionId: c.sessionId, epoch: c.epoch, revision: 0, sequence: 1, error: `MaleCNS load failed: ${error instanceof Error ? error.message : 'Invalid dataset'}` });
            return;
        }
    }
    if (host) {
        self.postMessage(await host.dispatch(event.data));
        if (host.computing && !jobScheduled) {
            jobScheduled = true;
            setTimeout(continueWork, 0);
        }
    }
};
// Synchronous batches are atomic. Browser messages run between tick boundaries.
setInterval(() => {
    const frame = host?.pulse();
    if (frame)
        self.postMessage(frame);
}, 50);
