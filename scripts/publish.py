"""Publish this job's verified commit and ZIP; never rebuild or replace assets."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sign_component_release import (  # noqa: E402
    ASSET_NAME, COMPONENT_ID, KEY_ID, MAX_RELEASES, PUBLIC_KEY_RAW, YEAR_SECONDS,
    envelope_bytes, parse_envelope_json, public_raw_from_private, sign_payload, strict_version,
    verify_envelope, version_sequence,
)

REPO = 'wilkinsantana/Tend-Notes'
ROOT = Path(__file__).resolve().parent.parent

class NoAuthenticatedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,request,fp,code,msg,headers,newurl):
        raise AssertionError('Authenticated GitHub API redirects are forbidden')

def api(path, method='GET', payload=None, binary=None, content_type=None):
    data = binary if binary is not None else json.dumps(payload).encode() if payload is not None else None
    url = path if path.startswith('https://') else 'https://api.github.com/repos/'+REPO+path
    parsed=urllib.parse.urlparse(url)
    allowed_path='/repos/'+REPO+'/'
    if (parsed.scheme != 'https' or parsed.hostname not in {'api.github.com','uploads.github.com'} or
        parsed.username is not None or parsed.password is not None or parsed.fragment or
        parsed.port not in (None,443) or not parsed.path.startswith(allowed_path)):
        raise AssertionError('Authenticated GitHub API URL is invalid')
    request = urllib.request.Request(url, method=method, data=data, headers={
      'Authorization':'Bearer '+os.environ['GH_TOKEN'],
      'Accept':'application/vnd.github+json',
      'Content-Type':content_type or ('application/octet-stream' if binary is not None else 'application/json'),
      'User-Agent':'TEND-Notes-release'})
    with urllib.request.build_opener(NoAuthenticatedRedirect()).open(request, timeout=90) as response:
        body=response.read(); return json.loads(body) if body else None

def tag_target(tag):
    try:
        target=api('/git/ref/tags/'+tag)['object']
    except urllib.error.HTTPError as error:
        try:
            if error.code == 404: return None
            if error.code == 409 and json.loads(error.read()).get('message') == 'Git Repository is empty.': return None
            raise
        finally:
            error.close()
    for _ in range(5):
        if target['type'] == 'commit': return target['sha']
        assert target['type'] == 'tag', 'Release tag must resolve to a commit'
        target=api('/git/tags/'+target['sha'])['object']
    raise AssertionError('Release tag nesting is too deep')

def release_asset(release, name):
    return next((asset for asset in release.get('assets',[]) if asset.get('name') == name), None)

class SafeAssetRedirect(urllib.request.HTTPRedirectHandler):
    ALLOWED_HOSTS={'github.com','objects.githubusercontent.com','release-assets.githubusercontent.com'}
    def redirect_request(self,request,fp,code,msg,headers,newurl):
        parsed=urllib.parse.urlparse(newurl)
        if (parsed.scheme != 'https' or parsed.hostname not in self.ALLOWED_HOSTS or
            parsed.username is not None or parsed.password is not None or parsed.fragment or
            parsed.port not in (None,443)):
            raise AssertionError('Signed release metadata redirect is invalid')
        return super().redirect_request(request,fp,code,msg,headers,newurl)

def read_signed_feed(asset,tag):
    expected='https://github.com/'+REPO+'/releases/download/'+urllib.parse.quote(tag,safe='')+'/'+ASSET_NAME
    assert asset.get('browser_download_url') == expected, 'Signed release metadata URL is invalid'
    request=urllib.request.Request(expected,headers={'Accept':'application/octet-stream','User-Agent':'TEND-Notes-release'})
    with urllib.request.build_opener(SafeAssetRedirect()).open(request,timeout=30) as response:
        size=response.headers.get('Content-Length')
        assert size is None or int(size) <= 65536, 'Signed release metadata is too large'
        raw=response.read(65537)
    assert len(raw) <= 65536, 'Signed release metadata is too large'
    assert asset.get('digest') == 'sha256:'+hashlib.sha256(raw).hexdigest(), 'Signed release metadata digest differs'
    try:
        envelope=parse_envelope_json(raw)
        payload=verify_envelope(envelope)
    except ValueError as error:
        raise AssertionError('Signed release metadata is invalid') from error
    return raw,envelope,payload

def prior_release_history(version):
    current=strict_version(version)
    releases=api('/releases?per_page=100')
    candidates=[]
    for release in releases:
        tag=release.get('tag_name','')
        try:
            parsed=strict_version(tag[1:]) if tag.startswith('v') else None
        except ValueError:
            continue
        if parsed is not None and parsed < current and not release.get('draft') and not release.get('prerelease'):
            candidates.append((parsed,release))
    for parsed,release in sorted(candidates,reverse=True):
        asset=release_asset(release,ASSET_NAME)
        if not asset:
            continue
        _,_,payload=read_signed_feed(asset,release['tag_name'])
        assert strict_version(payload['releases'][-1]['version']) == parsed, 'Prior signed feed does not match its release'
        return payload['releases']
    assert version == '0.9.9', 'A prior verified signed feed is required after the initial 0.9.9 release'
    return []

def release_record(version,sha,archive,digest):
    return {
      'version':version,
      'revision':sha,
      'package':{'name':archive.name,'bytes':archive.stat().st_size,'sha256':digest},
      'requires':{'runtime_api':1,'capabilities':{'documents':1}},
    }

def build_payload(version,sha,archive,digest,issued_at,history):
    record=release_record(version,sha,archive,digest)
    assert all(strict_version(item['version']) < strict_version(version) for item in history), 'Prior feed cannot contain this or a newer version'
    releases=([*history,record])[-MAX_RELEASES:]
    return {'component_id':COMPONENT_ID,'sequence':version_sequence(version),'issued_at':issued_at,
      'expires_at':issued_at+YEAR_SECONDS,'releases':releases}

def main():
    private_key=os.environ.get('COMPONENT_RELEASE_SIGNING_KEY','')
    assert private_key, 'COMPONENT_RELEASE_SIGNING_KEY is required before publication'
    try:
        public_raw=public_raw_from_private(private_key)
    except ValueError as error:
        raise AssertionError('Component release signing key is invalid') from error
    assert public_raw == PUBLIC_KEY_RAW, 'Component release signing key is invalid'
    sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    assert sha == os.environ['VERIFIED_SHA'], 'Only the exact CI commit can be published'
    issued_at=int(subprocess.check_output(['git','show','-s','--format=%ct','HEAD'],text=True).strip())
    version=json.loads((ROOT/'extension.json').read_text())['version']
    strict_version(version)
    archive=ROOT/'dist'/f'tend-notes-{version}.zip'
    digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    assert (ROOT/'dist/SHA256SUMS').read_text() == digest+'  '+archive.name+'\n', 'SHA256SUMS must describe only the exact release package'
    tag='v'+version
    existing_target=tag_target(tag)
    assert existing_target in (None,sha), 'Version tag belongs to another commit; increment version'
    try:
        release=api('/releases/tags/'+tag)
        assert existing_target == sha, 'Existing release must retain its verified tag'
    except urllib.error.HTTPError as error:
        try:
            if error.code != 404: raise
            release=None
        finally:
            error.close()
    current_feed=release_asset(release or {},ASSET_NAME)
    if current_feed:
        metadata,_,payload=read_signed_feed(current_feed,tag)
        expected=build_payload(version,sha,archive,digest,issued_at,payload['releases'][:-1])
        assert payload == expected, 'Existing signed release metadata differs; immutable releases are never replaced'
    else:
        history=prior_release_history(version)
        payload=build_payload(version,sha,archive,digest,issued_at,history)
        envelope=sign_payload(payload,private_key)
        metadata=envelope_bytes(envelope)
    for asset in (release or {}).get('assets',[]):
        if asset['name'] in (archive.name,'SHA256SUMS'):
            expected=hashlib.sha256((ROOT/'dist'/asset['name']).read_bytes()).hexdigest()
            assert asset.get('digest') == 'sha256:'+expected, 'Existing immutable asset differs'
        elif asset['name'] == ASSET_NAME:
            existing,_,_=read_signed_feed(asset,tag)
            assert existing == metadata, 'Existing signed release metadata differs; immutable releases are never replaced'
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
        asset=api(release['upload_url'].split('{')[0]+'?name='+urllib.parse.quote(path.name),'POST',binary=path.read_bytes(),content_type='application/zip' if path == archive else 'text/plain')
        assert asset.get('digest') == 'sha256:'+hashlib.sha256(path.read_bytes()).hexdigest()
        assets[path.name]=asset
    for path in [archive,ROOT/'dist/SHA256SUMS']:
        assert assets[path.name].get('digest') == 'sha256:'+hashlib.sha256(path.read_bytes()).hexdigest(), 'Release package verification failed before metadata upload'
    existing=assets.get(ASSET_NAME)
    if existing:
        current,_,_=read_signed_feed(existing,tag)
        assert current == metadata, 'Existing signed release metadata differs; immutable releases are never replaced'
    else:
        asset=api(release['upload_url'].split('{')[0]+'?name='+urllib.parse.quote(ASSET_NAME),'POST',binary=metadata,content_type='application/json')
        assert asset.get('digest') == 'sha256:'+hashlib.sha256(metadata).hexdigest(), 'Signed release metadata upload was not verified'
    print('Published verified source '+sha+' and '+archive.name+' ('+digest+')')

if __name__ == '__main__':
    main()
