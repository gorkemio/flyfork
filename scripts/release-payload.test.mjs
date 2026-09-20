import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { evidenceFile } from './verification-paths.mjs';
import { hash, publicPath, captureRelease, readRelease, assemblePair } from './release-payload.mjs';

let sequence = 0;
test('the pinned runtime LICENSE/NOTICE paths are public, arbitrary text is not', () => {
    for (const file of ['react-LICENSE.txt','react-dom-LICENSE.txt','scheduler-LICENSE.txt','three-LICENSE.txt','zod-LICENSE.txt','dexie-LICENSE.txt','dexie-NOTICE.txt']) assert.equal(publicPath('licenses/'+file),'licenses/'+file);
    assert.throws(()=>publicPath('licenses/private.txt'),/Non-public/);
});
test('versioned FlyFork grants and provenance are admitted without widening private paths', () => {
    for (const path of ['licenses/flyfork-aecfb06b6a1d.txt','licenses/provenance-bd644bc73482.txt']) assert.equal(publicPath(path),path);
    for (const path of ['licenses/flyfork.txt','licenses/flyfork-../../secret.txt','licenses/flyfork-123456789abc.json','licenses/private-123456789abc.txt']) assert.throws(()=>publicPath(path));
});
function fixture(label, asset = 'same') {
    const root = evidenceFile(`release-fixture-${sequence++}`); mkdirSync(root);
    const dist = resolve(root, 'dist'); mkdirSync(dist); mkdirSync(resolve(dist, 'assets'));
    const source = { 'index.html': `<title>${label}</title>`, [`assets/main-${label.repeat(8)}.js`]: `/* ${label} */`, 'favicon.svg': asset };
    const payload = {};
    for (const [name, bytes] of Object.entries(source)) { writeFileSync(resolve(dist, name), bytes); payload[name] = hash(bytes); }
    writeFileSync(resolve(dist, 'build-info.json'), JSON.stringify({format:'FlyForkLocalBuild',payload,payloadManifestSha256:hash(JSON.stringify(payload))}));
    const release = resolve(root,'release'), identity = captureRelease(dist,release);
    return { root, dist, release, identity };
}
test('release snapshot verifies exact public bytes and trusted manifest identity', () => {
    const f = fixture('A'), manifest = readRelease(f.release,f.identity.manifestSha256);
    assert.equal(manifest.id,f.identity.id);
    assert.throws(()=>readRelease(f.release,'0'.repeat(64)),/hash mismatch/);
    writeFileSync(resolve(f.release,'public/assets/main-AAAAAAAA.js'),'tampered');
    assert.throws(()=>readRelease(f.release,f.identity.manifestSha256),/payload membership\/hash/);
});
test('forward and rollback choose atomic entry pair while preserving both own-generation asset sets', () => {
    const a=fixture('A'),b=fixture('B'),out=resolve(b.root,'pair');
    const pair=assemblePair(b.release,b.identity.manifestSha256,a.release,a.identity.manifestSha256,out,resolve('deploy'));
    for(const variant of ['forward','rollback']) {
        assert.equal(readFileSync(resolve(out,variant,'www/assets/main-AAAAAAAA.js'),'utf8'),'/* A */');
        assert.equal(readFileSync(resolve(out,variant,'www/assets/main-BBBBBBBB.js'),'utf8'),'/* B */');
        assert.equal(pair.outputs[variant].retained.length,2);
    }
    assert.equal(readFileSync(resolve(out,'forward/www/index.html'),'utf8'),'<title>B</title>');
    assert.equal(readFileSync(resolve(out,'rollback/www/index.html'),'utf8'),'<title>A</title>');
    assert.throws(()=>assemblePair(b.release,b.identity.manifestSha256,a.release,a.identity.manifestSha256,out,resolve('deploy')),/EEXIST/);
});
test('hashless public URL changes require versioning, never silent overwrite', () => {
    const a=fixture('A','old-icon'),b=fixture('B','new-icon');
    assert.throws(()=>assemblePair(b.release,b.identity.manifestSha256,a.release,a.identity.manifestSha256,resolve(b.root,'pair'),resolve('deploy')),/collision requires versioning: favicon/);
});
test('private, traversal, absolute and encoded path payloads are rejected', () => {
    for(const path of ['../index.html','/index.html','assets/../index.html','assets/%2e%2e/secret.js','assets/private.json','src/app.js','.env','trace.zip','licenses/secret.key']) assert.throws(()=>publicPath(path));
    const f=fixture('A');writeFileSync(resolve(f.release,'public/private.txt'),'private');
    assert.throws(()=>readRelease(f.release,f.identity.manifestSha256),/Non-public path/);
});
test('symlink public input cannot disclose a private file', () => {
    const f=fixture('A'); writeFileSync(resolve(f.root,'private.txt'),'not-public');
    symlinkSync(resolve(f.root,'private.txt'),resolve(f.release,'public/assets/leak-12345678.js'));
    assert.throws(()=>readRelease(f.release,f.identity.manifestSha256),/Symlink/);
});
test('a union cannot masquerade as a single release snapshot or grow a third generation', () => {
    const a=fixture('A'),b=fixture('B'),pair=resolve(b.root,'pair');
    assemblePair(b.release,b.identity.manifestSha256,a.release,a.identity.manifestSha256,pair,resolve('deploy'));
    assert.throws(()=>captureRelease(resolve(pair,'forward/www'),resolve(b.root,'recursive-release')),/Build-info\/payload mismatch/);
});
