# Package releases

Use `pnpm changeset` for changes after the initial stable v6 release. Each changeset
names only the packages whose public contract or shipped implementation changed.
Use `pnpm changeset status` to inspect the independent plan before versioning.

The migration applies initial stable versions directly: core and CLI are `6.0.0` and
plugins and standalone Components are `1.0.0`. Their published
beta versions and changelog entries remain in the history. The initial changeset
stays empty; do not add another bump just to publish these stable versions.
Subsequent publication selects one reviewed package/version tag through the existing release workflow.
Implementation verification builds and packs candidates without publishing them.

Core compatibility is a peer range, rather than a fixed or linked version group.
An unrelated unchanged plugin does not need a matching release. The CLI exposes
new package versions by updating and verifying its tested installation set.

Configuration and release workflow reference:
https://changesets.dev/guide/config

Scoped channels, exact artifacts and read-only readiness are documented in
`scripts/release-gate/README.md`.
