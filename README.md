# TEND Notes

Free, open source, and yours to keep. Your thoughts, in Markdown. A native, open-source notes extension for Tend.

TEND Notes gives you a quiet place to write quick thoughts, working plans, and
anything worth remembering. Activate it from **Extensions → Official** in Tend,
alongside Sites. It runs inside Tend in the browser and desktop app.

- Full-text searchable notes and notebooks backed by your Documents libraries.
- Markdown editor, formatting shortcuts, focus mode, and a safe reading preview.
- Live Tend theme colors, including dark surfaces and matching accent contrast.
- Quick capture, automatic saving, visible status, and conflict protection.
- Saved notes refresh across online Tend sessions about every three seconds.
- Account- and tab-scoped browser draft recovery.
- Import and export ordinary `.md` and `.markdown` files.
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

## Development

Install Bun 1.4.0 and Python 3.12 or later, then:

```sh
bun install --frozen-lockfile
bun run check
bun test
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
