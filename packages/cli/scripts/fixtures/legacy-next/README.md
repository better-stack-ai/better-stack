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

`legacy-next-render-hashes.ts` records the exact bytes from every supported
plugin-selection and `@/`, `~/`, or `./` import-alias combination at both
historical refs. Regenerate it with `pnpm legacy-next-hashes:generate`; CI runs
the corresponding `legacy-next-hashes:check` verifier against the immutable
historical renderers. Do not normalize those bytes: even a one-character
consumer edit must remain outside the allowlist and fail closed.

The `variants/` files are also direct historical renderer outputs. They cover
conditional plugin selections and non-default aliases without weakening the
fail-closed check for consumer edits.

`legacy-next-scaffold.ts` allowlists the SHA-256 hashes of these files. Do not
edit a snapshot without intentionally updating the matching hash and migration
regressions. Any consumer customization must fail closed instead of being
deleted by `btst init --yes`.
