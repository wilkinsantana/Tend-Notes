# Tend document capability v1

The official package ID is `host.tend.notes`. It declares `documents.read`,
`documents.write`, and `documents.backup` and exports `activate(host)` → `mount(container)` → cleanup.
`host.documents.version` must be `1`; older hosts receive an update message.
The source contract is typed in `src/host.ts`.

The host exposes libraries, bounded note pages, read, create, save, and delete.
Only opaque owner-authorized library and item IDs cross the boundary. The host
resolves paths, providers, server connections, authentication, and credentials.
Every call rechecks that the official reviewed package is enabled and permitted.
A native extension is trusted panel-origin JavaScript, not a security sandbox.

New hosts include `canWrite` on documents returned by read, create, save, and
optional rename. It is the host's current advisory permission hint for that document.
Clients use an explicit value even when it differs from `Library.canCreate`;
older hosts that omit it fall back conservatively to `canCreate`. The library
field means only that exactly one source can accept a new note and is not
per-document edit authority. Mutation endpoints always reauthorize and remain
authoritative.

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

### Portable organization

A leading `<!-- tend-notes {"v":1,"tags":[],"color":"none","pinned":false} -->`
line stores organization in the canonical Markdown file. The UTF-8 header is at
most 4,096 bytes; tags are normalized Unicode letters/numbers and `._/-`, up to
32 characters each and 12 unique tags. Colors are `none`, `sage`, `sky`,
`lavender`, `rose`, and `amber`. Invalid/future headers remain ordinary body text;
unknown v1 keys survive organization edits. Body editing preserves the header.

The host's disposable owner-joined projection exposes tags/color/pinned in note
summaries. `list(libraryId, query, offset, filters)` supports `tag`, `color`,
`pinned`, and `sort` (`recent` or `title`). Its `facets` describe the complete
active notebook, independent of pagination and current filters. Pins sort first.
Files deletion, source relocation, and rescan invalidate derived metadata.

### ZIP exports and connected-drive backups

`host.documents.backups` exposes `state`, `destinations`, `configure`, `start`,
`cancel`, and an authenticated `downloadUrl`. All operations require document
read access; destination discovery/configuration and storage jobs additionally
require `documents.backup`. Job execution rechecks these permissions and current
owner scope, including after transfer and before marking success.

The host owns disk-backed ZIP creation and one active job per owner. Jobs refuse
partial downloads, cap resource use, store archives with owner-only permissions,
and retain local download files for 24 hours. Canonical files are never moved or
deleted. Schedules persist outside extension install storage and remain inactive
without the reviewed enabled extension. Restarted jobs fail visibly rather than
claiming success; schedule claims prevent catch-up bursts.

Connected destinations are opaque, owner-authorized Files source IDs. Local
folders reuse Files' confined upload, while cloud providers use the existing
server-side direct rclone endpoint/config and verify a complete readback hash.
Fresh per-job snapshot paths preserve prior backups. Cancellation interrupts the
job, but data already sent to remote storage may remain. Remote snapshots are
never automatically removed. The feature does not promise two-way cloud sync.

### Native storage setup

Optional `documents.setupLibrary()` and `backups.setupDestination()` open
host-owned dialogs inside the extension panel and return an opaque library or
destination summary, or `null` when cancelled. The underlying editor is inert
while setup is open. Notebook setup requires read/write permissions; backup
setup requires read/backup. Each host operation rechecks access, including
nested provider discovery, folder creation, connection setup, and scanning.

Notebook setup creates a host-managed folder on the positively verified local
Linux host by default. It offers an explicit alternate-server choice with a
storage-loss warning. It never accepts a notebook filesystem path or drive ID.
The fixed preparation worker refuses symlinks, unsafe ownership/permissions, and
unrelated existing contents. Notebook folders use owner-only permissions and
live outside the replaceable panel container. The host atomically registers
encrypted drive metadata and an owner-bound Files library/source. Identical
retries resume the same notebook and reindex its surviving Markdown. Existing
manually connected libraries remain readable/editable.

Managed notebook drives are internal: ordinary drive pickers, retargeting, and
cross-account source attachment cannot repurpose them. This is not an isolation
boundary against host or panel administrators. Unsupported local transports,
including Docker Desktop VM storage, require explicit selection of another
verified Linux server; they never silently redirect storage.

Backup setup separately reuses storage forms and encrypted connections. It
returns an existing destination or connects a new drive inside Notes. A managed
notebook folder cannot serve as its own backup destination. Backup registration
preserves conflicting existing locations and safely resumes identical retries.
Neither setup method starts a backup or changes the schedule. Notes host folders
need their own backup; the panel database/data volume is not a document backup.
Older hosts show an update message if the setup capability is unavailable.

