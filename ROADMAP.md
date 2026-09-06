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
  editing, rich media capture, backlinks, and handwriting/OCR search.

## 0.1.1 — Automatic notebook storage

- Initial setup prepares a protected host folder with one Start writing action.
- No filesystem browsing or drive creation is needed for a notebook.
- Separate backup destinations remain optional and configured inside Notes.
- Existing notebooks are preserved; interrupted setup can safely resume.
