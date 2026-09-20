import importlib.util
import pathlib
import unittest
from unittest.mock import patch
from subprocess import CompletedProcess

spec=importlib.util.spec_from_file_location('gate',pathlib.Path(__file__).with_name('release-gate.py'))
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)

def pair(name='a',current='b',previous='a',variant='forward'):
    return {'pair':name*64,'variant':variant,'images':{'forward':'ghcr.io/gorkemio/flyfork@sha256:'+name*64,'rollback':'ghcr.io/gorkemio/flyfork@sha256:'+'f'*64},'generations':{'forward':current*64,'rollback':previous*64}}

class GateTests(unittest.TestCase):
    def test_public_body_must_match_and_http_must_be_200(self):
        body=b'{"generation":"real"}'
        expected=gate.hashlib.sha256(body).hexdigest()
        with patch.object(gate.subprocess,'run',return_value=CompletedProcess([],0,body+b'\n200',b'')):
            gate.verify_public_generation(expected)
            with self.assertRaisesRegex(ValueError,'does not match'):gate.verify_public_generation('0'*64)
        with patch.object(gate.subprocess,'run',return_value=CompletedProcess([],0,body+b'\n302',b'')):
            with self.assertRaisesRegex(ValueError,'HTTP 200'):gate.verify_public_generation(expected)
    def test_transport_failure_is_not_accepted_or_retried(self):
        with patch.object(gate.subprocess,'run',return_value=CompletedProcess([],60,b'',b'TLS verification failed')) as run:
            with self.assertRaisesRegex(ValueError,'TLS verification failed'):gate.verify_public_generation('0'*64)
            run.assert_called_once()
            self.assertNotIn('--insecure',run.call_args.args[0])
    def test_third_generation_is_blocked_until_exact_24_hour_boundary(self):
        state=gate.activate({},pair(),100)
        with self.assertRaisesRegex(ValueError,'24-hour'):gate.admit(state,pair('c','c','b'),86499)
        gate.admit(state,pair('c','c','b'),86500)
    def test_rollback_keeps_pair_window_and_identities(self):
        state=gate.activate({},pair(),100)
        rolled=gate.activate(state,pair(variant='rollback'),200)
        self.assertEqual(rolled['active']['earliestNextActivation'],86500)
        changed=pair();changed['images']['forward']='ghcr.io/gorkemio/flyfork@sha256:'+'e'*64
        with self.assertRaisesRegex(ValueError,'redefined'):gate.admit(state,changed,300)
    def test_next_pair_must_retain_current_generation(self):
        state=gate.activate({},pair(),100)
        with self.assertRaisesRegex(ValueError,'retain'):gate.admit(state,pair('d','d','e'),90000)
    def test_pending_operation_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'Unfinished'):gate.admit({'pending':pair()},pair('c','c','b'),90000)
    def test_mutable_image_and_equal_generations_are_rejected(self):
        request=pair();request['images']['forward']='ghcr.io/gorkemio/flyfork:latest'
        with self.assertRaises(ValueError):gate.admit({},request,0)
        with self.assertRaises(ValueError):gate.admit({},pair(current='a'),0)

if __name__=='__main__':unittest.main()
