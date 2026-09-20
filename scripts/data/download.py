"""Download only the three authorized public MaleCNS v1.0 Feather files.
Atomic completion, publisher MD5 transport check when supplied, and local SHA256.
"""
from pathlib import Path
import base64, datetime, hashlib, json, shutil, subprocess

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data/raw/male-cns-v1.0'
NAMES = ['body-annotations-male-cns-v1.0-minconf-0.5.feather',
         'body-neurotransmitters-male-cns-v1.0.feather',
         'connectome-weights-male-cns-v1.0-minconf-0.5.feather']
BASE = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/'

def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with path.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''): h.update(block)
    return h

def validate(path, size, md5):
    if path.stat().st_size != size: raise ValueError('Incomplete file size')
    with path.open('rb') as f:
        start=f.read(6); f.seek(-6,2); end=f.read(6)
    if start != b'ARROW1' or end != b'ARROW1': raise ValueError('Invalid Arrow file boundaries')
    if md5 and base64.b64encode(digest(path,'md5').digest()).decode() != md5:
        raise ValueError('Publisher transport MD5 mismatch')

def main():
    RAW.mkdir(parents=True,exist_ok=True)
    for name in NAMES:
        url=BASE+name; path=RAW/name; meta=RAW/(name+'.provenance.json')
        head=subprocess.check_output(['curl','--fail','--silent','--show-error','--head',url],text=True)
        headers={}
        for line in head.splitlines():
            if ':' in line:
                key,value=line.split(':',1);headers.setdefault(key.lower(),[]).append(value.strip())
        size=int(headers['content-length'][-1]); md5=None
        for field in headers.get('x-goog-hash',[]):
            for part in field.split(','):
                if part.strip().startswith('md5='):md5=part.strip()[4:]
        if path.exists():
            validate(path,size,md5)
            if not meta.exists(): raise ValueError('Existing file has no download provenance')
            if json.loads(meta.read_text())['sha256'] != digest(path).hexdigest(): raise ValueError('Existing SHA mismatch')
            print('REUSED',name,size,flush=True);continue
        if shutil.disk_usage(RAW).free < size+2*1024**3: raise ValueError('Insufficient disk space')
        part=RAW/(name+'.part')
        print('DOWNLOADING',name,size,flush=True)
        # curl truncates a previous partial file; it is never treated as complete.
        subprocess.run(['curl','--fail','--location','--silent','--show-error','--retry','2','--output',str(part),url],check=True)
        validate(part,size,md5)
        record={'url':url,'release':'male-cns:v1.0','file':name,'bytes':size,
                'downloadedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'sha256':digest(part).hexdigest(),'sha256Authority':'locally calculated; not a publisher signature',
                'publisherTransportMd5':md5,'generation':headers.get('x-goog-generation'),
                'license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/',
                'attribution':'MaleCNS collaboration: FlyEM (HHMI Janelia), University of Cambridge, MRC LMB, Google Research',
                'downloadScriptSha256':digest(Path(__file__)).hexdigest()}
        part.replace(path);meta.write_text(json.dumps(record,indent=2)+'\n')
        print('COMPLETE',name,record['sha256'],flush=True)
if __name__=='__main__': main()
