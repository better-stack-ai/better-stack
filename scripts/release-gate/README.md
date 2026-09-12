# Release verification

A release requires all applicable CI and deployments on its exact commit, and an
evidenced disposition for every bot review finding. Pre-existing failures block
publication. Never use skipped checks, canceled deployments, or skip-CI commits as
verification.

The expected workflow/job inventory is `.github/release-gate.json`. All validation
workflows run on PRs and pushes to main. The gate fails for an unclassified or
disabled workflow, missing job, unsuccessful latest run or rerun, unsuccessful
commit check/status, or missing completed Vercel deployment for either consumer.
Registry generation is verified without modifying the tested branch. Run
`pnpm --filter @btst/stack build-registry` and commit any output before final CI.
Vercel consumer configurations require builds instead of reporting ignored
previews as successful checks.

Before merging and publishing, with a full Git checkout and a read-only GitHub
token in `GH_TOKEN`, run:

```sh
node scripts/release-gate/gate.mjs --sha <candidate-sha> --output gate-receipt.json
```

The script reads policy and dispositions from the candidate commit, finds included
PRs since the preceding reachable release tag, adds explicitly required older
PRs, and fetches all pages of review threads, review comments, reviews, and issue
comments. Old/outdated/resolved findings still require review. In
`.github/review-dispositions.json`, key each bot comment or review by its exact
URL, record its `body_sha256`, and provide:

- `disposition: "fixed"`, an ancestor `fix_commit` (full SHA), and `evidence`
  identifying the correction and relevant verification;
- `disposition: "dismissed"` and `evidence` explaining why the finding is wrong;
- `disposition: "informational"` and `evidence` only for notices or summaries with
  no actionable finding. Priority/severity-marked findings cannot use this value.

Provider-generated Vercel deployment notices and Codex review activity tables are
recorded as informational automatically; actual deployments and all individual
reviews/findings are checked separately. A pending bot review table blocks the gate.

Human review must establish that evidence supports each disposition; a resolved
flag or a bot summary is insufficient. Reply to findings on their original thread
and resolve only after the disposition is justified. New/edited bot comments
invalidate their hashes and block the next gate collection.

The release workflow saves an initial receipt before its publishing job, then
collects fresh evidence immediately before each package publish. The current
publication workflow is excluded from its own preconditions; verify its result,
registry versions, dist-tags, integrity, and affected consumers after publication.
Never blindly retry uncertain publication: first reconcile package registry and
workflow effects. Retain receipts externally with the release evidence; do not
commit tokens or runtime receipts.

Run `pnpm test:release-gate` for rejection and pagination regression coverage.
