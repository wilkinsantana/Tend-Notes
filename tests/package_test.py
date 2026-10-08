"""Packaging must not depend on filesystem enumeration order."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'package.py'

class PackageReproducibilityTests(unittest.TestCase):
    def test_equivalent_builds_with_different_creation_order_have_identical_zip_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            artifacts = []
            files = ['index.js', 'task-worker.js', 'chunks/shared.js']
            for label, order in [('one', files), ('two', list(reversed(files)))]:
                root = Path(folder) / label
                (root / 'scripts').mkdir(parents=True)
                shutil.copyfile(SCRIPT, root / 'scripts/package.py')
                (root / 'package.json').write_text(json.dumps({'version':'1.0.0'}))
                (root / 'extension.json').write_text(json.dumps({'version':'1.0.0','id':'test.notes'}))
                for name in ['icon.svg','glyph.svg','LICENSE','README.md']:
                    (root / name).write_text(name)
                for name in order:
                    target = root / 'dist' / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text('/* '+name+' */')
                (root / 'dist/bundled-packages.json').write_text('["fixture"]')
                dependency = root / 'node_modules/fixture'
                dependency.mkdir(parents=True)
                (dependency / 'package.json').write_text('{"version":"1"}')
                (dependency / 'LICENSE').write_text('Fixture license')
                result = subprocess.run([sys.executable, str(root / 'scripts/package.py')], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                archive = root / 'dist/tend-notes-1.0.0.zip'
                with zipfile.ZipFile(archive) as zipped:
                    manifest = json.loads(zipped.read('extension.json'))
                    self.assertTrue(set(files).issubset(manifest['integrity']))
                artifacts.append(archive.read_bytes())
            self.assertEqual(artifacts[0], artifacts[1])

    def test_runtime_string_evaluation_in_any_bundled_file_fails_packaging(self):
        for source in ['x = Function("return this")();', 'eval("1")', 'new Function("a", "return a")']:
            with tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                (root / 'scripts').mkdir()
                shutil.copyfile(SCRIPT, root / 'scripts/package.py')
                (root / 'package.json').write_text(json.dumps({'version':'1.0.0'}))
                (root / 'extension.json').write_text(json.dumps({'version':'1.0.0','id':'test.notes'}))
                for name in ['icon.svg','glyph.svg','LICENSE','README.md']:
                    (root / name).write_text(name)
                (root / 'dist/chunks').mkdir(parents=True)
                for name in ['index.js', 'task-worker.js']:
                    (root / 'dist' / name).write_text('export {}')
                (root / 'dist/chunks/dependency.js').write_text(source)
                (root / 'dist/bundled-packages.json').write_text('[]')
                result = subprocess.run([sys.executable, str(root / 'scripts/package.py')], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0, source)
                self.assertIn('runtime string evaluation', result.stderr)

if __name__ == '__main__':
    unittest.main()
