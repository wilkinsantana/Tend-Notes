# Rich text editor v2: investigation and implementation contract

Status: source investigation complete; replacement editor not implemented.

## Observed problem

The current WritingSurface is CodeMirror with Markdown decorations. richWriting
explicitly skips the selected line when hiding syntax. Its decoration rules
cover heading/emphasis/quote markers, bullets and task checkboxes, but not a
structured table editor. This explains both syntax reappearing while typing and
raw tables. Removing that selected-line condition alone would not provide rich
text cursor, selection, table or clipboard semantics.

## Reference findings

The inspected Joplin checkout contains both the desktop TinyMCE integration
and a ProseMirror editor implementation. These are distinct implementations;
the presence of ProseMirror does not establish which editor a shipped Joplin
version enables by default.

Relevant upstream paths:

- packages/app-desktop/gui/NoteEditor/NoteBody/TinyMCE/TinyMCE.tsx:
  edits rendered content and converts editor HTML back through htmlToMarkdown.
- packages/editor/ProseMirror/createEditor.ts: structured document state,
  rendering/parsing, transactions, history, selection formatting and plugins.
- packages/editor/ProseMirror/schema.ts: paragraphs, marks, lists, tables,
  code, images and custom nodes; original source attributes on blocks.
- packages/editor/ProseMirror/plugins/originalMarkupPlugin.ts: maps original
  source to blocks and regenerates markup where it is no longer preserved.
- packages/editor/ProseMirror/plugins/tablePlugin.ts: cell/table selection,
  contextual add/delete row and column commands and editor focus restoration.
- plugins/detailsPlugin.ts, linkTooltipPlugin.ts, imagePlugin.ts and
  joplinEditablePlugin/: collapsible content, contextual links, images and
  specialized editing of embedded content.

Reference: https://github.com/laurent22/joplin
Upstream Markdown parser/serializer: https://github.com/ProseMirror/prosemirror-markdown
Upstream table commands: https://github.com/ProseMirror/prosemirror-tables
The Markdown repository now points to its maintained upstream at
https://code.haverbeke.berlin/prosemirror/prosemirror-markdown .

Use these as architectural references. The inspected Joplin root identifies
AGPL-3.0-or-later as its default, subject to directory-specific licenses. Keep
TEND Notes MIT: implement our own integration using appropriately licensed
upstream dependencies; do not copy Joplin-specific implementation or branding.

## Recommended Notes implementation

Use a structured ProseMirror editor for the rich writing mode. Keep the existing Markdown textarea
for explicit source editing. The existing mode controls and compact toolbar
remain; focusing rich text must never reveal its Markdown delimiters.

Markdown remains the persisted and exported format. Rich document JSON is only
an editing representation. The existing Documents API, revision checks, recovery
and offline queue remain the only save path.

1. Parse Markdown to supported typed nodes and marks. Preserve the exact
   source of unsupported blocks as protected nodes with an explicit source
   editor. Never silently omit unsupported syntax during conversion.
2. Track original source for unchanged blocks. Merely opening/switching modes
   must not dirty or rewrite a note. Preserve organization/frontmatter, task
   metadata, attachment references, formulas and code fence information.
3. Route rich toolbar actions to document transactions, not insertion of raw
   Markdown at DOM offsets. Map selections deliberately when changing modes,
   searching or jumping from ToDo and outline entries.
4. Establish one Undo owner. Adapt rich transactions to the Notes history
   boundary, or explicitly bridge histories; never install a second independent
   undo stack that races the existing one. Preserve IME composition and batching.
5. Tables remain visibly editable cells. Provide row/column actions, alignment
   and Tab/Shift+Tab navigation. Constrain v1 to Markdown-compatible tables;
   omit merged cells, nested blocks and arbitrary HTML layout.
6. Treat paste/drop as import: sanitize content and protocols; pass uploads
   through the existing attachment capability. Retain click-to-load external
   media and no-execution handling for HTML. Code blocks remain literal text.

## Acceptance gates

- Bold, headings and lists stay formatted while typing, selecting and deleting.
- Edit table cells/rows/columns, undo and save/reopen as portable Markdown.
- Opening and switching modes without edits preserves exact original content.
- Round-trip nested lists, task metadata, tables with escaped pipes, code fences,
  math, links, images, attachment references and unsupported syntax without loss.
- Failed saves, revision conflicts, offline reload and reconnection retain drafts.
- Keyboard and IME composition; undo across mode switches and note switches.
- Paste untrusted HTML without scripts, event handlers or automatic remote fetches.
- Real iPhone/Android selection, virtual keyboard, toolbar, table scrolling and
  focus; large-note responsiveness and independent scroll containers.

Build the parse/serialize preservation fixtures first, then the rich editor
with paragraphs/marks/lists and history, then tables and embedded objects.
Do not replace the shipped mode until those behaviors pass together.

## Additional features worth adapting

Priority after the editor foundation:

- Contextual table controls that appear only while editing a table.
- Link popovers: open, edit and remove without moving the selection unexpectedly.
- Smart paste: clean rich content, paste plain text, and paste tables as Markdown.
- Collapsible sections for long notes; persistence format must be explicit.
- Code blocks with a language picker and copy action.
- Rendered math/media blocks with a focused edit dialog instead of raw source.

These are candidates discovered in the reference, not claims of implemented
Notes features or promises that every Joplin feature ports without adaptation.

## Implementation checkpoint

The structured editor integration uses exact upstream MIT packages for
ProseMirror Markdown and tables. The source checkout remains a reference;
upstream license notices ship with the extension bundle. Rich editing uses the
existing textarea source mode, NoteSession and EditorHistory. There is no second
persistence format or independent undo stack.

Implementation is under validation; the shipped editor is not considered
replaced until the preservation and browser gates above pass. Unsupported
constructs currently remain protected source blocks. Rendered math/media nodes,
smart HTML paste, link popovers and real-device acceptance remain separate gates.

## Reconciled candidate inventory

| Candidate | Existing foundation | Next useful increment |
| --- | --- | --- |
| Backlinks | Document read/list capabilities | On-demand incoming-link scan and guarded navigation; no permanent index |
| Smart views | Search, tags, color, pin and sorting | Named saved queries using those existing filters |
| Web clipping | Quick capture | Explicit pasted URL/selected text capture; browser extension later |
| Attachment search | Images and audio attachments | Extracted text/OCR with resource limits and access controls |
| Reminders | Task checkboxes, ToDo filtering and source navigation | Dates first; timezone, recurrence and notifications afterward |
| Version history | Undo, recovery drafts, Trash and offline preservation | Finish the host history capability rather than duplicate storage |
| Mobile sharing | Standalone PWA | Share-target ingestion with actual Android/iPhone acceptance |

Backlinks use instance-local document IDs. Rename or move may change those IDs;
portable identity and link repair require a host contract before promising
permanent links. Scans are bounded and explicitly report partial results.

Joplin is an architectural reference for search grammar, clipping, OCR, alarms,
revision services and mobile sharing. These are not copied implementations or
claims that each feature maps directly onto a PWA. The inspected backlinks
example is plugin-oriented, not evidence of a native built-in backlinks feature.
