import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { isAbsolute, dirname, resolve, relative } from 'node:path';

export function noSymlinks(path) {
    for (let p = resolve(path); ; p = dirname(p)) {
        try { if (lstatSync(p).isSymbolicLink()) throw new Error(`Symlink output rejected: ${p}`); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (dirname(p) === p) break;
    }
}
export function inside(root, path) {
    noSymlinks(root); noSymlinks(path);
    const rel = relative(resolve(root), resolve(path));
    if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`Output escapes run: ${path}`);
    return resolve(path);
}
export function reserve(root, name) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Invalid run name');
    noSymlinks(root);
    const run = inside(realpathSync(root), resolve(root, name));
    mkdirSync(run); // Exclusive admission, including failed or incomplete previous runs.
    return run;
}
export function pathsFor(run) {
    return Object.fromEntries(Object.entries({ stdout: 'stdout.log', stderr: 'stderr.log', testJson: 'tests.json', coverage: 'coverage', matrixJson: 'regression-intervention-matrix.json', matrixMarkdown: 'regression-intervention-matrix.md', cpuProfile: 'matrix.cpuprofile', phases: 'matrix-phases.json', cache: 'vite-cache' }).map(([key, value]) => [key, inside(run, resolve(run, value))]));
}
const testKeys = new Set(['include', 'coverage', 'outputFile', 'reporters']);
const coverageKeys = new Set(['provider', 'include', 'exclude', 'reporter', 'thresholds', 'reportsDirectory', 'clean', 'reportOnFailure']);
export function boundOptions(base, run, coverage, cli = []) {
    // No arbitrary CLI/config/reporter passthrough: absolute reporter options bypass ENV.
    if (cli.length) throw new Error('CLI overrides are not accepted by the evidence runner');
    if (Object.keys(base).some(k => k !== 'test')) throw new Error('Unsupported top-level config');
    if (Object.keys(base.test).some(k => !testKeys.has(k))) throw new Error('Unsupported test config');
    const paths = pathsFor(run), cov = base.test.coverage;
    if (Object.keys(cov).some(k => !coverageKeys.has(k))) throw new Error('Unsupported coverage config');
    if (cov.provider !== 'v8' || cov.clean === false) throw new Error('Provider/clean contract changed');
    if (base.test.outputFile && resolve(base.test.outputFile) !== paths.testJson) throw new Error('Conflicting test output');
    if (base.test.reporters) throw new Error('Config test reporters must not override runner reporters');
    if (cov.reportsDirectory && resolve(cov.reportsDirectory) !== paths.coverage) throw new Error('Conflicting coverage output');
    if (cov.reporter.some(r => typeof r !== 'string' || !['text', 'json-summary', 'html'].includes(r))) throw new Error('Reporter options/custom reporters are not accepted');
    return {
        ...base.test, config: false, watch: false, pool: 'threads', maxWorkers: 1, retry: 0,
        reporters: ['default', 'json'], outputFile: paths.testJson,
        coverage: { ...cov, enabled: coverage, clean: true, reportOnFailure: true, reportsDirectory: paths.coverage },
    };
}
export function validateResolved(config, run) {
    const paths = pathsFor(run);
    if (resolve(config.coverage.reportsDirectory) !== paths.coverage || resolve(config.outputFile) !== paths.testJson) throw new Error('Resolved reporter output mismatch');
    if (config.coverage.clean !== true) throw new Error('Coverage must clean only its reserved subfolder');
    const reporters = config.coverage.reporter;
    if (reporters.some(reporter => {
        const [name, options] = typeof reporter === 'string' ? [reporter, undefined] : reporter;
        // Vitest's detected agent mode adds text-summary and text.skipFull=true.
        const allowedKeys = name === 'text' ? ['skipFull'] : [];
        return !['text', 'text-summary', 'json-summary', 'html'].includes(name)
            || (options && Object.keys(options).some(key => !allowedKeys.includes(key)))
            || (options?.skipFull !== undefined && typeof options.skipFull !== 'boolean');
    })) throw new Error('Resolved reporter options rejected');
    inside(run, config.coverage.reportsDirectory); inside(run, config.outputFile);
}
