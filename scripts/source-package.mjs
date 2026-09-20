import { copyFileSync, chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inside, noSymlinks } from './r3-output.mjs';
import { evidenceFile } from './verification-paths.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fixture = 'docs/evidence/stage-4/round-trip.flyfork.json';
const manifestName = 'SOURCE_MANIFEST.json';
const generated = new Set(['node_modules', 'dist', 'artifacts', '.pnpm-store']);

function safePath(path) {
    if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\') || path.split('/').some(p => ['', '.', '..'].includes(p))) throw new Error('Unsafe allowlist path');
    if (path === manifestName) throw new Error('The manifest cannot hash itself');
    if (path.startsWith('docs/evidence/') && path !== fixture || /(^|\/)(\.env[^/]*|\.tools|\.agents|\.codex|\.git|node_modules|dist|artifacts|__pycache__|\.pnpm-store)(\/|$)/.test(path)
        || path.startsWith('data/raw/') || /\.(feather|zip|log|cpuprofile|pyc)$/.test(path)) throw new Error(`Private/generated content forbidden in allowlist: ${path}`);
}

export function readAllowlist(root) {
    const file = resolve(root, 'scripts/source-allowlist.json');
    noSymlinks(file);
    const list = JSON.parse(readFileSync(file, 'utf8'));
    if (list.version !== 1 || !Array.isArray(list.files) || list.files.length === 0) throw new Error('Invalid allowlist');
    const seen = new Set();
    for (const row of list.files) {
        safePath(row.path);
        if (seen.has(row.path)) throw new Error(`Duplicate allowlist path: ${row.path}`);
        if (typeof row.purpose !== 'string' || !row.purpose.trim()) throw new Error('Every allowlist entry needs a purpose');
        if (row.sha256 && !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('Invalid frozen hash');
        seen.add(row.path);
    }
    return list.files.toSorted((a, b) => a.path.localeCompare(b.path, 'en'));
}

export function createCandidate(root, destination) {
    noSymlinks(root); noSymlinks(destination);
    const files = readAllowlist(root).map(row => {
        const path = inside(root, resolve(root, row.path));
        if (!lstatSync(path).isFile()) throw new Error(`Not a regular source file: ${row.path}`);
        const bytes = readFileSync(path), sha256 = digest(bytes);
        if (row.sha256 && row.sha256 !== sha256) throw new Error(`Frozen input hash mismatch: ${row.path}`);
        return { path: row.path, bytes: bytes.length, sha256, purpose: row.purpose };
    });
    mkdirSync(destination); // A failed or completed candidate is never reused.
    for (const row of files) {
        const path = inside(destination, resolve(destination, row.path));
        mkdirSync(dirname(path), { recursive: true });
        copyFileSync(resolve(root, row.path), path);
        chmodSync(path, 0o644);
    }
    const manifest = { format: 'FlyForkSourceCandidate', version: 1, status: 'EXPERIMENTAL_RELEASE_SOURCE_CANDIDATE', licenseDecision: 'MIT for original project code; third-party terms retained', hashMeaning: 'Integrity only; not a signature or rights clearance', files };
    writeFileSync(resolve(destination, manifestName), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    verifyCandidate(destination);
    return manifest;
}

export function verifyCandidate(root, { allowGenerated = false } = {}) {
    noSymlinks(root);
    const manifestPath = resolve(root, manifestName);
    noSymlinks(manifestPath);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.format !== 'FlyForkSourceCandidate' || manifest.version !== 1) throw new Error('Invalid source manifest');
    const allowlist = readAllowlist(root);
    if (JSON.stringify(manifest.files.map(f => f.path)) !== JSON.stringify(allowlist.map(f => f.path))) throw new Error('Manifest/allowlist membership mismatch');
    const expected = new Set([...manifest.files.map(f => f.path), manifestName]);
    let bytes = 0;
    for (const row of manifest.files) {
        safePath(row.path);
        const path = inside(root, resolve(root, row.path)), data = readFileSync(path);
        if (data.length !== row.bytes || digest(data) !== row.sha256) throw new Error(`Candidate size/hash mismatch: ${row.path}`);
        const entry = allowlist.find(f => f.path === row.path);
        if (entry.sha256 && entry.sha256 !== row.sha256) throw new Error(`Frozen input hash mismatch: ${row.path}`);
        if (row.purpose !== entry.purpose) throw new Error(`Manifest purpose mismatch: ${row.path}`);
        if ((lstatSync(path).mode & 0o777) !== 0o644) throw new Error(`Unexpected file permissions: ${row.path}`);
        bytes += data.length;
    }
    function visit(dir) {
        for (const item of readdirSync(dir, { withFileTypes: true })) {
            if (dir === resolve(root) && allowGenerated && generated.has(item.name)) continue;
            const file = resolve(dir, item.name), name = relative(root, file);
            noSymlinks(file);
            if (item.isDirectory()) visit(file);
            else if (!expected.has(name)) throw new Error(`Unexpected candidate file: ${name}`);
        }
    }
    visit(resolve(root));
    for (const row of manifest.files.filter(row => row.path.endsWith('.md'))) {
        const text = readFileSync(resolve(root, row.path), 'utf8');
        for (const [, raw] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
            const target = raw.replace(/^<|>$/g, '').split('#')[0];
            if (!target || /^[a-z]+:/i.test(target)) continue;
            const path = inside(root, resolve(dirname(resolve(root, row.path)), decodeURI(target)));
            if (!existsSync(path)) throw new Error(`Broken document link in ${row.path}: ${target}`);
        }
    }
    return { files: manifest.files.length, bytes, manifestSha256: digest(readFileSync(manifestPath)), allowGenerated };
}

export function createArchive(source, archive) {
    noSymlinks(source); noSymlinks(archive);
    if (existsSync(archive)) throw new Error('Archive already exists');
    const version = spawnSync('tar', ['--version'], { encoding: 'utf8' });
    if (version.status !== 0) throw new Error('A supported BSD or GNU tar is required');
    const owner = version.stdout.includes('bsdtar') ? ['--uid', '0', '--gid', '0', '--no-fflags', '--no-mac-metadata']
        : version.stdout.includes('GNU tar') ? ['--owner=0', '--group=0'] : null;
    if (!owner) throw new Error('Unsupported tar implementation; refusing unreviewed archive metadata');
    const result = spawnSync('tar', ['--format=ustar', '--numeric-owner', '--no-xattrs', '--no-acls', ...owner, '-czf', archive, '-C', dirname(source), basename(source)], { env: { ...process.env, COPYFILE_DISABLE: '1' }, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Archive failed: ${result.stderr}`);
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
    if (process.argv.length !== 3 || !['create', 'check'].includes(process.argv[2])) throw new Error('Use pnpm source:pack or pnpm source:check');
    if (process.argv[2] === 'check') {
        const result = verifyCandidate(process.cwd(), { allowGenerated: true });
        writeFileSync(evidenceFile('package-check.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(result));
    } else {
        const destination = evidenceFile('source');
        const manifest = createCandidate(process.cwd(), destination);
        const archive = evidenceFile('flyfork-source-candidate.tar.gz');
        createArchive(destination, archive);
        const record = { ...verifyCandidate(destination), archive: 'flyfork-source-candidate.tar.gz', archiveBytes: lstatSync(archive).size, archiveSha256: digest(readFileSync(archive)), fileBytes: manifest.files.reduce((sum, row) => sum + row.bytes, 0) };
        writeFileSync(evidenceFile('package-result.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
        console.log(JSON.stringify(record));
    }
}
