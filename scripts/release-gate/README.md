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
version. Both package sources are checked before the first publish so a known
mismatch cannot create a partial release. Existing versions are never republished;
prerelease publication retains the `next` channel behavior and checks that
stack’s `latest` remains on a different stable version before publishing. These publication-only
checks do not constrain historical read-only CI/deployment verification. Reconcile
prior effects before retrying an uncertain publication; never overwrite a version.

Registry CI verifies committed output without editing the tested branch. Generate
and commit any required registry output before final CI. Vercel consumer
configurations require actual builds.

Run `pnpm test:release-gate` for CI/deployment rejection and pagination regressions.
