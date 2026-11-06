# Release verification

Before merging or publishing, the agent responsible for the PR must inspect the
code-review comments as well as CI results. Read inline comments, reviews and PR
comments, including findings on outdated diffs. Fix valid findings and reply with
the correction and verification; explain with evidence when a finding is wrong.
Resolve threads only after addressing them. Wait for review of the final head,
and check again for late comments before merging or publishing.

This is an instruction for agents babysitting the current PR. It does not require
a repository dispositions file, structured reply syntax or a list of historical
PRs. Keep ordinary replies on GitHub and retain verification notes with the task.

All applicable CI and deployments must pass on the exact candidate commit.
Pre-existing failures, skipped checks and canceled or ignored deployments block
publication. The automated gate verifies these CI and deployment requirements;
its success does not establish that an agent has checked the review comments.

With a full checkout and a read-only GitHub token in `GH_TOKEN`, run:

```sh
node scripts/release-gate/gate.mjs --sha <candidate-sha> --output gate-receipt.json
```

`.github/release-gate.json` lists expected workflows, jobs and deployment projects.
Workflow inventory comes from the candidate Git tree and runs are queried by the
exact SHA, so later changes on main do not affect historical retries. Missing or
unclassified workflows, unsuccessful latest runs or jobs, non-green commit checks
or statuses, and incomplete Vercel deployments reject the gate.

Packed-consumer CI builds and packs the candidate once, then runs every fixture
with both npm and pnpm across eight jobs. Each fixture keeps its own measurement
or failure report; a failed fixture fails its job after the remaining fixtures
finish. The inventory test checks that the matrix and gate require every shard.

Bundle Size always completes its measurement and report jobs. PRs changing only
known documentation, instruction, or example-app paths report unchanged bundle
inputs without installing dependencies or building packages. Package files
(including package READMEs), dependencies, build/measurement tooling, workflows,
and unknown paths still require measurements. Detection compares the merge-base
with the exact candidate and includes deletions and both sides of renames.

Pushes to main seed baseline measurements for later PRs. Baseline caches use the
exact source SHA, Node version, platform, and measurement-tool/dependency inputs;
restored archive identities must match that SHA. Missing baselines are rebuilt.
Turbo task caches are separate, reusable build results whose hashes include
shared UI source and build configuration. Skipped or failed jobs remain blocking.

Each invocation collects evidence twice and requires matching results. Refresh
it after a new commit or rerun, and immediately before merging or publishing.
The release workflow saves an initial receipt and repeats verification before
each npm publication. Publication jobs are excluded from their own preconditions
using their authenticated workflow ownership. Verify workflow completion and
registry versions, dist-tags, gitHead and integrity after publication.

