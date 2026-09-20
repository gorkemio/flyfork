import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { inside, noSymlinks } from './r3-output.mjs';

export function verificationRoot() {
    const root = resolve('artifacts/verification');
    noSymlinks(root);
    mkdirSync(root, { recursive: true });
    return realpathSync(root);
}

export function assertRun(run) {
    const root = resolve('artifacts/verification');
    const path = inside(root, resolve(run));
    if (dirname(path) !== root) throw new Error('Invalid verification run root');
    return realpathSync(path);
}

export function evidenceFile(name) {
    const run = process.env.FLYFORK_EVIDENCE_DIR;
    if (!run) throw new Error('Use the verification runner; evidence ENV is required');
    const root = assertRun(run);
    if (!existsSync(resolve(root, 'plan.json')) || !existsSync(resolve(root, 'command.json')) || existsSync(resolve(root, 'result.json'))) throw new Error('Evidence run is not active');
    const path = inside(root, resolve(root, name));
    mkdirSync(dirname(path), { recursive: true });
    return path;
}

export function admitEnvironment(env) {
    const bad = Object.keys(env).filter(key => env[key] !== undefined && (
        /^FLYFORK_/.test(key) && key !== 'FLYFORK_PREVIEW'
        || /^(NODE_OPTIONS|NODE_V8_COVERAGE|VITEST.*)$/.test(key)
        || /^PLAYWRIGHT_.*(OUTPUT|REPORT|CONFIG)/.test(key)
    ));
    if (bad.length) throw new Error(`Conflicting runner ENV keys: ${bad.join(', ')}`);
}

export function browserOutputs(base, run) {
    const outputDir = inside(run, resolve(run, 'test-results'));
    const outputFile = inside(run, resolve(run, 'regression-playwright-results.json'));
    if (base.outputDir && resolve(base.outputDir) !== outputDir) throw new Error('Conflicting browser output directory');
    if (base.reporter && JSON.stringify(base.reporter) !== JSON.stringify([['list'], ['json', { outputFile }]])) throw new Error('Conflicting browser reporter config');
    return { outputDir, reporter: [['list'], ['json', { outputFile }]] };
}

export function browserRunMode() {
    const run = assertRun(process.env.FLYFORK_EVIDENCE_DIR ?? '');
    return JSON.parse(readFileSync(resolve(run, 'plan.json'), 'utf8')).mode;
}
