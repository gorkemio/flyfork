"""Manual, repository-bound publication of one verified build and its prior own-generation."""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tarfile

ROOT = pathlib.Path.cwd()
OUT = ROOT / 'publication'
INPUT = json.loads((ROOT / 'deploy/release-inputs.json').read_text())

def run(*args):
    return subprocess.check_output(args, text=True).strip()

def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def unpack(path, destination):
    destination.mkdir()
    with tarfile.open(path) as archive:
        for member in archive.getmembers():
            parts = pathlib.PurePosixPath(member.name).parts
            if member.name.startswith('/') or '..' in parts or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe release archive member')
        archive.extractall(destination, filter='data')

if os.environ.get('GITHUB_REPOSITORY') != 'gorkemio/flyfork' or os.environ.get('GITHUB_REF') != 'refs/heads/main':
    raise RuntimeError('Publication requires the official repository main workflow')
sha = os.environ['GITHUB_SHA']
if not re.fullmatch('[a-f0-9]{40}', sha):
    raise ValueError('Invalid workflow commit')

if sys.argv[1:] == ['prepare']:
    OUT.mkdir()
    run_id = os.environ['VERIFICATION_RUN']
    if not re.fullmatch('[0-9]+', run_id):
        raise ValueError('Numeric verification run required')
    record = json.loads(run('gh', 'api', f'repos/gorkemio/flyfork/actions/runs/{run_id}'))
    if (record['head_sha'] != sha or record['head_repository']['full_name'] != 'gorkemio/flyfork'
            or record['event'] not in ['push', 'workflow_dispatch'] or record['head_branch'] != 'main'
            or record['conclusion'] != 'success' or record['path'] != '.github/workflows/verify.yml'):
        raise RuntimeError('Untrusted or unsuccessful verification run')
    run('gh', 'run', 'download', run_id, '--repo', 'gorkemio/flyfork', '--name', 'verified-source-and-runtime', '--dir', str(OUT/'verified'))
    if (OUT/'verified/commit.txt').read_text().strip() != sha:
        raise RuntimeError('Artifact commit mismatch')
    for asset in INPUT['assets']:
        run('gh', 'release', 'download', INPUT['release'], '--repo', 'gorkemio/flyfork', '--pattern', asset['name'], '--dir', str(OUT))
        path = OUT/asset['name']
        if digest(path) != asset['sha256']:
            raise RuntimeError('Release asset hash mismatch: '+asset['name'])
        unpack(path, OUT/asset['directory'])
    (OUT/'verification-run.json').write_text(json.dumps({k:record[k] for k in ['id','head_sha','conclusion','html_url','path']},indent=2)+'\n')
    # Use the exact pinned Node image to verify source and public payloads.
    command = """import {verifyCandidate} from './scripts/source-package.mjs';
import {captureRelease,assemblePair} from './scripts/release-payload.mjs';
verifyCandidate('/work/verified/source');
const c=captureRelease('/work/verified/linux/dist','/work/current');
assemblePair('/work/current',c.manifestSha256,'/work/previous/previous',process.argv[1],'/work/pair','/repo/deploy');"""
    run('docker','run','--rm','--user',f'{os.getuid()}:{os.getgid()}','-v',f'{ROOT}:/repo:ro','-v',f'{OUT}:/work','-w','/repo',INPUT['builder'],'node','--input-type=module','-e',command,INPUT['previousManifestSha256'])
elif sys.argv[1:] == ['publish']:
    pair = json.loads((OUT/'pair/pair-manifest.json').read_text())
    result = {'assemblyCommit':sha, 'platform':'linux/amd64', 'builder':'GitHub hosted ubuntu-24.04 native AMD64', 'pair':pair, 'images':{}}
    for variant in ['forward','rollback']:
        tag = f"ghcr.io/gorkemio/flyfork:{INPUT['release']}-{variant}"
        # Fail closed if a tag exists or the registry state cannot be established.
        status = subprocess.run(['docker','manifest','inspect',tag],capture_output=True,text=True)
        if status.returncode == 0 or not any(x in status.stderr.lower() for x in ['manifest unknown','no such manifest']):
            raise RuntimeError('Tag is present or its absence is unverified: '+tag+' '+status.stderr)
        context = OUT/'pair'/variant
        import shutil
        shutil.copytree(OUT/'notices/native-notices',context/'native-notices')
        with (context/'.dockerignore').open('a') as f:
            f.write('!native-notices/\n!native-notices/**\n')
        with (context/'Dockerfile').open('a') as f:
            f.write('\nCOPY native-notices/ /usr/share/licenses/flyfork-native/\n')
        run('docker','build','--platform','linux/amd64','--label','org.opencontainers.image.source=https://github.com/gorkemio/flyfork','--label',f'org.opencontainers.image.revision={sha}','--label',f'org.flyfork.active-build-info={pair["outputs"][variant]["active"]}','--label','org.flyfork.license-scope=Original FlyFork MIT; native and bundled dependencies retain their individual licenses','--tag',tag,str(context))
        info=json.loads(run('docker','image','inspect',tag))[0]
        if info['Architecture']!='amd64' or info['Os']!='linux':raise RuntimeError('Native image platform mismatch')
        result['images'][variant]={'tag':tag,'dockerStoreId':info['Id'],'layers':info['RootFS']['Layers']}
    # Both F01 contexts and both image assemblies exist before the first push.
    for variant,row in result['images'].items():
        output=run('docker','push',row['tag'])
        match=re.search(r'digest: (sha256:[a-f0-9]{64})',output)
        if not match:raise RuntimeError('No registry digest in push result')
        row['digest']=match[1]
        row['immutable']=row['tag'].split(':')[0]+'@'+row['digest']
        manifest=json.loads(run('docker','manifest','inspect',row['immutable']))
        row['platformManifest']=row['digest']
        if 'manifests' in manifest:
            candidates=[m for m in manifest['manifests'] if m.get('platform',{}).get('os')=='linux' and m.get('platform',{}).get('architecture')=='amd64']
            if len(candidates)!=1:raise RuntimeError('Ambiguous AMD64 platform manifest')
            row['platformManifest']=candidates[0]['digest']
            manifest=json.loads(run('docker','manifest','inspect',row['tag'].split(':')[0]+'@'+row['platformManifest']))
        row['configId']=manifest['config']['digest']
        row['registryLayers']=[item['digest'] for item in manifest['layers']]
        (OUT/'registry-identities.json').write_text(json.dumps(result,indent=2)+'\n')
    with tarfile.open(OUT/'current-own-generation.tar.gz','w:gz') as archive:archive.add(OUT/'current',arcname='current')
else:
    raise ValueError('prepare | publish required')
