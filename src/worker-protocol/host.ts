import { snapshot, restore } from '../simulation/engine';
import type { SimState } from '../simulation/engine';
import { MAX_TICK } from '../simulation/fixture';
import { SYNTHETIC_CONFIG } from '../simulation/config';
import type { ModelConfig } from '../simulation/config';
import { datasetInfo } from '../datasets/catalog';
import type { Dataset } from '../datasets/adapter';
import { Experiment } from '../experiments/experiment';
import { commandSchema } from './protocol';
import type { Command, Reply, LabView, Telemetry } from './protocol';
import { captureExperiment } from '../persistence/recording';
import { serializeExperiment, deserializeExperiment } from '../persistence/format';
function telemetry(s: SimState): Telemetry {
    return { tick: s.tick, body: { ...s.body }, v: Array.from(s.v), motorFilter: Array.from(s.motorFilter), spikes: Array.from(s.spikeCounts), trail: s.trail.map(p => ({ ...p })), goalReachedTick: s.goalReachedTick };
}
export class SimulationHost {
    readonly info: ReturnType<typeof datasetInfo>;
    experiment: Experiment;
    get original() { return this.experiment.original.state; }
    get branch() { return this.experiment.branches.A?.state ?? null; }
    get branchB() { return this.experiment.branches.B?.state ?? null; }
    saved: SimState | null = null;
    revision = 0;
    running = false;
    speed = 1;
    seed = 42;
    private preparing = false;
    private protocolVersion: 1 | 3 | 4 = 1;
    private sessionId = '';
    private epoch = 0;
    private sequence = 0;
    private highestRequest = 0;
    private last: {
        request: Command;
        reply: Reply;
    } | null = null;
    private comparison: LabView['comparison'] = null;
    private comparisons: LabView['comparisons'] = null;
    private job: {
        type: 'seek' | 'replay' | 'step';
        target: number;
        progress: number;
        requestId: number;
        work: Generator<number, void>;
    } | null = null;
    constructor(readonly config: ModelConfig = SYNTHETIC_CONFIG, dataset?: Dataset) {
        if (config.dt !== .1)
            throw new Error('Worker supports .1 ms models only');
        this.info = datasetInfo(dataset, config);
        this.experiment = new Experiment(42, config, this.info.cells.map(n => n.id));
    }
    get computing() { return this.job !== null; }
    view(): LabView {
        const e = this.experiment;
        return { dataset: structuredClone(this.info), seed: this.seed, configHash: this.config.configHash, running: this.running, speed: this.speed, original: telemetry(this.original), branch: this.branch ? telemetry(this.branch) : null, branchB: this.branchB ? telemetry(this.branchB) : null,
            snapshot: this.saved ? { tick: this.saved.tick, activePotentials: this.saved.v.filter(v => v !== -52).length, queuedSignals: this.saved.delay.filter(Boolean).length, filterSum: this.saved.motorFilter.reduce((a, b) => a + b, 0), prng: Array.from(this.saved.prng) } : null,
            comparison: this.comparison ? { ...this.comparison } : null, comparisons: this.comparisons ? structuredClone(this.comparisons) : null,
            events: Object.values(e.records).flatMap(r => r.terminal.events.map(event => ({ ...event, sourceIds: [...event.sourceIds] }))), eventRevisions: { A: e.records.A?.terminal.eventRevision ?? 0, B: e.records.B?.terminal.eventRevision ?? 0 }, highWater: e.highWater, forkTick: e.forkTick, recordRevision: e.recordRevision,
            metrics: e.metrics(), replay: { ...e.replayStatus }, job: this.job ? { type: this.job.type, target: this.job.target, progress: this.job.progress } : null, memory: e.memory() };
    }
    private reply(kind: Reply['kind'], requestId: number, error?: string): Reply {
        return { protocolVersion: this.protocolVersion, kind, requestId, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision, sequence: ++this.sequence, ...(kind === 'ERROR' ? { error } : { view: this.view() }) };
    }
    handle(input: unknown): Reply {
        const parsed = commandSchema.safeParse(input);
        if (!parsed.success)
            return this.reply('ERROR', 0, 'Invalid protocol command');
        const c = parsed.data;
        const rejected = this.reject(c);
        if (rejected)
            return rejected;
        try {
            this.apply(c);
        }
        catch (error) {
            return this.reply('ERROR', c.requestId, error instanceof Error ? error.message : 'Command failed');
        }
        return this.finish(c);
    }
    private reject(c: Command): Reply | null {
        if (this.sessionId && (c.sessionId !== this.sessionId || c.epoch !== this.epoch || c.protocolVersion !== this.protocolVersion))
            return this.reply('ERROR', c.requestId, 'Stale session, epoch or protocol');
        if (this.last?.request.requestId === c.requestId) {
            if (JSON.stringify(c) === JSON.stringify(this.last.request))
                return this.last.reply;
            return this.reply('ERROR', c.requestId, 'Request ID reused with different contents');
        }
        if (c.requestId <= this.highestRequest || c.expectedRevision !== this.revision)
            return this.reply('ERROR', c.requestId, 'Stale request or revision');
        if (!this.sessionId && c.type !== 'INIT')
            return this.reply('ERROR', c.requestId, 'Initialize the experiment first');
        if (this.preparing)
            return this.reply('ERROR', c.requestId, 'Wait for the current save/load preparation');
        return null;
    }
    private finish(c: Command, file?: string): Reply {
        this.highestRequest = c.requestId;
        this.revision++;
        const reply = this.reply(this.job ? 'PROGRESS' : 'ACK', c.requestId);
        if (file !== undefined)
            reply.file = file;
        this.last = { request: c, reply };
        return reply;
    }
    async dispatch(input: unknown): Promise<Reply> {
        const parsed = commandSchema.safeParse(input);
        if (!parsed.success || !['EXPORT_STATE', 'LOAD'].includes(parsed.data.type))
            return this.handle(input);
        const c = parsed.data, rejected = this.reject(c);
        if (rejected)
            return rejected;
        if (this.job || (c.type === 'LOAD' && this.running))
            return this.reply('ERROR', c.requestId, 'Pause and wait for computation before loading');
        this.preparing = true;
        try {
            if (c.type === 'EXPORT_STATE') {
                if (c.payload.dataset !== this.info.kind)
                    throw new Error('Dataset metadata mismatch');
                const captured = captureExperiment(this.experiment, this.saved, this.seed);
                const file = await serializeExperiment(captured, c.payload);
                return this.finish(c, file);
            }
            if (c.type === 'LOAD') {
                const loaded = await deserializeExperiment(c.payload.file, this.config, this.info.cells.map(n => n.id));
                if (loaded.metadata.dataset !== this.info.kind)
                    throw new Error('Dataset metadata mismatch');
                this.experiment = loaded.experiment;
                this.saved = loaded.anchor;
                this.seed = loaded.record.seed;
                this.running = false;
                this.resetComparison();
                return this.finish(c);
            }
            throw new Error('Unsupported persistence command');
        }
        catch (error) {
            return this.reply('ERROR', c.requestId, error instanceof Error ? error.message : 'Persistence preparation failed');
        }
        finally {
            this.preparing = false;
        }
    }
    private resetComparison() { this.comparison = null; this.comparisons = null; }
    private startJob(type: 'seek' | 'replay' | 'step', target: number, c: Command, work: Generator<number, void>) {
        this.job = { type, target, progress: 0, requestId: c.requestId, work };
        if (type === 'replay')
            this.experiment.replayStatus = { status: 'Checking', tick: target, detail: 'Recomputing own histories', checked: 0 };
        this.resetComparison();
    }
    private *stepJob(target: number): Generator<number, void> {
        while (this.original.tick < target) {
            this.experiment.advanceTo(Math.min(target, this.original.tick + 2000));
            yield this.original.tick;
        }
    }
    private apply(c: Command): void {
        if (c.type === 'EXPORT_STATE' || c.type === 'LOAD')
            throw new Error('Use asynchronous persistence dispatch');
        if (this.job)
            throw new Error('Wait for the current seek/replay/step to finish');
        if (c.type === 'INIT') {
            if (this.sessionId)
                throw new Error('Experiment already initialized');
            if (c.payload.dataset && c.payload.dataset !== this.info.kind)
                throw new Error('Dataset selection mismatch');
            this.experiment = new Experiment(c.payload.seed, this.config, this.info.cells.map(n => n.id));
            this.seed = c.payload.seed;
            this.sessionId = c.sessionId;
            this.epoch = c.epoch;
            this.protocolVersion = c.protocolVersion;
            return;
        }
        if (c.type === 'RUN') {
            if (this.original.tick === MAX_TICK)
                throw new Error('120 s limit reached');
            this.speed = c.payload.speed;
            this.running = true;
            return;
        }
        if (c.type === 'PAUSE') {
            this.running = false;
            return;
        }
        if (this.running)
            throw new Error('Pause before changing the experiment');
        if (c.type === 'STEP') {
            const target = this.original.tick + c.payload.ticks;
            if (target > MAX_TICK)
                throw new Error('120 s limit exceeded');
            if (c.protocolVersion >= 3)
                this.startJob('step', target, c, this.stepJob(target));
            else {
                this.experiment.advanceTo(target);
                this.resetComparison();
            }
            return;
        }
        if (c.type === 'SCHEDULE_INTERVENTION') {
            this.experiment.schedule(c.payload);
            this.resetComparison();
            return;
        }
        if (c.type === 'SEEK') {
            if (c.payload.tick > this.experiment.highWater)
                throw new Error('Seek must be within recorded history');
            this.startJob('seek', c.payload.tick, c, this.experiment.seek(c.payload.tick));
            return;
        }
        if (c.type === 'REPLAY') {
            if (!this.branch)
                throw new Error('Create forks and select their recorded history first');
            this.startJob('replay', this.original.tick, c, this.experiment.replay());
            return;
        }
        if (c.type === 'SNAPSHOT') {
            if (this.saved)
                throw new Error('A snapshot already exists');
            this.saved = snapshot(this.original);
            return;
        }
        if (!this.saved)
            throw new Error('Capture a snapshot first');
        if (c.type === 'FORK') {
            this.experiment.fork(this.saved);
            this.resetComparison();
            return;
        }
        if (c.type === 'RESTORE') {
            restore(this.saved, this.config); // Validate before any live branch is changed.
            const work = this.experiment.seek(this.saved.tick);
            if (c.protocolVersion >= 3)
                this.startJob('seek', this.saved.tick, c, work);
            else {
                while (!work.next().done) { /* legacy synchronous contract */ }
                this.resetComparison();
            }
            return;
        }
        const all = this.experiment.compare();
        this.comparison = all.A;
        this.comparisons = all;
    }
    continueJob(): Reply | null {
        if (!this.job)
            return null;
        const job = this.job;
        try {
            const step = job.work.next();
            if (!step.done) {
                job.progress = step.value;
                return this.reply('PROGRESS', job.requestId);
            }
            this.job = null;
            const reply = this.reply('ACK', job.requestId);
            if (this.last)
                this.last.reply = reply;
            return reply;
        }
        catch (error) {
            this.job = null;
            this.experiment.replayStatus = { status: 'Unavailable', tick: this.original.tick, detail: 'Job failed; live seek state was not replaced', checked: 0 };
            const reply = this.reply('ERROR', job.requestId, error instanceof Error ? error.message : 'Job failed');
            if (this.last)
                this.last.reply = reply;
            return reply;
        }
    }
    pulse(): Reply | null {
        if (!this.running || this.job || this.preparing)
            return null;
        this.experiment.advanceTo(Math.min(MAX_TICK, this.original.tick + 500 * this.speed));
        this.resetComparison();
        if (this.original.tick === MAX_TICK)
            this.running = false;
        return this.reply('FRAME', 0);
    }
}
