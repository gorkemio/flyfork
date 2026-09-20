"""MaleCNS DM1 induced subgraph converter v1. All selected cells, all positive internal edges."""
from pathlib import Path
import hashlib,json,math,datetime,resource
import pyarrow as pa
import pyarrow.compute as pc
from download import NAMES,RAW,digest,validate
TYPES=('ORN_DM1','DM1_lPN','lLN2F_b')
SIGNS={'acetylcholine':1,'gaba':-1}
ROOT=Path(__file__).resolve().parents[2]

def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode()
def integer(v):
    if type(v) is not int or not 0<=v<=2**53-1: raise ValueError('Invalid integer')
    return v

def identity(v):
    if type(v) is not int or not 0<v<=2**64-1: raise ValueError('Invalid source ID')
    return v

def prepare(annotations,transmitters,edges):
    selected={}; nt={}
    for row in annotations:
        if row['type'] not in TYPES:continue
        body=identity(row['bodyId'])
        if body in selected:raise ValueError('Duplicate cell ID')
        selected[body]=row
    if set(r['type'] for r in selected.values())!=set(TYPES):raise ValueError('Missing selected type')
    for row in transmitters:
        body=identity(row['body'])
        if body not in selected:continue
        if body in nt:raise ValueError('Duplicate NT ID')
        nt[body]=row
    neurons=[]
    for body,row in sorted(selected.items()):
        t=nt.get(body,{})
        transmitter=t.get('predicted_nt');confidence=t.get('predicted_nt_confidence')
        if transmitter not in SIGNS or t.get('consensus_nt')!=transmitter or not isinstance(confidence,(float,int)) or not math.isfinite(confidence) or not .5<=confidence<=1 or not integer(t.get('total_nt_predictions',0)):
            raise ValueError(f'Unsupported/missing/ambiguous per-cell NT: {body}')
        field='rootSide' if row['type']=='ORN_DM1' else 'somaSide'
        side=row.get(field)
        if side not in ('L','R') or (field=='rootSide' and row.get('entryNerve')!='AN'):raise ValueError(f'Unverified side: {body}')
        neurons.append({'id':str(body),'type':row['type'],'side':side,'sideField':field,'nt':transmitter,'ntConfidence':confidence,'ntPredictions':t['total_nt_predictions'],'sign':SIGNS[transmitter]})
    index={int(n['id']):i for i,n in enumerate(neurons)}; result=[];seen=set();cuts={'internal':0,'incomingCut':0,'outgoingCut':0,'incomingTotal':0,'outgoingTotal':0}
    for row in edges:
        pre=identity(row['body_pre']);post=identity(row['body_post']);weight=integer(row['weight'])
        if not weight:continue
        insidePre=pre in index;insidePost=post in index
        if not insidePre and not insidePost:continue
        key=(pre,post)
        if key in seen:raise ValueError('Duplicate directed edge; never silently aggregate')
        seen.add(key)
        if insidePre:cuts['outgoingTotal']+=weight
        if insidePost:cuts['incomingTotal']+=weight
        if insidePre and insidePost:
            cuts['internal']+=weight
            result.append([index[pre],index[post],weight,neurons[index[pre]]['sign']])
        elif insidePre:cuts['outgoingCut']+=weight
        else:cuts['incomingCut']+=weight
    return {'version':1,'id':'male-cns-v1.0-dm1','release':'male-cns:v1.0','types':list(TYPES),'neurons':neurons,'edges':sorted(result),'cuts':cuts,
            'policy':{'selection':'all cells of the three types and all positive directed internal weights','duplicates':'reject incident duplicate pairs','selfEdges':'retain','nt':'per-cell predicted_nt, confidence >= 0.5, count > 0 and agreement with consensus_nt; ACh +1 / GABA -1; no fallback'},
            'license':{'id':'CC-BY-4.0','url':'https://creativecommons.org/licenses/by/4.0/','source':'https://male-cns.janelia.org/download/','attribution':'MaleCNS collaboration: FlyEM (HHMI Janelia), University of Cambridge, MRC LMB, Google Research','changes':'Selected induced subgraph; stable local indexes; per-cell sign and side mapping; raw synapse counts retained'}}

def load_sources():
    provenance=[]
    for name in NAMES:
        p=RAW/name;meta=json.loads((RAW/(name+'.provenance.json')).read_text());validate(p,meta['bytes'],meta['publisherTransportMd5'])
        if digest(p).hexdigest()!=meta['sha256']:raise ValueError('Raw SHA mismatch')
        provenance.append(meta)
    a=pa.ipc.open_file(str(RAW/NAMES[0])).read_all();a=a.filter(pc.is_in(a['type'],value_set=pa.array(TYPES)))
    ids=a['bodyId'];b=pa.ipc.open_file(str(RAW/NAMES[1])).read_all();b=b.filter(pc.is_in(b['body'],value_set=ids))
    def incident():
        # Feather v2 is Arrow IPC: one compressed record batch at a time, no full edge table in RAM.
        # https://arrow.apache.org/docs/23.0/python/feather.html
        with pa.memory_map(str(RAW/NAMES[2]),'r') as f:
            r=pa.ipc.open_file(f)
            for i in range(r.num_record_batches):
                batch=r.get_batch(i)
                mask=pc.or_(pc.is_in(batch['body_pre'],value_set=ids),pc.is_in(batch['body_post'],value_set=ids))
                yield from batch.filter(mask).to_pylist()
    return a.to_pylist(),b.to_pylist(),incident,provenance

def main():
    a,b,incident,provenance=load_sources();data=prepare(a,b,incident())
    data['sourceSha256']={p['file']:p['sha256'] for p in provenance}; data['converterVersion']='1'
    content=canonical(data);hash_=hashlib.sha256(content).hexdigest()
    # Independent raw-row projection: no prepare()/sign conversion call reused for comparison.
    ids=[int(n['id']) for n in data['neurons']];idx={v:i for i,v in enumerate(ids)}
    rawEdges=sorted([idx[r['body_pre']],idx[r['body_post']],r['weight']] for r in incident() if r['body_pre'] in idx and r['body_post'] in idx and r['weight']>0)
    if rawEdges != [e[:3] for e in data['edges']]:raise ValueError('Raw edge projection mismatch')
    rebuilt=prepare(a[::-1],b[::-1],incident());rebuilt['sourceSha256']=data['sourceSha256'];rebuilt['converterVersion']='1'
    if canonical(rebuilt)!=content:raise ValueError('Non deterministic rebuild')
    out=ROOT/'data/prepared';out.mkdir(exist_ok=True)
    (out/'male-cns-dm1.json').write_bytes(content)
    manifest={'sha256':hash_,'bytes':len(content),'neurons':len(data['neurons']),'edges':len(data['edges']),'sourceFiles':provenance,'converterSha256':digest(Path(__file__)).hexdigest(),'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (out/'male-cns-dm1.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    evidence={'datasetSha256':hash_,'rawEdgeProjectionEqual':True,'deterministicRebuild':True,'cuts':data['cuts'],'neurons':len(data['neurons']),'edges':len(data['edges']),'selfEdges':sum(e[0]==e[1] for e in data['edges']),'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'sourceIncidentRows':sum(1 for _ in incident())}
    (ROOT/'docs/evidence/stage-2/data-validation.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps(evidence,indent=2))
if __name__=='__main__':main()
