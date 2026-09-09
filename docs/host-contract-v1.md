# Tend document capability v1

The official package ID is `host.tend.notes`. It declares `documents.read`,
`documents.write`, and `documents.backup` and exports `activate(host)` → `mount(container)` → cleanup.
`host.documents.version` must be `1`; older hosts receive an update message.
The source contract is typed in `src/host.ts`.

## Optional shared-note capability

`documents.sharing.version === 1` adds owner link creation, listing, revocation,
joining the shared editor, recovery downloads and stopping sharing. Listing
includes optional `recoveryDocuments` for recent sessions; `recovery(id, documentId?)`
can retrieve an exact older incarnation after sharing stops. `currentContent` is
the canonical copy captured at recovery, not a later private edit. QR codes
are generated locally through the optional `qr` method. Invitations contain
secrets in fragments, never API query parameters. Passcodes are not embedded
in links, QR codes or email drafts.

The package also exports asynchronous `mountShared(host, container)`, returning an async
`unmount()` cleanup. This separate guest presentation uses only the version-one
interface in `src/sharedHost.ts`: snapshots, exact before/after text changes,
local undo/redo, composition fences, mapped selections, presence and scoped
attachment upload/read. It does not receive library enumeration, panel APIs,
backup configuration or a panel account.

The host owns Yjs synchronization and all authorization. Rich and source
presentation never turn a remote snapshot into a local save. The host supplies
mapped cursor offsets after applying remote changes; keyboard and toolbar undo
both invoke its selective history. Rejected local changes remain downloadable.
Sharing is online-first: guest reload/offline persistence is not promised.
While sharing is active, owners use the shared editor rather than ordinary
full-document saves or offline replay. Stopping sharing is an explicit owner
action; uncertain writes require recovery before private editing resumes.

PDFs use ordinary canonical Markdown attachment links and explicit download
cards. Image/audio/PDF uploads retain the host's 20 MB individual limit. Shared
uploads additionally have a per-incarnation 200 MB / 64-upload budget. A guest
cannot reference arbitrary files from the rest of the notebook.

## Private document capability

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

The `template` tag identifies user-defined reusable notes. Notes discovers one
metadata page at a time through the existing tag filter, then reads the chosen
canonical document before preparing a copy. Designation changes are ordinary
revision-checked NoteSession saves. Removing the designation never deletes the
document. A new copy clears `template` and `pinned`, preserves other portable
metadata, and enters ToDo normally; designated source templates are excluded
from task extraction. There is no new host storage or capability version.
Relative uploaded media cannot yet be copied through this flow; Notes refuses
such copies visibly until attachment copying can preserve their contents.

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

### Recoverable Trash (optional v1 capability)

`documents.trash?.version === 1` advertises recovery. `move({documentId,
revision,operationId})` retains canonical Markdown on the original server.
`list(cursor?)` returns owner-bound `TrashItem` summaries and `nextCursor`.
`restore(id,{generation,operationId,name?})` restores to the original folder,
optionally under another Markdown basename, without replacing an existing file.
`purge(id,{generation,operationId,confirmed:true})` permanently removes retained
Markdown after ordinary explicit confirmation. No name typing is required.

Every mutation uses a fresh UUID v4 and returns a `TrashOperation` with the
same `operationId`, action, opaque `trashId`, and state `pending`, `confirmed`,
or `failed`. Pending is HTTP 202, not proof of failure or success. Preserve the
exact request for a transport retry; do not generate a second operation ID.
`status(operationId)` observes a durable receipt; `retry(operationId)` resumes
an already admitted operation. If the initial request may never have arrived,
replay its original mutation and full input instead. A 404 status alone does
not authorize deleting another object or silently falling back to permanent
deletion. The old `documents.delete` remains only for hosts that omit Trash;
clients must reject unsupported advertised Trash versions.

Items expose their notebook label, original name, size, deletion time, generation,
and `activeOperationId` while unresolved. Recovery payloads, paths, credentials,
and filesystem identities never cross the browser contract. An operation that
encounters a changed original preserves that original and retains a separately
recoverable earlier version when a verified copy exists. Newer browser drafts
remain recoverable after an uncertain deletion is reconciled.

