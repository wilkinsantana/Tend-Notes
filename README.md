# TEND Notes

Free, open source, and yours to keep. A quiet Markdown workspace inside Tend.

TEND Notes gives you a quiet place to write quick thoughts, working plans, and
anything worth remembering. Activate it from **Extensions → Official** in Tend,
alongside Sites. It runs inside Tend in the browser and desktop app.

- Full-text searchable notes backed by your Documents libraries.
- Portable tags, pinned notes, gentle color labels, and quick sidebar filters.
- Markdown editor, formatting shortcuts, focus mode, and a safe reading preview.
- Live Tend theme colors and panel transparency, with readable menus and dialogs.
- Quick capture, automatic saving, visible status, and conflict protection.
- Saved notes refresh across online Tend sessions about every three seconds.
- Account- and tab-scoped browser draft recovery.
- Import and export ordinary `.md` and `.markdown` files.
- Download a notebook or all active notebooks as a standard Markdown ZIP.
- Back up to connected Files storage, including Google Drive and server folders.
- Opt-in hourly, daily, or weekly backups with verified results and visible failures.
- Your documents remain in place when Notes is disabled or removed.

## Start a notebook

Use an updated Tend version with document capability v1. Activate Notes in
**Extensions**, open it, and choose **Set up your notebook → Start writing**.
Tend automatically creates a protected, durable folder on its Linux server.
There is no drive to connect or system folder to browse. **Add notebook** creates
another managed notebook; existing connected notebooks remain available.

**Use a different server** is optional. Notes warns that removing or replacing
that server, or deleting its storage, can lose your notes. Set up a separate
backup destination after creating the notebook. Notes survive normal Tend updates
and removing the extension. A backup of the panel's own data volume alone does
not include these host folders; use Notes backups for your documents.

Managed setup supports Linux hosts with Tend's host access and connected Linux
servers with verified SSH identities. Docker Desktop's internal VM is not a
supported notebook destination. If local host access is unavailable, setup asks
you to choose a connected Linux server; it never silently chooses another server.
Folder permissions restrict ordinary system users; host and panel administrators
still control the server. Existing Markdown libraries continue to work.

Cloud-mounted storage is not yet supported for editing. New notes require exactly
one connected server-folder source in the selected library. Notes are limited to
1 MB of UTF-8 text. Search matches filenames and words inside notes, including
typed hashtags. Existing files are indexed in small background batches; a status
message reports preparation or interrupted indexing. Rename notes and notebooks
directly in Notes; existing folder organization remains available in Files.

The editor saves after a short pause. If a note changes in another Tend window,
it keeps your draft and offers **Export draft**, **Save as new note**, or
**Reload saved version**. Recovery copies live in this browser, scoped to your
Tend account and tab; they are not a backup or cross-device synchronization.
The saved Markdown file is authoritative. Deleting a note deletes its original
file after a confirmation showing its title, with Cancel and Delete buttons. No title typing is required. Keep your normal storage backups.

Preview supports common Markdown, lists, code, and tables. Embedded HTML is
displayed safely; external images load only after a click. Links open only after you
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

For another copy, open **Export & backups → Add backup destination** inside
Notes. If no drive is connected, use **Connect a new drive** first. Choose a connected folder or **Connect a new drive**, complete the
provider's existing Tend form, and choose **Use this destination**. The selected
folder appears immediately. Choose **Back up now** or enable an hourly, daily,
or weekly schedule. Google Drive and other providers reuse Tend's storage
connections; credentials remain in the native host form and never reach the
extension. Setup stays in Notes and does not enable backups automatically.
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

`dist/tend-notes-0.2.2.zip` contains the native extension, integrity manifest,
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

### Writing tools and attachments

New note, Quick capture, and Add notebook sit together above the note list.
Hover or focus each icon for its name. Each note has pin, color, rename, and
delete actions beside its date; these work without opening the note. Rename a
notebook beside its selector, or click the open note's title to rename it.

The two-row editor offers headings, emphasis, lists, checklists, quotes, links,
inline/fenced code, tables, dividers, images, YouTube videos, and audio. Preview
renders Markdown; Split shows source and output together and toggles back to
editing when clicked again. On narrow panels, Split stacks the two panes.

Enter continues numbered lists, bullets, checklists, block quotes, and code
indentation. New checklist items start unchecked. Press Enter on an empty item
to remove its marker and finish the list, or Shift+Enter for a plain newline.
Fenced code stays literal, and normal Tab navigation remains available.

Upload PNG, JPEG, GIF, WebP, MP3, M4A, WAV, Ogg, or WebM files up to 20 MB.
Audio can also be recorded in a supported HTTPS browser, up to five minutes.
The microphone stops on Stop or dialog close; listen before choosing Use
recording. Files are stored beside the Markdown, with portable relative links.
External image links and YouTube videos load only on request.

Export Markdown downloads the text file. **Export & backups** prepares a ZIP
containing your notes and their uploaded attachments, with relative links intact.
Connected-drive and automatic backups use the same complete archive. Linked
external media remains a link and needs its original service to stay available.
