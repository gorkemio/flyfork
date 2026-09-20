import copy, unittest
from prepare import prepare, canonical

A=[{'bodyId':9,'type':'ORN_DM1','rootSide':'L','somaSide':None,'entryNerve':'AN'},
   {'bodyId':11,'type':'DM1_lPN','rootSide':None,'somaSide':'R','entryNerve':None},
   {'bodyId':12,'type':'lLN2F_b','rootSide':None,'somaSide':'L','entryNerve':None}]
T=[{'body':i,'predicted_nt':nt,'consensus_nt':nt,'predicted_nt_confidence':.75,'total_nt_predictions':20} for i,nt in [(9,'acetylcholine'),(11,'acetylcholine'),(12,'gaba')]]
E=[{'body_pre':9,'body_post':11,'weight':7},{'body_pre':12,'body_post':11,'weight':3},{'body_pre':12,'body_post':12,'weight':2},{'body_pre':99,'body_post':11,'weight':10},{'body_pre':9,'body_post':99,'weight':5}]
class PrepareTest(unittest.TestCase):
 def test_exact_direction_sign_ids_cuts_and_order(self):
  d=prepare(A,T,E); self.assertEqual([n['id'] for n in d['neurons']],['9','11','12'])
  self.assertEqual(d['edges'],[[0,1,7,1],[2,1,3,-1],[2,2,2,-1]])
  self.assertEqual(d['cuts'],{'internal':12,'incomingCut':10,'outgoingCut':5,'incomingTotal':22,'outgoingTotal':17})
  self.assertEqual(canonical(d),canonical(prepare(A[::-1],T[::-1],E[::-1])))
 def test_reject_missing_unsupported_ambiguous_per_cell_nt(self):
  for key,value in [('predicted_nt',None),('predicted_nt','dopamine'),('consensus_nt','gaba'),('predicted_nt_confidence',.49),('total_nt_predictions',0)]:
   t=copy.deepcopy(T);t[0][key]=value
   with self.assertRaises(ValueError):prepare(A,t,E)
  with self.assertRaises(ValueError):prepare(A,T[1:],E)
 def test_reject_ids_duplicates_sides_and_bad_weights(self):
  for a,t,e in [(A+[A[0]],T,E),(A,T+[T[0]],E),(A,T,E+[E[0]])]:
   with self.assertRaises(ValueError):prepare(a,t,e)
  for key,value in [('bodyId',9.1),('rootSide',None),('entryNerve','unknown')]:
   a=copy.deepcopy(A);a[0][key]=value
   with self.assertRaises(ValueError):prepare(a,T,E)
  for weight in [-1,1.2,float('nan'),True]:
   e=copy.deepcopy(E);e[0]['weight']=weight
   with self.assertRaises(ValueError):prepare(A,T,e)
 def test_zero_edges_excluded(self):
  self.assertEqual(prepare(A,T,E+[{'body_pre':11,'body_post':9,'weight':0}]),prepare(A,T,E))
if __name__=='__main__':unittest.main()

class FileAndIdentityTest(unittest.TestCase):
 def test_uint64_source_ids_are_strings_without_float_conversion(self):
  a=copy.deepcopy(A);t=copy.deepcopy(T);e=copy.deepcopy(E);large=2**63+123
  a[0]['bodyId']=large;t[0]['body']=large
  for row in e:
   if row['body_pre']==9:row['body_pre']=large
  d=prepare(a,t,e);self.assertEqual(d['neurons'][-1]['id'],str(large))
 def test_partial_download_corrupt_bytes_and_checksum_are_rejected(self):
  import tempfile,base64,hashlib
  from pathlib import Path
  from download import validate
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'test.part';raw=b'ARROW1testARROW1';p.write_bytes(raw)
   md5=base64.b64encode(hashlib.md5(raw).digest()).decode()
   validate(p,len(raw),md5)
   for size,expected in [(len(raw)+1,md5),(len(raw),'wrong')]:
    with self.assertRaises(ValueError):validate(p,size,expected)
   p.write_bytes(b'broken');
   with self.assertRaises(ValueError):validate(p,6,None)
