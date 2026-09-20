import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, delimiter, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export function assertVersions(node, pnpm) {
    if (node !== '24.19.0') throw new Error(`Expected Node 24.19.0; got ${node}`);
    if (pnpm !== '11.25.0') throw new Error(`Expected pnpm 11.25.0; got ${pnpm}`);
}

export function findPnpm(env = process.env) {
    if (env.npm_execpath) return env.npm_execpath;
    const found = (env.PATH ?? '').split(delimiter).map(p => resolve(p, 'pnpm')).find(existsSync);
    if (!found) throw new Error('pnpm 11.25.0 entrypoint is unavailable');
    return found;
}

export function parseChildIdentity(output) {
    const lines = output.split('\n').filter(line => line.startsWith('FLYFORK_TOOLCHAIN_CHILD='));
    if (lines.length !== 1) throw new Error('Missing or ambiguous toolchain child identity');
    return JSON.parse(lines[0].slice('FLYFORK_TOOLCHAIN_CHILD='.length));
}

export function exactToolchain(entry, env = process.env, { checkChild = false } = {}) {
    for (const key of Object.keys(env)) {
        if (/^(pnpm_config_|npm_config_)?pm_on_fail$/i.test(key) && env[key] !== undefined)
            throw new Error('External package-manager fallback policy is not allowed in the exact build');
    }
    const cli = realpathSync(entry);
    if (basename(cli) !== 'pnpm.mjs') throw new Error('Expected the actual pnpm.mjs entrypoint; shell wrappers are not accepted');
    const metadata = JSON.parse(readFileSync(resolve(dirname(cli), '../package.json'), 'utf8'));
    if (metadata.name !== 'pnpm') throw new Error('Unexpected pnpm package identity');
    assertVersions(process.versions.node, metadata.version);
    const childEnv = { ...env, PATH: dirname(process.execPath) + delimiter + (env.PATH ?? '') };
    const invoke = args => {
        const result = spawnSync(process.execPath, [cli, ...args], { env: childEnv, encoding: 'utf8', timeout: 30000 });
        if (result.status !== 0) throw new Error(`Exact pnpm command failed: ${result.error?.message ?? result.stderr}`);
        return result.stdout.trim();
    };
    assertVersions(process.versions.node, invoke(['--version']));
    const basic = { node: process.versions.node, nodePath: realpathSync(process.execPath), pnpm: metadata.version, pnpmEntrypoint: cli, platform: process.platform, arch: process.arch, glibc: process.report.getReport().header.glibcVersionRuntime ?? null };
    // pnpm 11 exec defaults to installing missing dependencies. Only call it AFTER frozen install.
    if (!checkChild) return { ...basic, childCheck: 'DEFERRED_UNTIL_AFTER_FROZEN_INSTALL' };
    // pnpm exec does not promise npm_execpath. Resolve and execute the child's actual PATH entry.
    const childOutput = invoke(['exec', 'node', '-e', `
        const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
        const entry = process.env.PATH.split(path.delimiter).map(p => path.resolve(p, 'pnpm')).find(fs.existsSync);
        const pnpm = fs.realpathSync(entry);
        const version = cp.spawnSync(process.execPath, [pnpm, '--version'], { encoding: 'utf8' });
        if (version.status !== 0) throw Error('Child pnpm failed: ' + version.stderr);
        console.log('FLYFORK_TOOLCHAIN_CHILD=' + JSON.stringify({ node: process.versions.node, path: process.execPath, pnpm, pnpmVersion: version.stdout.trim() }));
    `]);
    const child = parseChildIdentity(childOutput);
    assertVersions(child.node, child.pnpmVersion);
    if (realpathSync(child.path) !== realpathSync(process.execPath) || realpathSync(child.pnpm) !== cli)
        throw new Error('pnpm child returned to a different toolchain');
    return { ...basic, child, childOutput, childCheck: 'PASS_AFTER_FROZEN_INSTALL' };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
    if (process.argv.length !== 3 || process.argv[2] !== 'install') throw new Error('Usage: node scripts/exact-toolchain.mjs install');
    const { evidenceFile } = await import('./verification-paths.mjs');
    const { writeFileSync } = await import('node:fs');
    const toolchain = exactToolchain(findPnpm());
    writeFileSync(evidenceFile('toolchain.json'), JSON.stringify(toolchain, null, 2), { flag: 'wx' });
    const result = spawnSync(toolchain.nodePath, [toolchain.pnpmEntrypoint, 'install', '--frozen-lockfile'], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status === 0) writeFileSync(evidenceFile('toolchain-child.json'), JSON.stringify(exactToolchain(toolchain.pnpmEntrypoint, process.env, { checkChild: true }), null, 2), { flag: 'wx' });
    process.exitCode = result.status ?? 1;
}
