"""Publish this job's verified commit and ZIP; never rebuild or replace assets."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request

REPO = 'wilkinsantana/Tend-Notes'
ROOT = Path(__file__).resolve().parent.parent

def api(path, method='GET', payload=None, binary=None):
    data = binary if binary is not None else json.dumps(payload).encode() if payload is not None else None
    url = path if path.startswith('https://') else 'https://api.github.com/repos/'+REPO+path
    request = urllib.request.Request(url, method=method, data=data, headers={
      'Authorization':'Bearer '+os.environ['GH_TOKEN'], 'Accept':'application/vnd.github+json',
      'Content-Type':'application/zip' if binary is not None else 'application/json', 'User-Agent':'TEND-Notes-release'})
    with urllib.request.urlopen(request, timeout=90) as response:
        body=response.read(); return json.loads(body) if body else None

def tag_target(tag):
    try:
        target=api('/git/ref/tags/'+tag)['object']
    except urllib.error.HTTPError as error:
        if error.code == 404: return None
        if error.code == 409 and json.loads(error.read()).get('message') == 'Git Repository is empty.': return None
        raise
    for _ in range(5):
        if target['type'] == 'commit': return target['sha']
        assert target['type'] == 'tag', 'Release tag must resolve to a commit'
        target=api('/git/tags/'+target['sha'])['object']
    raise AssertionError('Release tag nesting is too deep')

def main():
    sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    assert sha == os.environ['VERIFIED_SHA'], 'Only the exact CI commit can be published'
    version=json.loads((ROOT/'extension.json').read_text())['version']
    archive=ROOT/'dist'/f'tend-notes-{version}.zip'
    digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    assert (ROOT/'dist/SHA256SUMS').read_text().split()[0] == digest
    tag='v'+version
    existing_target=tag_target(tag)
    assert existing_target in (None,sha), 'Version tag belongs to another commit; increment version'
    try:
        release=api('/releases/tags/'+tag)
        assert existing_target == sha, 'Existing release must retain its verified tag'
    except urllib.error.HTTPError as error:
        if error.code != 404: raise
        release=None
    for asset in (release or {}).get('assets',[]):
        if asset['name'] in (archive.name,'SHA256SUMS'):
            expected=hashlib.sha256((ROOT/'dist'/asset['name']).read_bytes()).hexdigest()
            assert asset.get('digest') == 'sha256:'+expected, 'Existing immutable asset differs'
    # Never put credentials in URLs, command arguments, logs, or tracked files.
    with tempfile.TemporaryDirectory() as directory:
        askpass=Path(directory)/'askpass.py'
        askpass.write_text('#!/usr/bin/env python3\nimport os,sys\nprint("x-access-token" if "Username" in sys.argv[1] else os.environ["GH_TOKEN"])\n')
        askpass.chmod(0o700)
        env={**os.environ,'GIT_ASKPASS':str(askpass),'GIT_TERMINAL_PROMPT':'0'}
        subprocess.run(['git','push','https://github.com/'+REPO+'.git','HEAD:refs/heads/main'],env=env,check=True)
    assert api('/git/ref/heads/main')['object']['sha'] == sha
    if release is None:
        release=api('/releases','POST',{'tag_name':tag,'target_commitish':sha,'name':'TEND Notes '+version,
          'body':'Native Markdown notes for Tend. Requires host document capability v1. Activate and update manually from Extensions.\n\nVerified source: `'+sha+'`\nPackage SHA-256: `'+digest+'`','draft':False,'prerelease':False})
    assert tag_target(tag) == sha, 'Release tag changed; refusing to upload assets'
    assets={asset['name']:asset for asset in release.get('assets',[])}
    for path in [archive, ROOT/'dist/SHA256SUMS']:
        existing=assets.get(path.name)
        if existing:
            assert existing.get('digest') == 'sha256:'+hashlib.sha256(path.read_bytes()).hexdigest(), 'Existing release asset differs; immutable releases are never replaced'
            continue
        asset=api(release['upload_url'].split('{')[0]+'?name='+path.name,'POST',binary=path.read_bytes())
        assert asset.get('digest') == 'sha256:'+hashlib.sha256(path.read_bytes()).hexdigest()
    print('Published verified source '+sha+' and '+archive.name+' ('+digest+')')

if __name__ == '__main__':
    main()
