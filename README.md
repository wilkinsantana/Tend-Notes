# TEND Notes

Free, open source, and yours to keep. A quiet Markdown workspace inside Tend.

TEND Notes gives you a quiet place to write quick thoughts, working plans, and
anything worth remembering. Activate it from **Extensions → Official** in Tend,
alongside Sites. It runs inside Tend in the browser and desktop app.

- Full-text searchable notes backed by your Documents libraries.
- Portable tags, pinned notes, gentle color labels, and quick sidebar filters.
- Markdown editor, formatting shortcuts, focus mode, and a safe reading preview.
- Live Tend theme colors, including dark surfaces and matching accent contrast.
- Quick capture, automatic saving, visible status, and conflict protection.
- Saved notes refresh across online Tend sessions about every three seconds.
- Account- and tab-scoped browser draft recovery.
- Import and export ordinary `.md` and `.markdown` files.
- Download a notebook or all active notebooks as a standard Markdown ZIP.
- Back up to connected Files storage, including Google Drive and server folders.
- Opt-in hourly, daily, or weekly backups with verified results and visible failures.
- Your documents remain in place when Notes is disabled or removed.

## Start a notebook

Use a Tend version with the document capability v1. In **Files**, create a
**Documents** library and connect one server folder. Select that library in
Notes and choose **New note**. Notes are saved in the folder as Markdown files;
existing indexed Markdown files appear too. Scan the source in Files after
adding files outside Tend.

Version 0.1 supports folders on Linux managed servers, including a server local
to the panel. Cloud-mounted storage is not yet supported for editing. New notes
require exactly one connected server-folder source in the selected library.
Notes are limited to 1 MB of UTF-8 text. Search matches filenames and words inside notes, including typed hashtags. Existing files are indexed in small background batches; a status message reports preparation or interrupted indexing. Rename and
folder organization remain available in Files.

The editor saves after a short pause. If a note changes in another Tend window,
it keeps your draft and offers **Export draft**, **Save as new note**, or
**Reload saved version**. Recovery copies live in this browser, scoped to your
Tend account and tab; they are not a backup or cross-device synchronization.
The saved Markdown file is authoritative. Deleting a note deletes its original
file after explicit confirmation. Keep your normal storage backups.

Preview supports common Markdown, lists, code, and tables. Embedded HTML is
filtered and images are not loaded automatically. Links open only after you
click them. No external writing service, tracking, or AI account is required.

## Organize without a filing chore

Pin notes you use often and add up to twelve short tags per note. Tags such as
`work/ideas` group related topics without moving files. Choose an optional color,
then combine the sidebar's pinned, tag, color, and text filters. Pins stay first;
other notes can sort by recent edits or title. Menus follow the active Tend theme.

Organization travels inside a small, versioned Markdown comment at the start of
each file. Notes hides that line while you write. Ordinary Markdown readers hide
comments too, and the writing remains usable independently of Tend. Unknown or
malformed metadata stays intact as editable text.

## Export and back up

Open **Export & backups** for a ZIP of the current notebook or all active
notebooks. The ZIP contains plain Markdown files grouped by notebook, including
organization information. Duplicate names receive safe suffixes. A failed read
fails the whole export; a partial ZIP is never offered as a finished backup.
Prepared downloads remain available for 24 hours. Extract a ZIP into ordinary
folders to use another Markdown app, or into a Tend Documents source and scan
it in Files to restore your notes.

For another copy, connect a storage folder through Tend's existing Files/Drives
integration. Select it in Notes, then choose **Back up now** or enable an hourly,
daily, or weekly schedule. Google Drive and other configured direct-storage
providers use Tend's existing connection; Notes never receives their credentials.
Backups are dated ZIP snapshots under `TEND Notes backups`. The host verifies
saved bytes before reporting success. Earlier storage snapshots remain until you
remove them, so a later deletion does not erase previous backups.

Automatic backups run while the Tend panel is online and the official Notes
extension remains enabled with read and backup permissions. Disabling Notes stops
its jobs from continuing. Pausing the schedule keeps existing copies. Failed or
interrupted transfers remain visible and may leave an incomplete snapshot at the
destination; start a new backup to retry. Storage backups are one-way snapshots,
not two-way cloud editing or offline mobile sync.

An export is a per-note snapshot of the indexed selection when the job begins.
Scan Files sources to include files added outside Tend. The initial limits are
10,000 notes, 500 MB of Markdown, and a 100 MB ZIP per job; export notebooks
separately above those limits. Local preview data is clearly labeled and does
not connect to real backup destinations.

## Development

Install Bun 1.4.0 and Python 3.12 or later, then:

```sh
bun install --frozen-lockfile
bun run check
bun run test
bun run build
```

`dist/tend-notes-0.1.0.zip` contains the native extension, integrity manifest,
license, and dependency notices. `bun run dev` opens the local demonstration;
its clearly labeled sample notebook is for development only. Use
`bun run test:browser` for interaction and preview-safety checks.

Gitea is the development and Actions authority. Only after checks pass does
Gitea publish the same source commit and verified ZIP to GitHub. GitHub hosts
release downloads consumed by Tend's official extension catalog. Update
installation remains a deliberate user action in Tend.

See [the host contract](docs/host-contract-v1.md), [contributing](CONTRIBUTING.md),
and [the roadmap](ROADMAP.md). Code is available under the [MIT license](LICENSE).
Third-party notices are included in every packaged release.
