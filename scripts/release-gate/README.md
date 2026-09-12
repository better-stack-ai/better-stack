# Release verification

A release requires all applicable CI and deployments on its exact commit, and an
evidenced disposition for every bot review finding. Pre-existing failures block
publication. Never use skipped checks, canceled deployments, or skip-CI commits as
verification.

The expected workflow/job inventory is `.github/release-gate.json`. All validation
workflows run on PRs and pushes to main. The inventory comes from the candidate Git tree; runs are queried by that exact SHA, so later workflow additions/removals/renames on main do not change historical retries. The gate fails for an unclassified candidate workflow, missing workflow/run/job, unsuccessful latest run or rerun, unsuccessful
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

The script reads policy from the candidate commit, finds included
PRs since the verified publication in the policy's `previous_release` record, adds explicitly required older
PRs, and fetches all pages of review threads, review comments, reviews, and issue
comments. Review findings on the current work; do not expand into unrelated historical
PRs. Old/outdated/resolved findings within that scope still require evidence.

Keep each finding's resolution in its original GitHub reply, with a compact record
after the explanation. For findings outside inline threads, post a PR comment
referencing the original finding URL. This does not require another source commit:

```text
<!-- btst-review-resolution
{"finding_url":"<exact finding URL>","body_sha256":"<SHA256 of the complete finding body>","disposition":"fixed","fix_commit":"<full fixing commit SHA>","evidence":"<correction and relevant verification>"}
-->
```

The record must provide:

- `disposition: "fixed"`, an ancestor `fix_commit` (full SHA), and `evidence`
  identifying the correction and relevant verification;
- `disposition: "dismissed"` and `evidence` explaining why the finding is wrong;

The gate verifies that the reply author currently has repository write or admin
permission through GitHub's repository-permissions endpoint, which requires the
token's implicit metadata read capability. CI exercises that endpoint with its
Actions token. Bot replies and replies from readers cannot authorize a resolution.
Resolution records belong in inline replies or PR issue comments, whose creation
and edit timestamps are available. Review bodies remain finding sources but cannot
supply resolution records because their API does not expose comment edit history.
The newest authorized record for a finding is checked; stale body hashes, missing
fix ancestry, invalid outcomes, or missing evidence block publication. Receipts
retain the record and its GitHub source, author, and verified permission.

Any other bot comment requires a fix or explicit dismissal, even without a priority
or severity marker. Manual informational labels cannot waive an unknown comment.

The baseline must match its tag ancestry, published stable GitHub release,
successful exact-commit publishing run, and npm version, gitHead and integrity.
An unpublished, moved, failed or prerelease tag cannot shorten review history.
Update this record only after reconciling a successful publication.

Provider-generated Vercel deployment notices, Codex review activity tables, and
exact known review boilerplate are
recorded as informational automatically; actual deployments and all individual
reviews/findings are checked separately. A pending bot review table blocks the gate. Every PR introduced after the verified publication baseline must also have a completed Codex Code Review for its final head, resolved from the displayed commit to the full candidate ancestor. A stale summary or an absence of new findings does not prove review completion. Request `@codex review` after the last push and wait for that head to complete. Historical PRs added explicitly to review scope retain their required finding dispositions.

Human review must establish that evidence supports each disposition; a resolved
flag or a bot summary is insufficient. Reply to findings on their original thread
and resolve only after the disposition is justified. New/edited bot comments
invalidate their hashes and block the next gate collection.

Each invocation collects the full evidence twice and requires matching
fingerprints. New findings, edited comments, reruns or deployment changes during
collection reject the receipt. A remote change after the last observation remains
a residual race; publish immediately after verification and monitor the outcome.

The release workflow saves an initial receipt before its publishing job, then
collects fresh evidence immediately before each package publish. Publication checks are identified through their authenticated workflow/run ownership
and excluded from their own preconditions, including reconciled retry attempts; verify their result,
registry versions, dist-tags, integrity, and affected consumers after publication.
Never blindly retry uncertain publication: first reconcile package registry and
workflow effects. Retain receipts externally with the release evidence; do not
commit tokens or runtime receipts.

Run `pnpm test:release-gate` for rejection and pagination regression coverage.
