"""Build a deterministic extension ZIP from the checked and built source."""
import base64
import hashlib
import json
import re
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'extension.json').read_text())
package = json.loads((root / 'package.json').read_text())
assert manifest['version'] == package['version'], 'Package and extension versions must match'
files = {name: (root / name).read_bytes() for name in ['icon.svg', 'glyph.svg', 'LICENSE', 'README.md']}
javascript = {path.relative_to(root / 'dist').as_posix(): path.read_bytes() for path in sorted((root / 'dist').rglob('*.js'))}
assert 'index.js' in javascript, 'Missing extension entry: index.js'
assert 'task-worker.js' in javascript, 'Missing task worker entry: task-worker.js'
# The host's install scan refuses these constructs anywhere in the package, bundled dependencies included. The patterns
# mirror the host's block rules (no-eval, no-function-ctor, no-dynamic-import-expr, no-script-injection, no-document-write,
# no-cookie-write); a package that would fail the install scan must fail here, before it is signed or published.
evaluation = re.compile(
    r'\beval\s*\('
    r'|\bnew\s+Function\s*\('
    r'|(?:^|[^\w$])Function\s*\(\s*[\'"`]'
    r'|(?<![\w$])Function\s*\.\s*(?:call|apply|bind)\s*\('
    r'|\(\s*0\s*,\s*Function\s*\)\s*\('
    r'|Reflect\s*\.\s*construct\s*\(\s*Function\b', re.M)
# A dynamic import must take a bare string literal; the literal may not name a remote address.
dynamic_import = re.compile(r'\bimport\s*\(\s*(?![\'"][^\'"`]*[\'"]\s*\))')
remote_import = re.compile(r'\bimport\s*\(\s*[\'"`]\s*(?:https?:)?//', re.I)
others = [
    (re.compile(r'createElement\s*\(\s*[\'"]script[\'"]'), 'script-element injection'),
    (re.compile(r'document\.write(?:ln)?\s*\('), 'document.write'),
    (re.compile(r'document\.cookie\s*='), 'writing document.cookie'),
    (remote_import, 'dynamic import of a remote address'),
    (dynamic_import, 'dynamic import that is not a string literal'),
]
def refusals(text):
    """Every reason the host's install scan would refuse this JavaScript, as (label, matched text)."""
    found = evaluation.search(text)
    if found: yield 'runtime string evaluation', found.group(0).strip()
    for pattern, label in others:
        found = pattern.search(text)
        if found: yield label, found.group(0).strip()
for name, data in javascript.items():
    for label, matched in refusals(data.decode('utf-8', 'replace')):
        raise AssertionError(f'{name}: {label} is not allowed ({matched})')
files.update(javascript)
notices = []
visited = set()
def notice(name):
    if name in visited: return
    visited.add(name)
    path = root / 'node_modules' / name
    metadata = json.loads((path / 'package.json').read_text())
    candidates = sorted(p for p in path.iterdir() if p.is_file() and p.name.lower().startswith(('license', 'licence', 'copying')))
    assert candidates, f'Missing license notice: {name}'
    notices.append(f"\n--- {name} {metadata['version']} ---\n" + '\n'.join(p.read_text() for p in candidates))
for name in json.loads((root / 'dist/bundled-packages.json').read_text()): notice(name)
files['THIRD-PARTY-NOTICES.txt'] = '\n'.join(notices).encode()
manifest['integrity'] = {name: 'sha256-' + base64.b64encode(hashlib.sha256(data).digest()).decode() for name,data in files.items()}
files['extension.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
output = root / 'dist' / f"tend-notes-{manifest['version']}.zip"
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name,data in sorted(files.items()):
        entry = zipfile.ZipInfo(name, date_time=(2026,1,1,0,0,0)); entry.compress_type = zipfile.ZIP_DEFLATED; entry.external_attr = 0o644 << 16
        archive.writestr(entry, data)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
(root / 'dist' / 'SHA256SUMS').write_text(f'{digest}  {output.name}\n')
(root / 'dist' / 'extension.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(f'{output.name}: {digest}')
