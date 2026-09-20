/** Opt-in diagnosis inside the actual Vitest worker and matrix callback. */
import { Session } from 'node:inspector/promises';
import { writeFileSync } from 'node:fs';
import { threadId, isMainThread } from 'node:worker_threads';
import { evidencePath } from './evidence-path';

export async function matrixProbe() {
    if (process.env.FLYFORK_R3_PROFILE !== '1') throw new Error('Diagnostic matrix requires explicit profile mode');
    const session = new Session(); session.connect();
    await session.post('Profiler.enable');
    await session.post('Profiler.setSamplingInterval', { interval: 1000 });
    await session.post('Profiler.start');
    const start = performance.now(), startCpu = process.threadCpuUsage();
    let last = start, lastCpu = startCpu;
    const phases: { phase: string; wallMs: number; userMs: number; systemMs: number }[] = [];
    function mark(phase: string) {
        const now = performance.now(), cpu = process.threadCpuUsage();
        phases.push({ phase, wallMs: now - last, userMs: (cpu.user - lastCpu.user) / 1000, systemMs: (cpu.system - lastCpu.system) / 1000 });
        last = now; lastCpu = cpu;
    }
    return {
        mark,
        async finish() {
            const measuredEnd = performance.now(), cpu = process.threadCpuUsage(startCpu);
            const { profile } = await session.post('Profiler.stop');
            session.disconnect();
            writeFileSync(evidencePath('matrix.cpuprofile'), JSON.stringify(profile));
            writeFileSync(evidencePath('matrix-phases.json'), JSON.stringify({ pid: process.pid, threadId, isMainThread, samplingIntervalUs: 1000, node: process.version, v8: process.versions.v8, wallMs: measuredEnd - start, cpu, phases }, null, 2));
        },
    };
}
