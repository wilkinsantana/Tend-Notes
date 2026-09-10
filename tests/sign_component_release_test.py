import base64
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('sign_component_release',Path(__file__).parents[1]/'scripts/sign_component_release.py')
signing=importlib.util.module_from_spec(spec);spec.loader.exec_module(signing)

class SigningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory=tempfile.TemporaryDirectory()
        cls.key_path=Path(cls.directory.name)/'fixture.pem'
        subprocess.run(['openssl','genpkey','-algorithm','ED25519','-out',str(cls.key_path)],check=True,capture_output=True)
        cls.private_pem=cls.key_path.read_text()
        cls.public_raw=signing.public_raw_from_private(cls.private_pem)
        cls.key_id=signing.derived_key_id(cls.public_raw)

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def payload(self):
        version='0.9.9';issued=1_700_000_000
        return {'component_id':signing.COMPONENT_ID,'sequence':signing.version_sequence(version),'issued_at':issued,
          'expires_at':issued+signing.YEAR_SECONDS,'releases':[{'version':version,'revision':'a'*40,
          'package':{'name':f'tend-notes-{version}.zip','bytes':123,'sha256':'b'*64},
          'requires':{'runtime_api':1,'capabilities':{'documents':1}}}]}

    def sign(self,payload=None):
        return signing.sign_payload(payload or self.payload(),self.private_pem,expected_public_raw=self.public_raw,key_id=self.key_id)

    def test_generated_fixture_signature_verifies(self):
        envelope=self.sign()
        self.assertEqual(signing.verify_envelope(envelope,public_raw=self.public_raw,key_id=self.key_id),self.payload())
        self.assertEqual(len(base64.b64decode(envelope['signature'],validate=True)),64)

    def test_digest_is_cryptographically_bound(self):
        envelope=self.sign();tampered=copy.deepcopy(envelope)
        tampered['payload']['releases'][0]['package']['sha256']='c'*64
        with self.assertRaisesRegex(ValueError,'OpenSSL rejected'):
            signing.verify_envelope(tampered,public_raw=self.public_raw,key_id=self.key_id)

    def test_domain_prefix_and_canonical_payload_are_exact(self):
        payload=self.payload()
        expected=b'tend-extension-feed-v1\n'+json.dumps(payload,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode('ascii')
        self.assertEqual(signing.signed_bytes(payload),expected)

    def test_production_pin_rejects_fixture_private_key(self):
        with self.assertRaisesRegex(ValueError,'does not match'):
            signing.sign_payload(self.payload(),self.private_pem)

    def test_strict_versions_and_exact_contract(self):
        for invalid in ('01.2.3','1.02.3','1.2.03','1.2','1.2.1000000'):
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):signing.strict_version(invalid)
        payload=self.payload();payload['releases'][0]['package']['name']='other.zip'
        with self.assertRaisesRegex(ValueError,'Package name'):signing.validate_payload(payload)

    def test_duplicate_json_and_boolean_schema_are_rejected(self):
        with self.assertRaisesRegex(ValueError,'Duplicate JSON'):
            signing.parse_envelope_json(b'{"schema":1,"schema":1}')
        envelope=self.sign();envelope['schema']=True
        with self.assertRaisesRegex(ValueError,'identity'):
            signing.verify_envelope(envelope,public_raw=self.public_raw,key_id=self.key_id)

if __name__=='__main__':unittest.main()
