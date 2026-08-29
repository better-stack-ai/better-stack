# Legacy Next.js scaffold fixtures

These are exact `buildScaffoldPlan()` outputs from the `v3.0.0-rc.2` tag and
the pre-issue-223 `e9ff9448` v3 base. The main fixture cohort uses the memory
adapter, the maintained Blog/AI Chat/CMS/UI Builder/Kanban/Comments/Media/Route
Docs/OpenAPI plugins, the `@/` alias, and `app/globals.css`. The Form Builder
page is generated separately with the Drizzle adapter.

The snapshots were captured from the returned `FileWritePlanItem.content`
without passing through an editor. In particular, the historical
`renderTemplate()` contract is `trimEnd() + "\\n"`, so every fixture ends with
exactly one line-feed byte. The migration test records hashes produced by
executing `buildScaffoldPlan()` at each source ref and checks that newline
contract independently of the runtime allowlist.

`legacy-next-scaffold.ts` allowlists the SHA-256 hashes of these files. Do not
edit a snapshot without intentionally updating the matching hash and migration
regressions. Any consumer customization must fail closed instead of being
deleted by `btst init --yes`.
