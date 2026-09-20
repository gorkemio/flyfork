import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { evidenceFile } from './verification-paths.mjs';
import { hash, captureRelease, readRelease, assemblePair } from './release-payload.mjs';

const LIMIT = 32 * 1024 * 1024;
let sequence = 0;
function fixture(label, count, { firstBytes = 15, shared = false, htmlExtra = 0 } = {}) {
    const root = evidenceFile(`budget-${sequence++}`), dist = resolve(root, 'dist');
    mkdirSync(resolve(dist, 'assets'), { recursive: true });
    const payload = {};
    function add(path, bytes) { writeFileSync(resolve(dist, path), bytes); payload[path] = hash(bytes); }
    add('index.html', `<title>${label}</title>` + ' '.repeat(htmlExtra));
    for (let i = 0; i < count; i++) add(`assets/${shared && i === count - 1 ? 'common' : label + i}-12345678.js`, i === 0 ? Buffer.alloc(firstBytes, 32) : '/* synthetic */');
    function capture() {
        writeFileSync(resolve(dist, 'build-info.json'), JSON.stringify({ format: 'FlyForkLocalBuild', payload, payloadManifestSha256: hash(JSON.stringify(payload)) }));
        const release = resolve(root, `release-${sequence++}`), identity = captureRelease(dist, release);
        return { root, release, identity, manifest: readRelease(release, identity.manifestSha256), resize(bytes) { add(`assets/${label}0-12345678.js`, Buffer.alloc(bytes, 32)); return capture(); } };
    }
    return capture();
}
const pair = (a, b, out) => assemblePair(b.release, b.identity.manifestSha256, a.release, a.identity.manifestSha256, out, resolve('deploy'));
const total = files => Object.values(files).reduce((n, row) => n + row.bytes, 0);
function union(a, b, active = b) {
    const files = { ...a.manifest.files, ...b.manifest.files };
    for (const path of ['index.html', 'build-info.json']) files[path] = active.manifest.files[path];
    return files;
}
function rejected(a, b) {
    const out = resolve(b.root, `rejected-${sequence++}`);
    assert.throws(() => pair(a, b, out), /Combined public (file|byte) budget/);
    assert.equal(existsSync(out), false, 'budget failure must happen before any consumable context or success manifest');
}

test('F01 original PoC: independently valid 513-asset / 17 MiB generations reject at real assembler', () => {
    const a = fixture('A', 513, { firstBytes: 17 * 1024 * 1024 }), b = fixture('B', 513, { firstBytes: 17 * 1024 * 1024 });
    const files = union(a, b);
    assert.equal(Object.keys(files).length, 1028);
    assert.equal(total(files), 35714772);
    rejected(a, b);
});

test('independent file boundary: exactly 1024 succeeds; 1025 rejects with bytes far below limit', () => {
    const a = fixture('A', 511), b = fixture('B', 511), over = fixture('B', 512);
    const accepted = pair(a, b, resolve(b.root, 'pair'));
    for (const value of Object.values(accepted.outputs)) {
        assert.equal(Object.keys(value.files).length, 1024);
        assert.ok(total(value.files) < LIMIT);
    }
    assert.equal(Object.keys(union(a, over)).length, 1025);
    rejected(a, over);
});

test('independent byte boundary: exactly 33554432 succeeds; +1 rejects with only four URLs', () => {
    const a = fixture('A', 1, { firstBytes: LIMIT / 2 }), initial = fixture('B', 1, { firstBytes: 1 });
    const size = LIMIT - total(union(a, initial)) + 1, b = initial.resize(size);
    const accepted = pair(a, b, resolve(b.root, 'pair'));
    for (const value of Object.values(accepted.outputs)) {
        assert.equal(Object.keys(value.files).length, 4);
        assert.equal(total(value.files), LIMIT);
    }
    rejected(a, b.resize(size + 1));
});

test('rollback active entry bytes are checked even when forward is exactly at the limit', () => {
    const a = fixture('A', 1, { firstBytes: LIMIT / 2, htmlExtra: 1 }), initial = fixture('B', 1, { firstBytes: 1 });
    const b = initial.resize(LIMIT - total(union(a, initial)) + 1);
    assert.equal(total(union(a, b)), LIMIT);
    assert.equal(total(union(a, b, a)), LIMIT + 1);
    rejected(a, b);
});

test('same URL/same bytes deduplicates once; distinct URLs with identical bytes each cost a file and bytes', () => {
    const a = fixture('A', 512, { shared: true }), b = fixture('B', 511, { shared: true });
    const accepted = pair(a, b, resolve(b.root, 'pair'));
    for (const [direction, value] of Object.entries(accepted.outputs)) {
        assert.equal(Object.keys(value.files).length, 1024);
        assert.equal(total(value.files), total(union(a, b, direction === 'forward' ? b : a)));
        assert.deepEqual(value.files['assets/A1-12345678.js'], value.files['assets/B1-12345678.js']);
        assert.equal(value.files['assets/common-12345678.js'].bytes, 15);
    }
    rejected(a, fixture('B', 512, { shared: true }));
});

test('over-budget request preserves an earlier good pair and its sentinel byte for byte', () => {
    const a = fixture('A', 1), b = fixture('B', 1), out = resolve(b.root, 'good');
    pair(a, b, out);
    const manifest = readFileSync(resolve(out, 'pair-manifest.json'));
    writeFileSync(resolve(out, 'sentinel'), 'keep');
    const largeA = fixture('A', 511), largeB = fixture('B', 512);
    assert.throws(() => pair(largeA, largeB, out));
    assert.deepEqual(readFileSync(resolve(out, 'pair-manifest.json')), manifest);
    assert.equal(readFileSync(resolve(out, 'sentinel'), 'utf8'), 'keep');
});

test('single-generation file/byte limits and invalid or overflowing declared sizes remain rejected', () => {
    assert.throws(() => fixture('A', 1023), /Invalid public membership/);
    assert.throws(() => fixture('A', 1, { firstBytes: LIMIT }), /Invalid release identity\/size/);
    const f = fixture('A', 1);
    for (const bytes of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER]) {
        const manifest = structuredClone(f.manifest);
        manifest.files['assets/A0-12345678.js'].bytes = bytes;
        const text = JSON.stringify(manifest);
        writeFileSync(resolve(f.release, 'manifest.json'), text);
        assert.throws(() => readRelease(f.release, hash(text)), /Invalid file identity|Invalid release identity\/size/);
    }
});
