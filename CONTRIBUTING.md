# Contributing

Develop against Gitea main on a focused branch. Keep the app native, accessible,
container-responsive, and compatible with both web and desktop Tend. Do not
import Tend host source or storage internals; use the versioned host contract.

Run the checks in README before a coherent push. Add failure tests for changes
to saving, conflicts, recovery, Markdown rendering, and document permissions.
Gitea Actions is the publication gate. Never force-push or publish an unverified
commit or replace an existing release asset. Increment both version fields for
a new release. Keep credentials and deployment-specific configuration out of
the repository and ZIP.
