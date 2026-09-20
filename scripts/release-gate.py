"""Two-phase manual Dokploy release gate. State lives outside the repository on the SSH target."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
import time
import urllib.request

DAY = 86400

def admit(state, request, now):
    if request['variant'] not in ('forward', 'rollback'):
        raise ValueError('Unknown pair variant')
    for variant in ('forward', 'rollback'):
        if not re.fullmatch(r'ghcr\.io/gorkemio/flyfork@sha256:[a-f0-9]{64}', request['images'][variant]):
            raise ValueError('Immutable official image digest required')
        if not re.fullmatch('[a-f0-9]{64}', request['generations'][variant]):
            raise ValueError('Invalid own-generation identity')
    if request['generations']['forward'] == request['generations']['rollback']:
        raise ValueError('Distinct own-generations required')
    if state.get('pending') and state['pending']['pair'] != request['pair']:
        raise ValueError('Unfinished release; reconcile the pending pair before another release')
    if state.get('active'):
        active = state['active']
        if request['pair'] == active['pair']:
            if request['images'] != active['images'] or request['generations'] != active['generations']:
                raise ValueError('Pair identities cannot be redefined')
        else:
            if now < active['earliestNextActivation']:
                raise ValueError('Previous-generation 24-hour retention has not elapsed')
            if request['generations']['rollback'] != active['generations']['forward']:
                raise ValueError('Next pair must retain the previous current own-generation')
    return request

def activate(state, request, now):
    admit(state, request, now)
    same = state.get('active', {}).get('pair') == request['pair']
    started = state['active']['pairActivatedAt'] if same else now
    return {'active': {**request, 'pairActivatedAt': started, 'selectedAt': now,
                       'earliestNextActivation': started + DAY}, 'pending': None}

def remote_operation(request):
    import fcntl
    folder = pathlib.Path.home()/'.local/state/flyfork'
    folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    if folder.is_symlink():raise ValueError('Refuse symlink state directory')
    with (folder/'release.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        path = folder/'release.json'
        if path.is_symlink():raise ValueError('Refuse symlink state file')
        state = json.loads(path.read_text()) if path.exists() else {}
        now = int(time.time())
        if request['operation'] == 'status':return state
        incoming = request['release']
        admit(state,incoming,now)
        if request['operation'] == 'prepare':
            state['pending'] = incoming
        elif request['operation'] == 'confirm':
            if state.get('pending') != incoming:raise ValueError('No matching prepared release')
            data = urllib.request.urlopen('https://flyfork.org/build-info.json',timeout=20).read()
            if hashlib.sha256(data).hexdigest() != incoming['generations'][incoming['variant']]:
                raise ValueError('Actual public generation does not match selected pair variant')
            state = activate(state,incoming,now)
        else:raise ValueError('Unknown operation')
        temp = folder/'release.next'
        with temp.open('x') as f:json.dump(state,f,indent=2);f.write('\n')
        os.chmod(temp,0o600)
        os.replace(temp,path)
        with (folder/'history.jsonl').open('a') as f:
            f.write(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'operation':request['operation'],'state':state})+'\n')
        return state

def main():
    if sys.argv[1:] == ['--remote']:
        print(json.dumps(remote_operation(json.load(sys.stdin)),indent=2));return
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=['prepare','confirm','status'])
    parser.add_argument('--ssh',required=True,help='Already verified SSH alias')
    parser.add_argument('--identities',type=pathlib.Path)
    parser.add_argument('--variant',choices=['forward','rollback'],default='forward')
    args=parser.parse_args()
    if not re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]*',args.ssh):raise ValueError('SSH alias required')
    request={'operation':args.operation}
    if args.operation!='status':
        if args.identities is None:raise ValueError('Registry identities required')
        identities=json.loads(args.identities.read_text());pair=identities['pair']
        request['release']={'pair':hashlib.sha256(json.dumps(pair,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
                            'images':{v:identities['images'][v]['immutable'] for v in ['forward','rollback']},
                            'generations':{v:pair['outputs'][v]['active'] for v in ['forward','rollback']},'variant':args.variant}
    code=pathlib.Path(__file__).read_text()
    command='python3 -c '+shlex.quote(code)+' --remote'
    result=subprocess.run(['ssh','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','ForwardAgent=no','-o','ControlMaster=no','-o','ControlPath=none',args.ssh,command],input=json.dumps(request),text=True,check=True,capture_output=True)
    print(result.stdout,end='')
    if args.operation=='prepare':
        print('Prepared. Select this digest in the FlyFork Dokploy service, deploy manually, then run confirm:')
        print(request['release']['images'][args.variant])

if __name__=='__main__':main()
