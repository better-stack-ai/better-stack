# CMS scheduled publication evidence

The screenshots and 49.8-second `demo.mp4` show the real CMS editor and backend
running in an isolated Next.js fixture at the ignored
`codegen-projects/cms-publication-proof/` path. The public article page and scheduler
button belong to this temporary host application; they are not shipped CMS pages.
All content is seeded local fixture data. No production data or credentials appear.
Video captions are burned into the frames.

The after screenshots and video used the built CMS from `04977ac8`.
The subsequent `2f8e97a5` change freezes lifecycle hook values and does not change
this visible flow. The final package was rebuilt and its API smoke checks passed
with that fix included. `before-public-leak.png` records the preimplementation
behavior: a future scheduled article appeared in a public content projection.

The article opts in with
`publication: { stateField: "status", scheduledValue: "scheduled", publishedValue: "published" }`.
Public reads request `view: "content"`; the editor uses full reads. The host calls
`stack.trusted.cms.dispatchDueContent({ limit: 20 })` through a local fixture route.
The recorder deletes the preceding article and seeds a fresh one before each take.
All seven captured frames were inspected against their captions.

1. Edit an article with a future schedule and `scheduled` state.
2. Confirm it is excluded from the public content view.
3. Clear its schedule while retaining its state.
4. Reschedule it to a due time.
5. Run the application-owned bounded publication dispatch.
6. Confirm the published article appears publicly.
7. Inspect the publication revision, including `published` state and cleared date.

Local verification used Node 22.18.0:

- `pnpm build`: all 25 package build tasks passed.
- `pnpm --dir docs build`: passed, including the CMS policy type table.
- Two selected `client-sweep.test.tsx` timestamp preservation/clearing tests passed.
- The existing `CMS revisions restore saved fields and publishAt in the editor`
  Playwright test passed against the isolated Next.js fixture.
- Final built-package API checks confirmed public list/detail exclusion, editor
  access, one publication across concurrent dispatch calls, cleared scheduling,
  and the corresponding revision.

Full unit and codegen E2E suites were left to PR CI, as requested.
