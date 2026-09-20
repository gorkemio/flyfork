import { readFileSync, writeFileSync, readdirSync, lstatSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { inside, noSymlinks } from './r3-output.mjs';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/;
const entries = new Set(['index.html', 'build-info.json']);
export function publicPath(path) {
    if (typeof path !== 'string' || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe public path');
    if (!entries.has(path) && !['favicon.svg', 'third-party-notices.txt'].includes(path)
        && !/^assets\/(?:[\w-]+\/)*[\w.-]+-[\w-]{8}\.(js|css)$/.test(path)
        && !/^licenses\/(three|react|react-dom|scheduler|zod|dexie)-(LICENSE|NOTICE)\.txt$/.test(path)
        && !/^licenses\/(flyfork|provenance)-[a-f0-9]{12}\.txt$/.test(path)
        && !/^assets\/lab\/concrete-floor-02\/(epoxy_(diff|rough|nor_gl)_512\.jpg|LICENSE\.txt|provenance\.json)$/.test(path)) throw Error(`Non-public path rejected: ${path}`);
    return path;
}
function files(root) {
    noSymlinks(root);
    const list = {};
    function walk(dir) {
        for (const item of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en'))) {
            const file = inside(root, resolve(dir, item.name));
            if (item.isDirectory()) walk(file);
            else {
                if (!lstatSync(file).isFile()) throw Error('Only regular public files allowed');
                const name = publicPath(relative(root, file)), bytes = readFileSync(file);
                list[name] = { sha256: hash(bytes), bytes: bytes.length };
            }
        }
    }
    walk(root);
    return list;
}
function copy(root, path, destination) {
    const source = inside(root, resolve(root, publicPath(path))), target = inside(destination, resolve(destination, path));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
}
function checkCombinedBudget(pool, active) {
    // Count served URLs, including the selected entry pair. Verification metadata
    // lives outside www. readRelease has already verified membership/hash/size.
    const rows = [...Object.values(pool), ...[...entries].map(path => active.files[path])];
    if (rows.length > 1024) throw Error('Combined public file budget exceeded');
    let total = 0;
    for (const row of rows) {
        if (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > 32 * 1024 * 1024 - total)
            throw Error('Combined public byte budget exceeded');
        total += row.bytes;
    }
}
function checkManifest(value) {
    if (value.format !== 'FlyForkPublicRelease' || value.version !== 1 || !digestPattern.test(value.id) || !value.files || Array.isArray(value.files)) throw Error('Invalid release manifest');
    const paths = Object.keys(value.files);
    if (!paths.length || paths.length > 1024 || !paths.includes('index.html') || !paths.includes('build-info.json')) throw Error('Invalid public membership');
    let total = 0;
    for (const path of paths) {
        publicPath(path);
        const row = value.files[path];
        if (!row || !digestPattern.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0) throw Error('Invalid file identity');
        total += row.bytes;
    }
    if (total > 32 * 1024 * 1024 || value.id !== value.files['build-info.json'].sha256) throw Error('Invalid release identity/size');
}
export function readRelease(root, expectedManifestHash) {
    noSymlinks(root);
    if (!digestPattern.test(expectedManifestHash)) throw Error('Expected trusted manifest SHA-256 required');
    const path = inside(root, resolve(root, 'manifest.json')), bytes = readFileSync(path);
    if (hash(bytes) !== expectedManifestHash) throw Error('Release manifest hash mismatch');
    const manifest = JSON.parse(bytes);
    checkManifest(manifest);
    const actual = files(resolve(root, 'public'));
    if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw Error('Release payload membership/hash mismatch');
    return manifest;
}
export function captureRelease(dist, destination) {
    const inventory = files(dist), info = JSON.parse(readFileSync(resolve(dist, 'build-info.json')));
    if (info.format !== 'FlyForkLocalBuild' || hash(JSON.stringify(info.payload)) !== info.payloadManifestSha256) throw Error('Invalid build-info');
    const expected = { ...info.payload, 'build-info.json': inventory['build-info.json']?.sha256 };
    if (Object.keys(expected).length !== Object.keys(inventory).length || Object.entries(inventory).some(([p,row]) => expected[p] !== row.sha256)) throw Error('Build-info/payload mismatch');
    noSymlinks(destination); mkdirSync(destination); // Exclusive destination, no merge/reuse.
    const manifest = { format: 'FlyForkPublicRelease', version: 1, id: inventory['build-info.json'].sha256, files: inventory };
    checkManifest(manifest);
    mkdirSync(resolve(destination, 'public'));
    for (const path of Object.keys(inventory)) copy(dist, path, resolve(destination, 'public'));
    const bytes = JSON.stringify(manifest, null, 2) + '\n';
    writeFileSync(resolve(destination, 'manifest.json'), bytes, { flag: 'wx' });
    return { id: manifest.id, manifestSha256: hash(bytes) };
}
export function assemblePair(currentRoot, currentHash, previousRoot, previousHash, destination, configRoot) {
    const current = readRelease(currentRoot, currentHash), previous = readRelease(previousRoot, previousHash);
    if (current.id === previous.id) throw Error('Two distinct release identities required');
    // The snapshots contain only each generation's own files, never an earlier union.
    const pool = {};
    for (const [root, manifest] of [[previousRoot, previous], [currentRoot, current]]) {
        for (const [path, row] of Object.entries(manifest.files)) {
            if (entries.has(path)) continue;
            if (pool[path] && pool[path].sha256 !== row.sha256) throw Error(`Public URL collision requires versioning: ${path}`);
            pool[path] = { ...row, root };
        }
    }
    // Admit both runtime trees before creating either context or success manifest.
    checkCombinedBudget(pool, current);
    checkCombinedBudget(pool, previous);
    noSymlinks(destination); noSymlinks(configRoot); mkdirSync(destination);
    const outputs = {};
    for (const [name, root, active] of [['forward', currentRoot, current], ['rollback', previousRoot, previous]]) {
        const context = resolve(destination, name), www = resolve(context, 'www');
        mkdirSync(context); mkdirSync(www);
        for (const [path,row] of Object.entries(pool)) copy(resolve(row.root, 'public'), path, www);
        for (const path of entries) copy(resolve(root, 'public'), path, www);
        // Both entrypoints are selected at build time, then immutable in one image.
        for (const [from,to] of [['nginx.conf','nginx.conf'],['runtime.Dockerfile','Dockerfile']]) {
            copyFileSync(inside(configRoot, resolve(configRoot, from)), resolve(context, to));
        }
        writeFileSync(resolve(context, '.dockerignore'), '**\n!Dockerfile\n!nginx.conf\n!www/\n!www/**\n', {flag:'wx'});
        outputs[name] = { active: active.id, retained: [previous.id, current.id], files: files(www) };
    }
    const manifest = { format:'FlyForkReleasePair', version:1, currentManifestSha256:currentHash, previousManifestSha256:previousHash, scope:'Exactly two own-generation public payloads; no recursive inheritance', outputs };
    writeFileSync(resolve(destination,'pair-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
    const [mode,...args] = process.argv.slice(2);
    const result = mode === 'capture' && args.length === 2 ? captureRelease(...args)
        : mode === 'pair' && args.length === 6 ? assemblePair(...args)
        : (() => { throw Error('capture <dist> <new-release-dir> | pair <current> <sha> <previous> <sha> <new-pair-dir> <deploy-dir>'); })();
    console.log(JSON.stringify(result,null,2));
}
