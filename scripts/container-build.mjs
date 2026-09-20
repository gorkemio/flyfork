import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { run, sha256 } from './verify.mjs';
import { verifyCandidate } from './source-package.mjs';
import { exactToolchain, findPnpm } from './exact-toolchain.mjs';
import { reserve } from './r3-output.mjs';
import { verificationRoot } from './verification-paths.mjs';

if (process.argv.length !== 2) throw new Error('No build overrides accepted');
const candidate = verifyCandidate(process.cwd());
let tools = exactToolchain(findPnpm());
if (tools.platform !== 'linux' || !tools.glibc) throw new Error('Linux/glibc builder is required');
const out = reserve(verificationRoot(), `linux-build-${Date.now()}`);
const modes = ['install', 'typecheck', 'lint', 'unit', 'build', 'tooling', 'package-check'];
writeFileSync(resolve(out, 'plan.json'), JSON.stringify({ modes, output: out }, null, 2), { flag: 'wx' });
writeFileSync(resolve(out, 'command.json'), JSON.stringify({ tools, candidate }, null, 2), { flag: 'wx' });
const lock = sha256(readFileSync('pnpm-lock.yaml')), steps = [];
try {
    for (const mode of modes) {
        const step = await run(mode);
        steps.push({ mode, ...step });
        if (step.code) throw new Error(`${mode} failed; see ${step.run}`);
        if (mode === 'install') tools = JSON.parse(readFileSync(resolve(step.run, 'toolchain-child.json'), 'utf8'));
    }
    if (sha256(readFileSync('pnpm-lock.yaml')) !== lock) throw new Error('Frozen lockfile changed');
    const files = {};
    const walk = dir => { for (const e of readdirSync(dir, { withFileTypes: true })) { const path = resolve(dir, e.name); if (e.isDirectory()) walk(path); else files[relative(resolve('dist'), path)] = sha256(readFileSync(path)); } };
    walk(resolve('dist'));
    const deploy = Object.fromEntries(['Dockerfile', '.dockerignore', 'deploy/nginx.conf', 'deploy/toolchain.json'].map(path => [path, sha256(readFileSync(path))]));
    const info = { format: 'FlyForkLocalBuild', sourceManifestSha256: candidate.manifestSha256, lockSha256: lock, toolchain: { node: tools.node, pnpm: tools.pnpm, platform: tools.platform, arch: tools.arch, glibc: tools.glibc }, deploy, payloadManifestSha256: sha256(JSON.stringify(files)), payload: files, scope: 'Local candidate; not release approval. Hashes are not signatures.' };
    writeFileSync('dist/build-info.json', JSON.stringify(info, null, 2) + '\n', { flag: 'wx' });
    files['build-info.json'] = sha256(readFileSync('dist/build-info.json'));
    writeFileSync(resolve(out, 'result.json'), JSON.stringify({ code: 0, tools, steps, lockUnchanged: true, dist: files, buildInfo: info, toolAcquisition: JSON.parse(readFileSync('/opt/pnpm/provenance.json', 'utf8')) }, null, 2), { flag: 'wx' });
} catch (error) {
    writeFileSync(resolve(out, 'result.json'), JSON.stringify({ code: 1, steps, error: String(error) }, null, 2), { flag: 'wx' });
    throw error;
}
