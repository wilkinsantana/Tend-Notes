"""Build a deterministic extension ZIP from the checked and built source."""
import base64
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'extension.json').read_text())
package = json.loads((root / 'package.json').read_text())
assert manifest['version'] == package['version'], 'Package and extension versions must match'
files = {name: (root / name).read_bytes() for name in ['icon.svg', 'LICENSE', 'README.md']}
files['index.js'] = (root / 'dist/index.js').read_bytes()
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
