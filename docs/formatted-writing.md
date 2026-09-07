# Formatted Markdown writing

The compact formatting toolbar offers an optional **Formatted writing** toggle.
Plain source remains the initial presentation. Headings, emphasis, quotes,
links and code receive theme-aware styling while Markdown punctuation stays
editable. The reader and Split view still render Markdown separately.

The editor loads its pinned CodeMirror module only when requested. Its dependencies
and license notices are packaged with the verified extension; no CDN or external
editor service is used. A failed module load preserves the current source editor.

The existing Notes session and bounded EditorHistory remain the only document
and Undo owners. CodeMirror's separate history extension is not installed.
Presentation changes, search selection, and remote refresh are not user edits.
Opening a CRLF document does not normalize or save its stored bytes. Actual
text edits use the same LF editor representation as the source textarea.
Organization metadata remains outside the editable body.

Formatting, media insertion, list continuation, task-source selection, heading
navigation, Find, keyboard shortcuts and toolbar Undo share source offsets.
Find decorations map through edits and use the formatted layout, not a textarea
mirror. Read-only transitions block changes while authorized refresh remains
possible. Notes still preserves drafts after failed saves and revision conflicts.

Browser checks cover integrated writing/source/reader transitions, toolbar and
keyboard history, media insertion, native-style beforeinput list continuation,
Chromium composition events, late save failures, conflicts, no-save opening,
on-demand loading, theme changes and narrow layout. A separate fixture checks
large-document viewport bounds and inert HTML/media. These checks do not prove
real Android/iPhone keyboard or screen-reader acceptance; those remain required
for the Notes-only mobile/PWA release.

References: [CodeMirror system guide](https://codemirror.net/docs/guide/) and the
TypeScript declarations and source in the pinned package versions.