Before publishing each new stable package, the gate reads that package’s current
stable npm source commit, verifies its package identity in this repository and
requires it to be an ancestor of the candidate. This safeguard uses no stored
release baseline. Already-published versions must match the exact candidate source commit to count
as reconciled retries, and the requested npm dist-tag must already select that
version and integrity. A missing or different tag blocks preflight; it is not
silently promoted or retagged. A version from another commit requires a new package
version. The workflow selects one explicit package/version per release. Existing
versions are never republished; prereleases use `next` and retain the selected
package's previous stable `latest`. Owners without a stable release may publish
their first beta to `next`; existing prerelease-only history must have matching
committed source and be included in the candidate. A missing `latest` tag does
not exempt a package with stable versions from stable-channel verification.
The first stable version of a prerelease-only owner may replace an absent or
prerelease `latest` only after verifying every published prerelease's committed
package identity and source ancestry. Empty history, existing stable history and
a `latest` that differs from its registry version block that initial promotion.
The documented npm `0.0.0-stage` provisioning placeholder is excluded from source
history only after verifying its registry archive SHA512, exact inert manifest
and README, and two-file contents under bounded inspection. Its proof is retained
in the gate receipt. A placeholder alone never qualifies an owner for its first
stable release; every real beta still requires committed source and ancestry.
A placeholder `latest` must match the verified registry record. See
[npm staged publishing](https://docs.npmjs.com/staged-publishing/).
These publication-only
checks do not constrain historical read-only CI/deployment verification. Reconcile
prior effects before retrying an uncertain publication; never overwrite a version.

Registry CI verifies committed output without editing the tested branch. Generate
and commit any required registry output before final CI. Vercel consumer
configurations require actual builds.

Run `pnpm test:release-gate` for CI/deployment rejection and pagination regressions.

## Independent package releases

Use `pnpm changeset` to describe affected packages, inspect
`pnpm changeset status`, then run `pnpm changeset version` and review the versions,
dependency ranges and changelogs before committing. Owners keep independent
version lines. CLI 6.0.0 introduces the tested Core v6/plugin installation set;
future plugin releases do not automatically change unrelated Core or CLI versions.

Create a package-specific Git tag on the exact tested commit, such as
`@btst/plugin-blog@1.0.1` or `@btst/plugin-blog@1.1.0-next.0`, and create its GitHub
release. Manual retries select the same tag as workflow ref and input. The legacy
`v6.0.0` spelling selects Core only. Private/unknown owners, mismatched versions,
tag commits and dirty tracked source are rejected. Publication effects serialize
and refresh all gate evidence immediately before the selected effect.

For a coordinated cohort, dispatch the same workflow with `release_tag` as the
first canonical Core tag and `release_tags` as an explicit JSON array containing
every public owner's canonical tag in dependency order, with CLI last. Select
that same first tag as the workflow ref. Every tag must identify the exact same
clean candidate, and all selected channels must agree. This mode builds and
typechecks once, packs and seals every archive before publishing, then runs the
existing fresh CI/deployment/ancestry gate and registry verification separately
for each owner. Publication remains serial and stops on the first failure. Retry
the same inputs to reconcile already-published versions without replacing them.
Single-package releases keep their existing behavior.

Cohort provenance identifies the primary Core tag and the single owned workflow
run for every package. Each package's canonical tag and packed `gitHead` identify
that same source. The `release-cohort-publication` artifact retains per-owner
metadata, archive seals, publication gates and registry receipts, including partial
progress after a failure. The initial source gate is retained separately.

The selected version controls its channel: stable versions use `latest` and
prereleases use `next`; GitHub prerelease metadata must agree. Another owner's
version or Changesets prerelease state never changes that selection. Changesets
3.0.3 prerelease mode is workspace state: use an isolated release branch with only
approved changesets and inspect the real affected plan. Related dependents can
require compatible prerelease ranges; unrelated versions remain unchanged. Avoid
unconditional `changeset publish` for the initial cohort, since that command
selects every unpublished public workspace version.

`scripts/pack-candidate.mjs` is the shared packing seam for consumers, companion
preparation and releases. It uses pnpm to normalize workspace/catalog ranges and
records the owning repository's exact Git commit in the packed manifest. Original
manifest bytes are restored after successful or failed packing. Final checks use
the exact SHA and test those artifacts; tarballs are not rewritten afterward.
The workflow uses pinned npm trusted publishing. Post-publication verification
requires the selected version/tag, source SHA and actual archive integrity, while
prereleases retain their own stable channel.

An already-published retry pins the original integrity recorded by the refreshed
gate's matching version and dist-tag observations. A fresh repack can have a
different integrity for the same source; it is not republished or substituted for
that original receipt. New publications continue to verify the exact freshly
packed archive. Final registry checks retain the selected source/version/tag and
prerelease stable-channel requirements in both cases.

## Initial rollout and read-only readiness

The stable candidate versions are Core and CLI 6.0.0, plugins and Components
1.0.0, with the separate compatible Better Auth UI 3.0.3 companion. Published
Core/CLI 6.0.0-beta.0, plugin/Components 1.0.0-beta.0 and companion 3.0.3-beta.0
remain in their source and registry history. The initial changeset stays empty to
avoid an extra version bump. Stable publication verifies the beta ancestry and
requires each new owner's trusted publisher to be configured for the release workflow.

After candidate CI/deployments pass, inspect a new owner without an npm effect:

```sh
node scripts/release-gate/gate.mjs --sha <candidate-sha> \
  --publishing @btst/plugin-blog --dist-tag latest --readiness \
  --output readiness.json
```

For stable publication, missing packages report `unprovisioned` and
`publication_ready: false`. An explicit prerelease candidate on `next` may pass
initial-beta readiness without prior registry history; this verifies source and
channel eligibility, not npm authentication or trusted-publisher configuration.
Registry errors remain failures. Readiness does not perform publication or exempt
existing names from source verification. Publish each tested real initial beta
artifact with exact source metadata in the separate rollout, then configure its
trusted publisher. If npm creates an initial `latest` tag, verification permits
only that exact first beta; subsequent betas preserve any existing tag and every
stable channel remains protected. Only the archive-verified npm provisioning
placeholder described above is exempt from source ancestry. Arbitrary bootstrap
stubs without matching committed manifests/source do not pass ancestry checks.
Publish Core and required package dependencies before their consumers. Expose the
CLI's exact package/adapter/companion cohort before publishing the CLI. Optional
standalone Components remains independent.

Verification commands do not provision names, configure trust or perform first
publication. Tests use real Changesets plans and archives, plus injected read-only
registry/GitHub responses for rejection behavior.

`bundle-size.mjs measure-workspace` reports actual archive bytes separately from
module estimates. Archives exclude installed dependencies; module estimates use
Node-oriented resolution and overlapping exports. Packed-consumer reports record
production browser resolution and initial/deferred assets. Moved paths and smaller
archives do not establish application savings or build-speed improvements.
