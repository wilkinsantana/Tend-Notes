# TEND Notes contributor guide

Read README.md and docs/host-contract-v1.md. Preserve existing changes and use
Svelte 5 runes. TEND Notes is an independent MIT-licensed extension: do not copy
host internals or couple it to another product. Use only the versioned document
capability. Keep the interface about Tend and writing notes.

Gitea main is the development and CI authority; GitHub publishes the exact
verified commit and ZIP. Run focused checks, push coherent work, and use Gitea
for the full gate. Never force-push, overwrite immutable releases, or apply a
live Tend update. Never commit secrets, local paths, or infrastructure details.

Before staging security or persistence changes, obtain a read-only Architect
review of the exact diff and tests. Keep source documents separate from
extension installation state. Never discard dirty content after a failed save.
Require typing the note name before deleting it; dialogs close through buttons
or Escape. Test keyboard interaction and narrow panel layouts.
