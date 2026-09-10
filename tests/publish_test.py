import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec=importlib.util.spec_from_file_location('publish',Path(__file__).parents[1]/'scripts/publish.py')
publish=importlib.util.module_from_spec(spec);spec.loader.exec_module(publish)

SHA='a'*40
ISSUED_AT=1_700_000_000
ARTIFACT=b'verified artifact'
DIGEST=hashlib.sha256(ARTIFACT).hexdigest()
METADATA=b'{"signed":"fixture"}\n'

def http_error(code,message='Not Found'):
    return HTTPError('https://api.github.com/',code,message,{},io.BytesIO(json.dumps({'message':message}).encode()))

class PublicationTests(unittest.TestCase):
    def make_root(self,folder,version='0.9.9'):
        root=Path(folder);(root/'dist').mkdir()
        (root/'extension.json').write_text(json.dumps({'version':version}))
        archive=root/'dist'/f'tend-notes-{version}.zip'
        archive.write_bytes(ARTIFACT)
        (root/'dist/SHA256SUMS').write_text(DIGEST+'  '+archive.name+'\n')
        return root,archive

    def env(self):
        return {'GH_TOKEN':'fixture','VERIFIED_SHA':SHA,'COMPONENT_RELEASE_SIGNING_KEY':'fixture key'}

    @staticmethod
    def git_output(command,**kwargs):
        return str(ISSUED_AT) if '--format=%ct' in command else SHA

    def main_patches(self,root):
        return (
            patch.object(publish,'ROOT',root),
            patch.dict(os.environ,self.env(),clear=True),
            patch.object(publish,'public_raw_from_private',return_value=publish.PUBLIC_KEY_RAW),
            patch.object(publish.subprocess,'check_output',side_effect=self.git_output),
        )

    def test_missing_signing_key_has_no_git_or_github_effects(self):
        with patch.dict(os.environ,{},clear=True),patch.object(publish,'api') as request,patch.object(publish.subprocess,'check_output') as git_read,patch.object(publish.subprocess,'run') as git_mutation:
            with self.assertRaisesRegex(AssertionError,'SIGNING_KEY is required'):
                publish.main()
        request.assert_not_called();git_read.assert_not_called();git_mutation.assert_not_called()

    def test_wrong_signing_key_has_no_git_or_github_effects(self):
        with patch.dict(os.environ,{'COMPONENT_RELEASE_SIGNING_KEY':'wrong'},clear=True),patch.object(publish,'public_raw_from_private',return_value=b'x'*32),patch.object(publish,'api') as request,patch.object(publish.subprocess,'check_output') as git_read,patch.object(publish.subprocess,'run') as git_mutation:
            with self.assertRaisesRegex(AssertionError,'signing key is invalid'):
                publish.main()
        request.assert_not_called();git_read.assert_not_called();git_mutation.assert_not_called()

    def test_authenticated_api_rejects_unapproved_url_before_request(self):
        with patch.dict(os.environ,{'GH_TOKEN':'fixture'},clear=True),patch.object(publish.urllib.request,'build_opener') as request:
            with self.assertRaisesRegex(AssertionError,'API URL is invalid'):
                publish.api('https://example.test/repos/wilkinsantana/Tend-Notes/releases')
        request.assert_not_called()

    def test_authenticated_api_refuses_every_redirect(self):
        handler=publish.NoAuthenticatedRedirect()
        request=publish.urllib.request.Request('https://api.github.com/repos/'+publish.REPO+'/releases',headers={'Authorization':'Bearer fixture'})
        with self.assertRaisesRegex(AssertionError,'redirects are forbidden'):
            handler.redirect_request(request,None,302,'Found',{},'https://api.github.com/repos/'+publish.REPO+'/other')

    def test_public_feed_download_never_carries_github_token(self):
        raw=b'{"fixture":true}'
        tag='v0.9.9'
        url='https://github.com/'+publish.REPO+'/releases/download/'+tag+'/'+publish.ASSET_NAME
        asset={'browser_download_url':url,'digest':'sha256:'+hashlib.sha256(raw).hexdigest()}
        class Response:
            headers={'Content-Length':str(len(raw))}
            def __enter__(self):return self
            def __exit__(self,*args):return None
            def read(self,size):return raw
        class Opener:
            def open(inner,request,timeout):
                self.assertIsNone(request.get_header('Authorization'))
                self.assertEqual(request.full_url,url)
                return Response()
        with patch.dict(os.environ,{'GH_TOKEN':'must-not-leak'},clear=True),patch.object(publish.urllib.request,'build_opener',return_value=Opener()),patch.object(publish,'parse_envelope_json',return_value={'fixture':True}),patch.object(publish,'verify_envelope',return_value={'payload':True}):
            downloaded,_,payload=publish.read_signed_feed(asset,tag)
        self.assertEqual(downloaded,raw);self.assertEqual(payload,{'payload':True})

    def test_wrong_existing_tag_without_release_cannot_push_or_upload(self):
        with tempfile.TemporaryDirectory() as folder:
            root,_=self.make_root(folder)
            contexts=self.main_patches(root)
            with contexts[0],contexts[1],contexts[2],contexts[3],patch.object(publish,'tag_target',return_value='b'*40),patch.object(publish.subprocess,'run') as push,patch.object(publish,'api') as request:
                with self.assertRaisesRegex(AssertionError,'another commit'):publish.main()
        push.assert_not_called();request.assert_not_called()

    def test_metadata_is_uploaded_last_after_verified_package_assets(self):
        uploads=[]
        with tempfile.TemporaryDirectory() as folder:
            root,archive=self.make_root(folder)
            def api(path,method='GET',payload=None,binary=None,**kwargs):
                if path == '/releases/tags/v0.9.9': raise http_error(404)
                if path == '/git/ref/heads/main': return {'object':{'sha':SHA}}
                if path == '/releases' and method == 'POST':
                    return {'upload_url':'https://uploads.github.test/assets{?name,label}','assets':[]}
                if path.startswith('https://uploads.github.test/assets') and method == 'POST':
                    name=path.split('name=',1)[1];uploads.append(name)
                    return {'name':name,'digest':'sha256:'+hashlib.sha256(binary).hexdigest()}
                self.fail('Unexpected API request '+path)
            contexts=self.main_patches(root)
            with contexts[0],contexts[1],contexts[2],contexts[3],patch.object(publish,'tag_target',side_effect=[None,SHA]),patch.object(publish,'prior_release_history',return_value=[]),patch.object(publish,'sign_payload',return_value={'fixture':True}),patch.object(publish,'envelope_bytes',return_value=METADATA),patch.object(publish.subprocess,'run') as push,patch.object(publish,'api',side_effect=api):
                publish.main()
            push.assert_called_once()
        self.assertEqual(uploads,[archive.name,'SHA256SUMS',publish.ASSET_NAME])

    def test_existing_signed_metadata_mismatch_stops_before_push(self):
        with tempfile.TemporaryDirectory() as folder:
            root,archive=self.make_root(folder)
            feed={'name':publish.ASSET_NAME,'digest':'sha256:'+hashlib.sha256(b'old').hexdigest(),'browser_download_url':'fixture'}
            release={'assets':[feed]}
            payload=publish.build_payload('0.9.9',SHA,archive,DIGEST,ISSUED_AT,[])
            changed={**payload,'issued_at':ISSUED_AT-1,'expires_at':ISSUED_AT-1+publish.YEAR_SECONDS}
            contexts=self.main_patches(root)
            with contexts[0],contexts[1],contexts[2],contexts[3],patch.object(publish,'tag_target',return_value=SHA),patch.object(publish,'api',return_value=release),patch.object(publish,'read_signed_feed',return_value=(b'old',{},changed)),patch.object(publish.subprocess,'run') as push:
                with self.assertRaisesRegex(AssertionError,'signed release metadata differs'):
                    publish.main()
            push.assert_not_called()

    def test_exact_existing_signed_metadata_is_reused_without_prior_feed(self):
        with tempfile.TemporaryDirectory() as folder:
            root,archive=self.make_root(folder)
            payload=publish.build_payload('0.9.9',SHA,archive,DIGEST,ISSUED_AT,[])
            package_assets=[]
            for name,data in ((archive.name,ARTIFACT),('SHA256SUMS',(root/'dist/SHA256SUMS').read_bytes())):
                package_assets.append({'name':name,'digest':'sha256:'+hashlib.sha256(data).hexdigest()})
            feed={'name':publish.ASSET_NAME,'digest':'sha256:'+hashlib.sha256(METADATA).hexdigest(),'browser_download_url':'fixture'}
            release={'assets':package_assets+[feed],'upload_url':'https://uploads.github.test/assets{?name,label}'}
            def api(path,*args,**kwargs):
                if path == '/releases/tags/v0.9.9': return release
                if path == '/git/ref/heads/main': return {'object':{'sha':SHA}}
                self.fail('Unexpected API request '+path)
            contexts=self.main_patches(root)
            with contexts[0],contexts[1],contexts[2],contexts[3],patch.object(publish,'tag_target',side_effect=[SHA,SHA]),patch.object(publish,'prior_release_history') as prior,patch.object(publish,'read_signed_feed',return_value=(METADATA,{},payload)),patch.object(publish,'sign_payload') as sign,patch.object(publish.subprocess,'run') as push,patch.object(publish,'api',side_effect=api):
                publish.main()
            push.assert_called_once();prior.assert_not_called();sign.assert_not_called()

    def test_annotated_tag_is_dereferenced(self):
        with patch.object(publish,'api',side_effect=[{'object':{'type':'tag','sha':'tag-object'}},{'object':{'type':'commit','sha':'verified'}}]):
            self.assertEqual(publish.tag_target('v0.1.0'),'verified')

    def test_empty_repository_is_not_an_existing_tag(self):
        with patch.object(publish,'api',side_effect=http_error(409,'Git Repository is empty.')):
            self.assertIsNone(publish.tag_target('v0.1.0'))

    def test_unrelated_conflict_is_not_silently_ignored(self):
        with patch.object(publish,'api',side_effect=http_error(409,'another conflict')):
            with self.assertRaises(HTTPError):publish.tag_target('v0.1.0')

if __name__=='__main__':unittest.main()
