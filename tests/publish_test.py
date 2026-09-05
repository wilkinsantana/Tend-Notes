import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('publish',Path(__file__).parents[1]/'scripts/publish.py')
publish=importlib.util.module_from_spec(spec);spec.loader.exec_module(publish)

class PublicationTests(unittest.TestCase):
    def test_wrong_existing_tag_without_release_cannot_push_or_upload(self):
        sha='a'*40
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'dist').mkdir()
            (root/'extension.json').write_text(json.dumps({'version':'0.1.0'}))
            (root/'dist/tend-notes-0.1.0.zip').write_bytes(b'verified artifact')
            (root/'dist/SHA256SUMS').write_text(hashlib.sha256(b'verified artifact').hexdigest()+'  tend-notes-0.1.0.zip\n')
            def api(path,*args,**kwargs):
                self.assertEqual(path,'/git/ref/tags/v0.1.0')
                return {'object':{'type':'commit','sha':'b'*40}}
            with patch.object(publish,'ROOT',root),patch.dict(publish.os.environ,{'VERIFIED_SHA':sha}),patch.object(publish.subprocess,'check_output',return_value=sha),patch.object(publish.subprocess,'run') as push,patch.object(publish,'api',side_effect=api) as request:
                with self.assertRaisesRegex(AssertionError,'another commit'):publish.main()
                push.assert_not_called();self.assertEqual(request.call_count,1)

    def test_annotated_tag_is_dereferenced(self):
        with patch.object(publish,'api',side_effect=[{'object':{'type':'tag','sha':'tag-object'}},{'object':{'type':'commit','sha':'verified'}}]):
            self.assertEqual(publish.tag_target('v0.1.0'),'verified')

    def test_empty_repository_is_not_an_existing_tag(self):
        import io
        from urllib.error import HTTPError
        error=HTTPError('https://api.github.com/',409,'Conflict',{},io.BytesIO(b'{"message":"Git Repository is empty."}'))
        with patch.object(publish,'api',side_effect=error):
            self.assertIsNone(publish.tag_target('v0.1.0'))

    def test_unrelated_conflict_is_not_silently_ignored(self):
        import io
        from urllib.error import HTTPError
        error=HTTPError('https://api.github.com/',409,'Conflict',{},io.BytesIO(b'{"message":"another conflict"}'))
        with patch.object(publish,'api',side_effect=error):
            with self.assertRaises(HTTPError):publish.tag_target('v0.1.0')

if __name__=='__main__':unittest.main()
