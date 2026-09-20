import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createCandidate, verifyCandidate, readAllowlist, createArchive } from './source-package.mjs';

const root = resolve(process.env.FLYFORK_EVIDENCE_DIR, 'package-fixtures');
mkdirSync(root);
function fixture(name, entries = [{ path: 'README.md', purpose: 'fixture documentation' }]) {
    const dir = resolve(root, name);
    mkdirSync(resolve(dir, 'scripts'), { recursive: true });
    writeFileSync(resolve(dir, 'README.md'), '# Fixture\n');
    writeFileSync(resolve(dir, 'scripts/source-allowlist.json'), JSON.stringify({ version: 1, files: [...entries, { path: 'scripts/source-allowlist.json', purpose: 'explicit inventory' }] }));
    return dir;
}

test('allowlist copies only named files and manifest verifies independent copy', () => {
    const dir = fixture('good');
    writeFileSync(resolve(dir, '.env'), 'PRIVATE_FIXTURE_VALUE');
    const dest = resolve(root, 'candidate');
    const result = createCandidate(dir, dest);
    assert.equal(result.files.length, 2);
    assert.equal(existsSync(resolve(dest, '.env')), false);
    assert.equal(verifyCandidate(dest).files, 2);
    assert.equal(readFileSync(resolve(dest, 'README.md'), 'utf8'), '# Fixture\n');
    assert.throws(() => createCandidate(dir, dest), /EEXIST/);
});

test('duplicates, unsafe paths, private content classes and symlinks are rejected', () => {
    for (const [i, path] of ['../escape', '/absolute', 'docs/evidence/private.json', '.env', 'node_modules/a.js', 'data/raw/a.feather', 'SOURCE_MANIFEST.json', 'a\\b'].entries()) {
        const dir = fixture(`bad-${i}`, [{ path, purpose: 'must reject' }]);
        assert.throws(() => readAllowlist(dir), /allowlist|private|unsafe|manifest/i);
    }
    const duplicate = fixture('duplicate', [{ path: 'README.md', purpose: 'a' }, { path: 'README.md', purpose: 'b' }]);
    assert.throws(() => readAllowlist(duplicate), /Duplicate/);
    const symlink = fixture('symlink', [{ path: 'alias.md', purpose: 'must reject link' }]);
    symlinkSync(resolve(symlink, 'README.md'), resolve(symlink, 'alias.md'));
    assert.throws(() => createCandidate(symlink, resolve(root, 'linked-candidate')), /Symlink/);
});

test('frozen input mismatch, changed candidate bytes and unexpected files fail verification', () => {
    const frozen = fixture('frozen', [{ path: 'README.md', purpose: 'frozen', sha256: '0'.repeat(64) }]);
    assert.throws(() => createCandidate(frozen, resolve(root, 'frozen-candidate')), /hash/);
    const source = fixture('tamper');
    const dest = resolve(root, 'tamper-candidate');
    createCandidate(source, dest);
    writeFileSync(resolve(dest, 'README.md'), 'changed');
    assert.throws(() => verifyCandidate(dest), /hash|size/);
    writeFileSync(resolve(dest, 'README.md'), '# Fixture\n');
    writeFileSync(resolve(dest, 'unexpected.txt'), 'not listed');
    assert.throws(() => verifyCandidate(dest), /Unexpected/);
});

test('real source allowlist explicitly retains both mandatory inputs and all product tests', () => {
    const files = readAllowlist(process.cwd());
    for (const path of ['docs/plan/stage-3-behavior-preregistration.md', 'docs/evidence/stage-4/round-trip.flyfork.json', 'src/experiments/matrix.test.ts', 'tests/e2e/library-transactions.spec.ts', 'tests/r3-matrix-probe.ts']) assert.ok(files.some(file => file.path === path), path);
    assert.deepEqual(files.filter(file => file.path.startsWith('docs/evidence/')).map(file => file.path), ['docs/evidence/stage-4/round-trip.flyfork.json']);
});

test('real source archive has neutral ownership and no extended metadata or links', () => {
    const dir = fixture('archive-input');
    const dest = resolve(root, 'archive-source');
    createCandidate(dir, dest);
    const archive = resolve(root, 'candidate.tar.gz');
    createArchive(dest, archive);
    const tar = gunzipSync(readFileSync(archive));
    let entries = 0;
    for (let offset = 0; offset + 512 <= tar.length; ) {
        const header = tar.subarray(offset, offset + 512);
        if (header.every(byte => byte === 0)) break;
        const field = (start, size) => header.subarray(start, start + size).toString().replace(/\0.*$/s, '').trim();
        assert.equal(parseInt(field(108, 8), 8), 0, 'no local uid');
        assert.equal(parseInt(field(116, 8), 8), 0, 'no local gid');
        assert.ok(['', 'root'].includes(field(265, 32)), 'no local owner name');
        assert.ok(['', 'root'].includes(field(297, 32)), 'no local group name');
        assert.ok(['', '0', '5'].includes(field(156, 1)), 'only regular files/directories; no PAX/xattr/link headers');
        const size = parseInt(field(124, 12), 8) || 0;
        offset += 512 + Math.ceil(size / 512) * 512;
        entries++;
    }
    assert.ok(entries >= 4, 'actual archive contains the fixture tree');
    assert.throws(() => createArchive(dest, archive), /already exists/);
});
