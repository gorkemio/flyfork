import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exactToolchain, assertVersions, parseChildIdentity } from './exact-toolchain.mjs';
import { evidenceFile } from './verification-paths.mjs';

test('exact preflight rejects wrong Node or pnpm instead of falling back', () => {
    assert.throws(() => assertVersions('24.19.0', '11.19.0'), /pnpm/);
    assert.throws(() => assertVersions('24.18.0', '11.25.0'), /Node/);
    assert.doesNotThrow(() => assertVersions('24.19.0', '11.25.0'));
});

test('real wrong-version CLI fixture fails before install or child commands', () => {
    const root = evidenceFile('wrong-pnpm');
    mkdirSync(resolve(root, 'bin'), { recursive: true });
    writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'pnpm', version: '11.19.0' }));
    const cli = resolve(root, 'bin/pnpm.mjs');
    writeFileSync(cli, "if (process.argv[2] !== '--version') throw Error('Child must not run'); console.log('11.19.0');");
    assert.throws(() => exactToolchain(cli), /pnpm/);
});

test('fallback policy and arbitrary shell wrappers are rejected', () => {
    assert.throws(() => exactToolchain('/missing', { pnpm_config_pm_on_fail: 'ignore' }), /policy/);
    const wrapper = evidenceFile('pnpm-wrapper');
    writeFileSync(wrapper, '#!/bin/sh\necho 11.25.0\n');
    assert.throws(() => exactToolchain(wrapper), /entrypoint/);
});

test('supply-chain progress is retained without confusing it with the child identity', () => {
    const marker = 'FLYFORK_TOOLCHAIN_CHILD={"node":"24.19.0"}';
    assert.deepEqual(parseChildIdentity(`Verifying lockfile against supply-chain policies...\n${marker}\n`), { node: '24.19.0' });
    assert.throws(() => parseChildIdentity('policy check only'), /Missing/);
    assert.throws(() => parseChildIdentity(`${marker}\n${marker}`), /ambiguous/);
});

test('pre-install version check never invokes pnpm exec and its implicit install', () => {
    const root = evidenceFile('version-only-pnpm');
    mkdirSync(resolve(root, 'bin'), { recursive: true });
    writeFileSync(resolve(root, 'package.json'), JSON.stringify({ name: 'pnpm', version: '11.25.0' }));
    const cli = resolve(root, 'bin/pnpm.mjs');
    writeFileSync(cli, "if (process.argv[2] !== '--version') throw Error('No implicit installation before frozen install'); console.log('11.25.0');");
    assert.equal(exactToolchain(cli).childCheck, 'DEFERRED_UNTIL_AFTER_FROZEN_INSTALL');
});
