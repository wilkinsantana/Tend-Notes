"""Create and verify the canonical signed TEND extension release feed."""
from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path
import subprocess
import tempfile

ASSET_NAME = "tend-extension-feed-v1.json"
DOMAIN = b"tend-extension-feed-v1\n"
SCHEMA = 1
COMPONENT_ID = "host.tend.notes"
KEY_ID = "8fe62b1d463f8cce"
PUBLIC_KEY_RAW = base64.b64decode("i39HitQ2s+URRZqlfR18aY/VdDH+K6lC6YUxNIqg3CQ=", validate=True)
SPKI_PREFIX = bytes.fromhex("302a300506032b6570032100")
MAX_RELEASES = 64
YEAR_SECONDS = 365 * 24 * 60 * 60
_VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
_SHA = re.compile(r"[0-9a-f]{40}")
_DIGEST = re.compile(r"[0-9a-f]{64}")


def strict_version(value: str) -> tuple[int, int, int]:
    match = _VERSION.fullmatch(value) if isinstance(value, str) else None
    if not match:
        raise ValueError("Release versions must be strict major.minor.patch values")
    parts = tuple(int(part) for part in match.groups())
    if any(part >= 1_000_000 for part in parts):
        raise ValueError("Release version components must be below 1000000")
    return parts


def version_sequence(value: str) -> int:
    major, minor, patch = strict_version(value)
    return major * 1_000_000_000_000 + minor * 1_000_000 + patch


def canonical_payload(payload: dict) -> bytes:
    validate_payload(payload)
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def signed_bytes(payload: dict) -> bytes:
    return DOMAIN + canonical_payload(payload)


