import { readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { noSymlinks } from './r3-output.mjs';

// Tool-only bootstrap in the isolated builder. No project dependency or lifecycle change.
if (process.argv.length !== 3) throw new Error('Usage: node scripts/bootstrap-pnpm.mjs <new-tool-directory>');
const pins = JSON.parse(readFileSync('deploy/toolchain.json', 'utf8'));
if (process.versions.node !== pins.node) throw new Error('Unexpected bootstrap Node version');
const root = resolve(process.argv[2]);
noSymlinks(root); mkdirSync(root);
const response = await fetch(pins.pnpmTarball, { redirect: 'error', signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`pnpm download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
if (integrity !== pins.pnpmIntegrity) throw new Error('pnpm registry integrity mismatch');
const archive = resolve(root, 'pnpm.tgz');
writeFileSync(archive, bytes, { flag: 'wx' });
const unpack = spawnSync('tar', ['-xzf', archive, '--no-same-owner', '-C', root], { encoding: 'utf8' });
if (unpack.status !== 0) throw new Error(`pnpm extraction failed: ${unpack.stderr}`);
const pkg = JSON.parse(readFileSync(resolve(root, 'package/package.json'), 'utf8'));
if (pkg.name !== 'pnpm' || pkg.version !== pins.pnpm) throw new Error('Unexpected tool package');
mkdirSync(resolve(root, 'bin'));
symlinkSync('../package/bin/pnpm.mjs', resolve(root, 'bin/pnpm'));
writeFileSync(resolve(root, 'provenance.json'), JSON.stringify({ source: pins.pnpmTarball, registryMetadata: pins.metadataSource, integrity, tarballSha256: createHash('sha256').update(bytes).digest('hex'), validation: 'Pinned registry SRI; signature/attestation not independently verified' }, null, 2), { flag: 'wx' });
