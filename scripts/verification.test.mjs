import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { resolve, basename, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { reserve, pathsFor, boundOptions, validateResolved } from './r3-output.mjs';
import { run, admitEnvironment, verificationRoot, browserOutputs } from './verify.mjs';

const parent = process.env.FLYFORK_EVIDENCE_DIR;
assert.ok(parent, 'Tests must run through the verification runner');
const fixtures = resolve(parent, 'fixtures');
mkdirSync(fixtures);
const previous = resolve(fixtures, 'previous/coverage');
mkdirSync(previous, { recursive: true });
const sentinel = resolve(previous, 'sentinel.txt');
writeFileSync(sentinel, 'previous evidence stays unchanged');
writeFileSync(resolve(fixtures, 'value.js'), 'export const value = 42;\n');
writeFileSync(resolve(fixtures, 'tiny.test.js'), "import { it, expect } from 'vitest'; import { value } from './value.js'; it('real reporter fixture', () => expect(value).toBe(42));\n");
const base = { test: { include: [resolve(fixtures, 'tiny.test.js')], coverage: { provider: 'v8', include: [relative(process.cwd(), resolve(fixtures, 'value.js'))], reporter: ['text', 'json-summary', 'html'] } } };
const cleanEnv = { ...process.env };
delete cleanEnv.FLYFORK_EVIDENCE_DIR;
const freshName = suffix => `${basename(parent)}-${suffix}`;

test('fresh admission rejects reuse, old roots and symlink escapes', () => {
    const a = reserve(fixtures, 'a'), b = reserve(fixtures, 'b');
    assert.notEqual(pathsFor(a).coverage, pathsFor(b).coverage);
    assert.throws(() => reserve(fixtures, 'a'), /EEXIST/);
    assert.throws(() => reserve(fixtures, '../previous'), /Invalid/);
    symlinkSync(previous, resolve(fixtures, 'link'), 'dir');
    assert.throws(() => reserve(resolve(fixtures, 'link'), 'run'), /Symlink/);
    symlinkSync(previous, resolve(a, 'coverage'), 'dir');
    assert.throws(() => pathsFor(a), /Symlink/);
});

test('ENV, CLI and config cannot redirect reporters or disable safe cleanup', () => {
    const dir = reserve(fixtures, 'guards');
    for (const path of [previous, resolve('docs/evidence/stage-4.5/verification-fix-2/coverage-final/coverage'), resolve('docs/evidence/stage-4.5/verification-fix-3')]) {
        assert.throws(() => boundOptions({ test: { ...base.test, coverage: { ...base.test.coverage, reportsDirectory: path } } }, dir, true), /Conflicting/);
        assert.throws(() => admitEnvironment({ FLYFORK_EVIDENCE_DIR: path }), /ENV/);
    }
    for (const key of ['NODE_V8_COVERAGE', 'NODE_OPTIONS', 'VITEST_REPORTER', 'PLAYWRIGHT_JSON_OUTPUT_FILE', 'PLAYWRIGHT_HTML_OUTPUT_DIR', 'FLYFORK_R3_PROFILE']) {
        assert.throws(() => admitEnvironment({ [key]: previous }), /ENV/);
    }
    assert.throws(() => boundOptions(base, dir, true, ['--outputFile=outside.json']), /CLI/);
    assert.throws(() => boundOptions({ test: { ...base.test, outputFile: resolve(previous, 'tests.json') } }, dir, true), /Conflicting/);
    assert.throws(() => boundOptions({ test: { ...base.test, coverage: { ...base.test.coverage, clean: false } } }, dir, true), /clean/);
    assert.throws(() => boundOptions({ test: { ...base.test, coverage: { ...base.test.coverage, reporter: [['html', { subdir: previous }]] } } }, dir, true), /Reporter/);
    assert.throws(() => validateResolved({ ...boundOptions(base, dir, true), outputFile: resolve(previous, 'tests.json') }, dir), /mismatch/);
    assert.throws(() => browserOutputs({ outputDir: previous }, dir), /Conflicting/);
    assert.throws(() => browserOutputs({ reporter: [['json', { outputFile: previous }]] }, dir), /Conflicting/);
});

test('public CLI rejects extra options before launching a child', () => {
    const result = spawnSync(process.execPath, ['scripts/verify.mjs', 'coverage', '--outputFile=outside.json'], { env: cleanEnv, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage|CLI/);
});

test('child rejects old roots, markerless completed runs, and mismatched ENV', () => {
    const oldRoot = spawnSync(process.execPath, ['scripts/verify-vitest.mjs', 'docs/evidence/stage-4.5/verification-fix-3'], { env: cleanEnv, encoding: 'utf8' });
    assert.notEqual(oldRoot.status, 0);
    assert.match(oldRoot.stderr, /run root|escapes/);
    const dir = reserve(verificationRoot(), freshName('completed'));
    writeFileSync(resolve(dir, 'plan.json'), JSON.stringify({ base, coverage: true, filters: [] }));
    writeFileSync(resolve(dir, 'result.json'), 'previous completed result');
    const result = spawnSync(process.execPath, ['scripts/verify-vitest.mjs', dir], { env: { ...cleanEnv, FLYFORK_EVIDENCE_DIR: dir }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already started/);
    assert.equal(readFileSync(resolve(dir, 'result.json'), 'utf8'), 'previous completed result');
    assert.equal(existsSync(resolve(dir, 'started.json')), false);
    const mismatch = spawnSync(process.execPath, ['scripts/verify-vitest.mjs', dir], { env: { ...cleanEnv, FLYFORK_EVIDENCE_DIR: previous }, encoding: 'utf8' });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /ENV/);
});

test('two real instrumented reporters are isolated; plan/log/sentinel survive cleanup and child reuse fails', async () => {
    for (const suffix of ['a', 'b']) {
        const result = await run('fixture-coverage', { name: freshName(`reporter-${suffix}`), fixtureBase: base, env: cleanEnv });
        assert.equal(result.code, 0);
        const p = pathsFor(result.run);
        for (const file of [p.testJson, resolve(p.coverage, 'index.html'), resolve(p.coverage, 'coverage-summary.json'), p.stdout, resolve(result.run, 'plan.json'), resolve(result.run, 'command.json')]) assert.ok(existsSync(file), file);
        const summary = JSON.parse(readFileSync(resolve(p.coverage, 'coverage-summary.json'), 'utf8'));
        assert.ok(summary.total.lines.covered > 0);
        const effective = JSON.parse(readFileSync(resolve(result.run, 'effective-config.json'), 'utf8'));
        assert.equal(effective.coverage.reportsDirectory, p.coverage);
        const repeat = spawnSync(process.execPath, ['scripts/verify-vitest.mjs', result.run], { env: { ...cleanEnv, FLYFORK_EVIDENCE_DIR: result.run }, encoding: 'utf8' });
        assert.notEqual(repeat.status, 0);
        assert.match(repeat.stderr, /already started|EEXIST/);
        assert.equal(readFileSync(sentinel, 'utf8'), 'previous evidence stays unchanged');
    }
});

test('non-coverage reporter and failing assertion propagate actual exit status', async () => {
    const good = await run('fixture-unit', { name: freshName('unit'), fixtureBase: base, env: cleanEnv });
    assert.equal(good.code, 0);
    writeFileSync(resolve(fixtures, 'fail.test.js'), "import { it, expect } from 'vitest'; it('intentional negative control', () => expect(1).toBe(2));\n");
    const bad = await run('fixture-unit', { name: freshName('negative'), fixtureBase: { test: { ...base.test, include: [resolve(fixtures, 'fail.test.js')] } }, env: cleanEnv });
    assert.notEqual(bad.code, 0);
    assert.equal(JSON.parse(readFileSync(resolve(bad.run, 'tests.json'), 'utf8')).numFailedTests, 1);
});
