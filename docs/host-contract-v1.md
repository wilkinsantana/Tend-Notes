# Tend document capability v1

The official package ID is `host.tend.notes`. It declares `documents.read` and
`documents.write` and exports `activate(host)` → `mount(container)` → cleanup.
`host.documents.version` must be `1`; older hosts receive an update message.
The source contract is typed in `src/host.ts`.

The host exposes libraries, bounded note pages, read, create, save, and delete.
Only opaque owner-authorized library and item IDs cross the boundary. The host
resolves paths, providers, server connections, authentication, and credentials.
Every call rechecks that the official reviewed package is enabled and permitted.
A native extension is trusted panel-origin JavaScript, not a security sandbox.

Canonical documents use the existing Files Documents index and source folders.
Content is UTF-8 Markdown, at most 1 MB. A revision is the SHA-256 of exact file
bytes. Save and delete require that revision; HTTP 409 preserves the draft.
The Linux host worker confines every path component using directory descriptors,
rejects symlinks and special files, locks cooperating Tend writers on the folder,
stages and fsyncs new bytes, and atomically publishes on the same filesystem.
It rechecks observed changes before publication. External programs that ignore
these locks cannot participate in an atomic compare-and-swap guarantee; avoid
simultaneous external writes to an open note. Cloud-mount acknowledgement does
not meet this contract yet and those providers are refused.

Create never replaces differing existing contents. Repeating an identical
create/save after a lost response is safe. A delete failure is shown explicitly.
Read responses are private/no-store and contain text in JSON, never inline HTML.
The extension renders through a dedicated Markdown parser and an HTML allowlist.
No note data belongs in generic extension storage. Disable or uninstall removes
only the extension; canonical documents stay in Files. Browser recovery records
are per-account/per-tab and may outlive uninstall until saved or cleared.

### Search and current-session refresh

`index(libraryId, skipped)` prepares at most two existing Markdown files per
request and returns `{indexed, skipped, more}`. Search is a disposable Files
FTS5 projection, not canonical storage. Filenames and indexed content are
searched as literal words/prefixes, including typed hashtags. Existing-source
indexing reports progress or interrupted work. External file changes first
need the normal Files scan.

Visible Notes instances refresh about every three seconds. A remote revision
may replace only a clean, non-saving editor that still has the same local
session/revision as when the read started. Dirty drafts are never overwritten.
This is online session refresh, not offline mobile sync.