Trash stays on the original server until explicitly purged, with a limit of
1,000 retained or unresolved items per owner. It is not included in current
Markdown ZIP exports or Notes backups. Attachments remain in the original
folder; restoring there preserves relative references. Source/archive disabling
preserves Trash; restore requires reactivation. Removing or repointing storage
with retained or pending recovery is blocked until recovery is resolved. Server
disk loss is outside this retention guarantee; no secure-erasure claim is made.

## Optional local header action

An active Notes mount advertises `data-notes-header-action="1"` on its own
container. A same-page host header may dispatch `tend-notes:new-note` directly
on that container to open the normal creation dialog. The listener is removed
on unmount. This is a UI action only; document creation still uses the existing
authorized Documents capability. Older packages simply lack this affordance.

## Optional device speech capability

`host.speech` is optional and versioned independently (`version: 1`). Older
hosts omit it and Notes keeps ordinary writing available. The host supplies a
fixed, reviewed local runtime and model catalog; the extension cannot supply
worker URLs, model URLs, executable code, or a general network request.

- `status()` returns `{ installed, bytes }` for the device's dictation assets.
- `install(onProgress, signal?)` explicitly downloads the fixed catalog;
  progress receives downloaded and total bytes. Cancellation must not report a
  partial installation as ready.
- `remove()` deletes speech assets only, refusing while speech is busy. It
  never touches notes, drafts, pending synchronization, or recovery copies.
- `start({ onPartial, onFinal, onError, signal? })` requires installed assets and returns
  `{ stop, cancel }`. Partial text replaces the current interim segment;
  final callbacks contain each newly completed segment exactly once. The
  optional abort signal also cancels startup before the session handle exists.
- `stop()` drains and finalizes capture; `cancel()` immediately stops capture
  and suppresses late callbacks. `dispose()` cancels work on host unmount.

Microphone capture requires explicit user action and browser permission.
Notes keeps transcripts outside the document until an explicit insertion
through its normal edit and undo path. Target note identity, write authority,
content and selection must still match; refusal preserves the transcript.
Local inference does not change ordinary server saving or synchronization.
Model storage is shared public device data, separate from account-scoped note
storage, and can be evicted by the browser. Runtime and model availability must
both be verified before claiming offline support.

### Optional read-aloud

`host.speech.tts` is independently optional. `getInstallState()` returns model
readiness, installed/total bytes, installed voice IDs and the default voice.
`listVoices()` returns a fixed catalog with display names, locales and download
sizes. `installModel(options?)` and `installVoice(id, options?)` accept an abort
signal and byte progress; their corresponding removal methods touch speech
assets only. `setDefaultVoice(id)` sets a device preference.

`synthesize({text, voice?, speed?, signal?, onProgress?, onChunk})` processes a
bounded text snapshot. `previewVoice(id, options)` uses a fixed preview phrase.
Each audio chunk carries `{index, pcm, sampleRate:24000, sampleCount}`; `pcm` is
transferred Float32 PCM, not a remotely hosted audio URL. The host waits for the
promise returned by `onChunk` before producing another chunk. Notes acknowledges each chunk after scheduling it into a bounded playback
queue (current plus next chunk, with at most one producer waiting for room).
Synthesis can run during playback; the caller drains queued audio before
completion. Pausing freezes the audio timeline and stops further queue growth.
`cancel()` and `dispose()` release synthesis; Notes separately stops its audio
context. Microphone capture and read-aloud are mutually exclusive in the UI.

This interface is not proof that a host has shipped every runtime or voice.
Absent capabilities remain hidden, and unavailable downloads must fail visibly
without a cloud speech fallback.

Speech entry points stay visible when a capability is available but its assets
are not installed: the dictation icon opens dictation setup and the speaker
opens read-aloud setup. Dictation is shown only while editing a writable note.
Read-aloud remains available in view mode and does not require write access.

Notes may retain completed read-aloud paragraphs in memory (at most 24 MiB
combined), keyed by exact spoken text, voice and speed. Hosts advertising
`tts.supportsSegments` accept `segments` on synthesis and label returned chunks
with `segmentIndex`; all missing paragraphs share one worker/model load. Older
hosts retain whole-reading replay. Notes clears audio on note changes, speech
settings, flush and unmount; removed paragraphs are dropped on the next reading.
Partial, failed and oversized paragraphs are not cached. No synthesized audio
is written to persistent storage.
