# TEND Notes roadmap

## 0.1 — Native Markdown notebooks

- Native extension, official catalog activation, MIT source distribution.
- Documents library integration over host document API v1.
- Managed notebook setup on the Tend Linux server, with an optional alternate
  server and storage-loss warning. Separate in-panel backup drive connection.
- Quick capture, focus mode, safe preview, full-text search, import/export, explicit deletion.
- Live refresh across online Tend browser and desktop sessions.
- Confirmed autosave, revision conflicts, browser recovery copies.
- Gitea validation and immutable GitHub release publication.

## Later

- Durable revision history and recovery beyond one browser.
- Richer cross-notebook organization controls.
- Verified cloud-provider editing adapters.
- Full-text search across notebooks and optional attachments.

Published availability depends on the matching Tend host capability and its
manually installed update. These later items are not features of version 0.1.

## Product direction

Keep capture fast and the default interface quiet. Core notes remain free under
the MIT license, with open Markdown export and no note-count paywall.

The future mobile Notes client will connect to the user's Tend panel through a
versioned, account-authorized sync API. Before claiming offline sync, add durable
client operation IDs, a local outbox, revision cursors, deletion tombstones,
conflict preservation, device revocation, and reconnect tests. The current
three-second online refresh is not an offline sync engine.

Later knowledge features: nested tags and folders, internal links/backlinks,
block references, PDFs and images, web clippings, audio recordings/transcripts,
and handwriting/OCR search. Attachments must reuse authorized Files libraries;
no hidden third-party upload service.

User research input: [productivity community discussion](https://www.reddit.com/r/productivity/comments/1cpmdme/which_note_taking_app_you_use_and_why_what_you/).
Treat those anecdotes as product input; validate capture latency, findability,
and sync reliability in real workflows rather than assuming universal needs.

## Initial organization and ownership delivery

- Complete: portable tags, pins and note colors, theme-aware menus, full-library
  filters and sort controls.
- Complete: notebook/all-notebook Markdown ZIP export with owner scope, bounded
  jobs, visible errors, and preservation of portable organization.
- Complete: connected-storage snapshots and opt-in hourly/daily/weekly backup
  scheduling through Tend Files connections; local byte verification and cloud
  readback verification gates.
- Still planned: offline mobile sync and conflict resolution, two-way cloud
  editing, backlinks, and handwriting/OCR search. Image/audio attachment capture
  and microphone recording are available in the current editor.

## 0.1.1 — Automatic notebook storage

- Initial setup prepares a protected host folder with one Start writing action.
- No filesystem browsing or drive creation is needed for a notebook.
- Separate backup destinations remain optional and configured inside Notes.
- Existing notebooks are preserved; interrupted setup can safely resume.

## Approved next milestones

The following product direction is approved. Unchecked items are planned or in
development; they are not claims of published availability.

- [x] **Capture or continue** (implemented in 0.3.0): returning-user start,
  immediate blank capture, optional first-line title suggestion, and focus at
  narrow and wide sizes. Uses the existing revision-safe document contract.
- [ ] **Recovery and writing:** recoverable Trash and version history with
  visible retention; live formatted writing with source mode, reliable Undo,
  composition input, and accessibility.
- [ ] **Notes everywhere:** a Notes-only PWA, direct launch, QR/link onboarding
  and existing Tend account sign-in. The host owns shared entry and constrained
  device sessions; Notes owns its local cache, outbox, and conflict experience.
  Prove offline restart/reconnect, deletion reconciliation, quota failures,
  account switching/revocation, and real Android/iPhone installation.
- [ ] **Find and connect:** search snippets and filters, quick switcher, internal
  note links, backlinks, and a long-note outline.
- [x] **Built-in templates** (implemented in 0.3.0): grocery and packing lists,
  meeting notes, daily plans, project plans, and a blank checklist. Rendered
  previews lead to ordinary Markdown copies with distinct suggested names.
- [ ] **Today and personal templates:** daily-note entry and saving user-defined
  templates without erasing earlier notes or history.
- [ ] **ToDo within Notes:** collect the same Markdown checkboxes across notes
  and notebooks. Open each item's source context; checking it in either view
  updates that same item with revision/conflict protection. Define stable item
  identity before cross-note editing. Optional dates, reminders, and recurrence
  require explicit portable semantics; prose does not schedule notifications.
- [ ] **Bring and reuse information:** previewed Markdown/ZIP imports including
  attachments, optional PDF/OCR/audio search, selected-note read-only sharing,
  and deliberate Sites publication through reviewed host contracts.

### Notes and ToDo are one workspace

Notes, checklists, and tasks belong together. The ToDo view is derived from
canonical notes; there is no second task copy or independent task product to
keep synchronized. Grocery templates can group checkboxes under Produce,
Pantry, Refrigerated, and Household with editable quantities and comfortable
touch targets. Packing, daily planning, and meeting action items use the same
plain Markdown foundations. Reusing a template makes a fresh copy; a future
reset-in-place action must be explicit and recoverable.

Host/component contracts must remain versioned and separately reviewed. Shared
PWA presentation is not permission isolation. Offline correctness depends on
reviewed recovery/deletion semantics; no generic service worker may cache panel
administration responses. The current online refresh remains distinct from
offline sync. Each milestone needs independent release evidence and a manual
Tend extension update before it is available to installed users.

## 0.3.0 — Capture, continue, and useful templates

- Returning notebooks offer Continue writing and immediate quick capture.
- Quick capture can suggest its first line through the existing safe rename.
- Six built-in templates open with rendered previews and create ordinary notes.
- Cancel preserves the current note; a failed draft save prevents template
  creation. Existing differing files cannot be overwritten by template copies.
- Keyboard focus, narrow panels, read-only notebooks, theme tokens, and panel
  transparency are covered by interaction tests.

Installation remains manual after the verified release reaches the official
Tend catalog. ToDo across notes, personal templates, Trash/history, and offline
PWA synchronization remain separate approved milestones.
