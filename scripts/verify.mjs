import { openSync, closeSync, writeFileSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, relative, delimiter, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import { reserve, pathsFor, boundOptions, inside, noSymlinks } from './r3-output.mjs';
import { verificationRoot, admitEnvironment } from './verification-paths.mjs';
export { verificationRoot, admitEnvironment, browserOutputs } from './verification-paths.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function inputManifest() {
    const files = {};
    function visit(path) {
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) throw new Error(`Input symlink rejected: ${path}`);
        if (stat.isDirectory()) {
            for (const name of readdirSync(path).sort()) if (!['__pycache__', 'graphify-out'].includes(name)) visit(resolve(path, name));
        } else if (stat.isFile()) files[relative(process.cwd(), path)] = sha256(readFileSync(path));
    }
    for (const dir of ['src', 'tests', 'scripts', 'public', 'data/prepared', 'deploy']) visit(resolve(dir));
    for (const file of ['Dockerfile', '.dockerignore']) visit(resolve(file));
    for (const file of ['docs/plan/stage-3-behavior-preregistration.md', 'docs/evidence/stage-4/round-trip.flyfork.json']) visit(resolve(file));
    for (const name of readdirSync('.').sort()) if (/\.(json|yaml|[cm]?js|ts)$/.test(name) && lstatSync(name).isFile()) files[name] = sha256(readFileSync(name));
    return files;
}

const publicModes = ['install', 'typecheck', 'lint', 'build', 'unit', 'coverage', 'e2e', 'e2e-webkit', 'e2e-firefox', 'smoke', 'tooling', 'deployment-tests', 'release-tests', 'save-helper-tests', 'runner-tests', 'package', 'package-check'];
export async function run(mode, { name = `${mode}-${Date.now()}-${randomUUID().slice(0, 8)}`, fixtureBase, env = process.env } = {}) {
    if (!publicModes.includes(mode) && !['fixture-unit', 'fixture-coverage'].includes(mode)) throw new Error('Unsupported verification mode');
    if (mode.startsWith('fixture-') !== Boolean(fixtureBase)) throw new Error('Fixture config is required only for fixture mode');
    admitEnvironment(env);
    const runDir = reserve(verificationRoot(), name), paths = pathsFor(runDir);
    const coverage = ['coverage', 'fixture-coverage'].includes(mode);
    const isVitest = ['unit', 'coverage', 'fixture-unit', 'fixture-coverage'].includes(mode);
    const base = isVitest ? fixtureBase ?? (await import('../vitest.config.ts')).default : undefined;
    if (isVitest) boundOptions(base, runDir, coverage);
    paths.browserJson = inside(runDir, resolve(runDir, 'regression-playwright-results.json'));
    paths.browserArtifacts = inside(runDir, resolve(runDir, 'test-results'));
    paths.candidate = inside(runDir, resolve(runDir, 'source'));
    paths.archive = inside(runDir, resolve(runDir, 'flyfork-source-candidate.tar.gz'));
    paths.build = resolve('dist');
    noSymlinks(paths.build);
    const node = process.execPath;
    const commands = isVitest ? [[node, 'scripts/verify-vitest.mjs', runDir]] : {
        install: [[node, 'scripts/exact-toolchain.mjs', 'install']],
        typecheck: [[node, 'node_modules/typescript/bin/tsc', '--noEmit'], [node, 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.simulation.json']],
        lint: [[node, 'node_modules/eslint/bin/eslint.js', 'src', 'tests', ...readdirSync('.').filter(f => f.endsWith('.ts')).sort()]],
        build: [[node, 'node_modules/typescript/bin/tsc', '--noEmit'], [node, 'node_modules/vite/bin/vite.js', 'build']],
        tooling: [[node, '--test', 'scripts/verification.test.mjs', 'scripts/source-package.test.mjs', 'scripts/deployment.test.mjs', 'scripts/release-payload.test.mjs', 'scripts/release-budget.test.mjs', 'scripts/save-evidence.test.mjs']],
        'deployment-tests': [[node, '--test', 'scripts/deployment.test.mjs', 'scripts/release-payload.test.mjs', 'scripts/release-budget.test.mjs']],
        'release-tests': [[node, '--test', 'scripts/release-payload.test.mjs', 'scripts/release-budget.test.mjs']],
        'save-helper-tests': [[node, '--test', 'scripts/save-evidence.test.mjs']],
        'runner-tests': [[node, '--test', 'scripts/verification.test.mjs']],
        package: [[node, 'scripts/source-package.mjs', 'create']],
        'package-check': [[node, 'scripts/source-package.mjs', 'check']],
        ...Object.fromEntries(['e2e', 'e2e-webkit', 'e2e-firefox', 'smoke'].map(key => [key, [ [node, 'node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.portable.config.ts'] ]])),
    }[mode];
    const plan = { mode, coverage, filters: [], base, paths, commands, channelsNotRun: isVitest ? ['browser'] : mode.startsWith('e2e') || mode === 'smoke' ? ['unit', 'coverage'] : ['unit', 'coverage', 'browser'] };
    writeFileSync(resolve(runDir, 'plan.json'), JSON.stringify(plan, null, 2), { flag: 'wx' });
    const inputs = inputManifest();
    writeFileSync(resolve(runDir, 'command.json'), JSON.stringify({ commands, inputs, inputFingerprint: sha256(JSON.stringify(inputs)), node: process.version, v8: process.versions.v8, platform: os.platform(), release: os.release(), arch: os.arch(), startedAt: new Date().toISOString(), paths }, null, 2), { flag: 'wx' });
    const stdout = openSync(paths.stdout, 'wx'), stderr = openSync(paths.stderr, 'wx');
    const childEnv = { ...env, PATH: dirname(node) + delimiter + (env.PATH ?? ''), FLYFORK_EVIDENCE_DIR: runDir, PYTHONDONTWRITEBYTECODE: '1' };
    const start = performance.now(), steps = [];
    console.log(`START ${mode}: ${relative(process.cwd(), runDir)}`);
    try {
        for (const command of commands) {
            const result = await new Promise(done => {
                const child = spawn(command[0], command.slice(1), { env: childEnv, stdio: ['ignore', stdout, stderr] });
                child.once('error', error => done({ code: 1, error: error.message }));
                child.once('close', (code, signal) => done({ code: code ?? 1, signal }));
            });
            steps.push({ command, ...result });
            if (result.code !== 0) break;
        }
    } finally { closeSync(stdout); closeSync(stderr); }
    const code = steps.at(-1)?.code ?? 1;
    let buildFiles;
    if (mode === 'build' && code === 0) {
        buildFiles = {};
        const walk = path => { for (const entry of readdirSync(path, { withFileTypes: true })) { const p = resolve(path, entry.name); if (entry.isDirectory()) walk(p); else buildFiles[relative(paths.build, p)] = sha256(readFileSync(p)); } };
        walk(paths.build);
    }
    writeFileSync(resolve(runDir, 'result.json'), JSON.stringify({ code, elapsedMs: performance.now() - start, steps, buildFiles, finishedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
    console.log(`END ${mode}: exit ${code}`);
    if (code !== 0) console.log(`See ${relative(process.cwd(), paths.stdout)} and ${relative(process.cwd(), paths.stderr)}`);
    return { code, run: runDir };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
    if (process.argv.length !== 3 || !publicModes.includes(process.argv[2])) throw new Error(`Usage: node scripts/verify.mjs ${publicModes.join('|')} (no CLI overrides)`);
    process.exitCode = (await run(process.argv[2])).code;
}