### Optional rename and media capabilities

`rename(id, {name, revision}) -> Document` renames the canonical Markdown file
within its existing directory. The returned path-derived ID may change. It
requires a current revision and refuses an existing target; clients flush and
freeze selected drafts before renaming. A lost response may require reopening
the renamed note from the list; original content is preserved. Notebook names
use `renameLibrary(id, name) -> Library`, which changes owner-scoped metadata
without moving its storage folder. Older hosts surface an update message.

`attachments.upload(noteId, Blob) -> {path, type}` and
`attachments.read(noteId, path) -> Blob` use opaque owner-authorized note IDs.
The host selects the source/server/root, checks the active extension's read or
write permission, and passes bounded input to a fixed local/SSH worker.
Canonical media uses `attachments/<sha256>.<extension>` beside each note.
Directories are 0700 and new files 0600; descriptor traversal refuses symlinks
and special files, publishes without overwriting, and confirms bytes by hash.
Uploads are limited to 20 MB with raster-image/audio signature checks. HTML and
SVG are not accepted. Unreferenced uploads are retained to avoid removing data
shared by other notes or recoverable drafts.

ZIP exports and connected backups include referenced attachments at their
relative paths, deduplicated by content address within a notebook. Every source
reference is authorized and read; missing/corrupt attachments fail the archive.
The existing 500 MB total source and 100 MB archive limits include media.

Optional `attachments.externalImageUrl(httpsUrl)` returns an owner-gated,
host-generated HTML frame URL. It never proxies image bytes through the server.
The frame has an empty sandbox and a dedicated restrictive CSP permitting HTTPS
images only; the panel's image allowlist stays unchanged. YouTube uses only
validated video IDs and the exact youtube-nocookie.com embed origin. Remote
frames are created only after a deliberate click. Source HTML cannot create
trusted media controls, scripts, or frames. Browser object URLs and microphone
tracks are cleaned up on close/unmount. Media insertion captures the current
note/body and cannot apply stale cursor positions to refreshed remote content.

### Panel appearance

Notes follows the host theme tokens and the inherited
`--tend-panel-surface-alpha` percentage for its canvas and sidebar. Tend sets
it to `0%` for transparent windows and `100%` for solid or reduced-transparency
mode. Older hosts default to solid Notes surfaces. Menus, dialogs, controls,
and text retain their own opaque theme colors. Changes apply without remounting
or interrupting the current draft.


### ToDo projection and source identity

The ToDo view uses the existing library/list/read/save contract. Task identity is
an in-memory tuple of opaque document ID, exact revision, and UTF-16 checkbox
source offset. Labels are presentation, never identifiers. Parsing follows the
bundled Markdown lexer's task semantics while preserving original line endings
and organization headers. Changing a task replaces one marker character.

Before writing, the client rereads the note and requires both the same revision
and exact original content. It also honors the latest `canWrite` hint before
attempting save, while the save endpoint remains the final authorization check.
Save still supplies the expected revision for the host's atomic conflict check.
Only an exact whole-document match to intended bytes acknowledges a prior lost
response without another write. A moved, renamed, deleted, or changed source
needs refresh; no fuzzy reconciliation is performed. Source navigation uses the
same snapshot check before selecting the checkbox. The current editor is flushed
and frozen before entering ToDo.

Scanning is sequential, cancellable during reads or worker parsing, and bounded at 10,000
notes and 20 MiB of retained source text. Late scan responses cannot replace a
newer view. Read failures and resource bounds report partial results. The
projection is discarded on close/unmount and refreshed explicitly, not persisted
in extension storage. No new host permission or backend state is required.


### Task parsing worker packaging

Notes packages a separate same-origin ES module worker and its shared chunks.
Every emitted JavaScript asset is included in the extension integrity map and
third-party license inventory. Runtime URLs are relative to the installed
extension entry, so the host's existing self-only script policy is sufficient;
no blob worker, inline script, eval, remote parser, or CSP relaxation is needed.

The worker accepts only extraction and exact checkbox-edit messages, correlated
by request ID. Closing ToDo terminates it and rejects pending work. Worker
failure never triggers synchronous parsing on the main thread; reopening ToDo
creates a fresh worker. Source revisions still belong to the host API, and the
existing expected-revision save is unchanged. Task paging is presentation only:
filters run over the complete loaded collection before selecting a page.
