import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createVitest } from 'vitest/node';
import { boundOptions, validateResolved } from './r3-output.mjs';
import { assertRun } from './verification-paths.mjs';

if (process.argv.length !== 3) throw new Error('Child accepts only its reserved run');
const run = assertRun(process.argv[2]);
if (process.env.FLYFORK_EVIDENCE_DIR !== run) throw new Error('Evidence ENV does not match reserved run');
if (['started.json', 'effective-config.json', 'tests.json', 'result.json', 'coverage'].some(name => existsSync(resolve(run, name)))) throw new Error('Run already started or completed');
const plan = JSON.parse(readFileSync(resolve(run, 'plan.json'), 'utf8'));
if (!['unit', 'coverage', 'fixture-unit', 'fixture-coverage'].includes(plan.mode) || !existsSync(resolve(run, 'command.json'))) throw new Error('Unreserved child plan');
const options = boundOptions(plan.base, run, plan.coverage);
writeFileSync(resolve(run, 'started.json'), JSON.stringify({ time: new Date().toISOString(), pid: process.pid }), { flag: 'wx' });
const context = await createVitest(options, { cacheDir: resolve(run, 'vite-cache') });
try {
    const c = context.config;
    writeFileSync(resolve(run, 'effective-config.json'), JSON.stringify({ include: c.include, exclude: c.exclude, coverage: c.coverage, pool: c.pool, maxWorkers: c.maxWorkers, retry: c.retry, reporters: c.reporters, outputFile: c.outputFile, cacheDir: context.viteConfig.cacheDir }, null, 2), { flag: 'wx' });
    validateResolved(c, run);
    await context.start(plan.filters);
} finally { await context.close(); }