def _exact_keys(value: dict, expected: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError(f"{label} fields are invalid")


def validate_release(release: dict) -> None:
    _exact_keys(release, {"version", "revision", "package", "requires"}, "release")
    strict_version(release["version"])
    if not isinstance(release["revision"], str) or not _SHA.fullmatch(release["revision"]):
        raise ValueError("Release revision must be a lowercase 40-character commit")
    package = release["package"]
    _exact_keys(package, {"name", "bytes", "sha256"}, "package")
    if package["name"] != f"tend-notes-{release['version']}.zip":
        raise ValueError("Package name is invalid")
    if isinstance(package["bytes"], bool) or not isinstance(package["bytes"], int) or package["bytes"] <= 0:
        raise ValueError("Package byte count is invalid")
    if not isinstance(package["sha256"], str) or not _DIGEST.fullmatch(package["sha256"]):
        raise ValueError("Package digest is invalid")
    requires = release["requires"]
    _exact_keys(requires, {"runtime_api", "capabilities"}, "requirements")
    if type(requires["runtime_api"]) is not int or requires["runtime_api"] != 1:
        raise ValueError("Required runtime API is invalid")
    capabilities = requires["capabilities"]
    if capabilities != {"documents": 1} or type(capabilities.get("documents")) is not int:
        raise ValueError("Required capabilities are invalid")


def validate_payload(payload: dict) -> None:
    _exact_keys(payload, {"component_id", "sequence", "issued_at", "expires_at", "releases"}, "payload")
    if payload["component_id"] != COMPONENT_ID:
        raise ValueError("Feed component is invalid")
    for name in ("sequence", "issued_at", "expires_at"):
        if isinstance(payload[name], bool) or not isinstance(payload[name], int) or payload[name] < 0:
            raise ValueError(f"Feed {name} is invalid")
    if payload["expires_at"] != payload["issued_at"] + YEAR_SECONDS:
        raise ValueError("Feed expiry must be exactly 365 days after issuance")
    releases = payload["releases"]
    if not isinstance(releases, list) or not 1 <= len(releases) <= MAX_RELEASES:
        raise ValueError("Feed must contain between 1 and 64 releases")
    for release in releases:
        validate_release(release)
    versions = [strict_version(release["version"]) for release in releases]
    if versions != sorted(set(versions)):
        raise ValueError("Feed releases must be unique and strictly ascending")
    if payload["sequence"] != version_sequence(releases[-1]["version"]):
        raise ValueError("Feed sequence must match its newest release")


def _run(command: list[str], *, input_bytes: bytes | None = None) -> bytes:
    result = subprocess.run(command, input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise ValueError("OpenSSL rejected the component release signing key or signature")
    return result.stdout


def parse_envelope_json(raw: bytes) -> dict:
    def reject_duplicate(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("Duplicate JSON fields are invalid")
            value[key] = item
        return value

    try:
        value = json.loads(raw, object_pairs_hook=reject_duplicate)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ValueError("Signed release metadata JSON is invalid") from error
    if not isinstance(value, dict):
        raise ValueError("Signed release metadata envelope is invalid")
    return value


def public_raw_from_private(private_pem: str) -> bytes:
    if not isinstance(private_pem, str) or not private_pem.strip():
        raise ValueError("COMPONENT_RELEASE_SIGNING_KEY is required")
    with tempfile.TemporaryDirectory() as directory:
        key_path = Path(directory) / "component-release-key.pem"
        key_path.write_text(private_pem)
        key_path.chmod(0o600)
        der = _run(["openssl", "pkey", "-in", str(key_path), "-pubout", "-outform", "DER"])
    if len(der) != len(SPKI_PREFIX) + 32 or not der.startswith(SPKI_PREFIX):
        raise ValueError("Component release key must be Ed25519")
    return der[len(SPKI_PREFIX):]


def derived_key_id(public_raw: bytes) -> str:
    return hashlib.sha256(public_raw).hexdigest()[:16]


def sign_payload(payload: dict, private_pem: str, *, expected_public_raw: bytes = PUBLIC_KEY_RAW, key_id: str = KEY_ID) -> dict:
    message = signed_bytes(payload)
    if public_raw_from_private(private_pem) != expected_public_raw or derived_key_id(expected_public_raw) != key_id:
        raise ValueError("Component release signing key does not match the pinned public key")
    with tempfile.TemporaryDirectory() as directory:
        key_path = Path(directory) / "component-release-key.pem"
        message_path = Path(directory) / "component-release-message"
        key_path.write_text(private_pem)
        key_path.chmod(0o600)
        message_path.write_bytes(message)
        signature = _run(["openssl", "pkeyutl", "-sign", "-rawin", "-inkey", str(key_path), "-in", str(message_path)])
    if len(signature) != 64:
        raise ValueError("Ed25519 signature length is invalid")
    return {"schema": SCHEMA, "key_id": key_id, "payload": payload, "signature": base64.b64encode(signature).decode("ascii")}


def verify_envelope(envelope: dict, *, public_raw: bytes = PUBLIC_KEY_RAW, key_id: str = KEY_ID) -> dict:
    _exact_keys(envelope, {"schema", "key_id", "payload", "signature"}, "envelope")
    if type(envelope["schema"]) is not int or envelope["schema"] != SCHEMA or envelope["key_id"] != key_id or derived_key_id(public_raw) != key_id:
        raise ValueError("Component release signing identity is invalid")
    try:
        signature = base64.b64decode(envelope["signature"], validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError("Component release signature encoding is invalid") from error
    if len(signature) != 64:
        raise ValueError("Ed25519 signature length is invalid")
    if base64.b64encode(signature).decode("ascii") != envelope["signature"]:
        raise ValueError("Component release signature encoding is not canonical")
    message = signed_bytes(envelope["payload"])
    with tempfile.TemporaryDirectory() as directory:
        public_path = Path(directory) / "component-release-public.der"
        message_path = Path(directory) / "component-release-message"
        signature_path = Path(directory) / "component-release-signature"
        public_path.write_bytes(SPKI_PREFIX + public_raw)
        message_path.write_bytes(message)
        signature_path.write_bytes(signature)
        _run(["openssl", "pkeyutl", "-verify", "-rawin", "-pubin", "-keyform", "DER", "-inkey", str(public_path), "-in", str(message_path), "-sigfile", str(signature_path)])
    return envelope["payload"]


def envelope_bytes(envelope: dict) -> bytes:
    verify_envelope(envelope)
    return (json.dumps(envelope, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")
