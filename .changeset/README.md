# Package releases

Use `pnpm changeset` for changes after the initial v6 candidate. Each changeset
names only the packages whose public contract or shipped implementation changed.
Use `pnpm changeset status` to inspect the independent plan before versioning.

The migration applies initial candidate versions directly: core is `6.0.0` and
each extracted plugin starts at `1.0.0`, with an initial changelog entry. Do not
add another bump just to publish those initial versions. The separate rollout
prepares initial publications and trusted publishers. Subsequent publication
selects one reviewed package/version tag through the existing release workflow.
Implementation verification builds and packs candidates without publishing them.

Core compatibility is a peer range, rather than a fixed or linked version group.
An unrelated unchanged plugin does not need a matching release. The CLI exposes
new package versions by updating and verifying its tested installation set.

Configuration and release workflow reference:
https://changesets.dev/guide/config

Scoped channels, exact artifacts and read-only readiness are documented in
`scripts/release-gate/README.md`.
