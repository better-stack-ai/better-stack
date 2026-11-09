# Existing-app upgrade verification (#419)

Verified on 2026-11-08 against Bio Mogging commit
`dcfb7a7835ef80dcf5128da04942b21a6bf4d2d8` (Next.js 16, Prisma 7.7,
Core 6.2.1, Blog 1.1.1, CMS 1.2.0, Search 1.0.0).
The application retains custom `BlogCompound` / `BlogCompoundAssessment` models,
indexes, and application-owned authorization. No consumer source changes were made.

## Database and build

Used the application's guarded E2E environment: a fresh loopback PostgreSQL 17
database named `bio_mogging_e2e`, dummy service credentials, and synthetic content.
Production and shared preview databases were not accessed.

- `pnpm install --frozen-lockfile`: passed.
- `pnpm test:e2e:prepare`: applied eight committed migrations, including
  `20261108023000_btst_6_revisions`, then seeded fixtures.
- `pnpm test:e2e:build`: passed production static generation against that database.
- `pnpm typecheck`: passed.
- `prisma validate` through the E2E environment wrapper: the preserved application
  schema passed, including its custom models and indexes.
- Generated a candidate with `@btst/cli@3.0.1 generate --config=lib/stack.ts
  --orm=prisma --output=<scratch-file>` through the same wrapper. The candidate
  omitted application-owned association models and reproduced the duplicate
  `@relation` attribute on `ContentRelation.contentitem`. Prisma validation
  rejected it. This confirms the need for the documented merge/validation step;
  it does not claim the generator issue is fixed.

Also exercised a populated upgrade on a second disposable database: applied
the first seven migrations using a temporary Prisma migration directory, inserted
an existing published Blog article, CMS compound/type, `blogCompound` association,
and `blogCompoundAssessment`, then applied the eighth revision/editorial migration
with the application's normal `prisma migrate deploy`. Before/after JSON snapshots
matched for all original record fields, custom associations/assessments, and
existing Post/custom-table indexes. The existing post's revision/editorial defaults were
`0 / false / 0 / draft`; both revision tables started empty. Temporary configuration
files were removed. This supplements the fresh-database build and browser checks.

To isolate the reported build prerequisite, temporarily renamed only
`editorialActivation` in the disposable database, then called the public
`getAllPosts(adapter, { published: true })` getter. It rejected with Prisma
`P2021`. Restoring the table in `finally` made the same read return published
fixtures. The post count was unchanged. This was a read-level reproduction;
the successful production build used the complete migrated schema.

## Existing consumer regressions

```bash
pnpm test:e2e --project=desktop tests/e2e/unified-search.spec.ts tests/e2e/native-cms.spec.ts tests/e2e/content-regressions.spec.ts
pnpm test:e2e --project=isr-cache --no-deps
pnpm exec tsx --test scripts/reliability/blog-refresh.test.ts
```

- 27 desktop Chromium checks passed: public Search, aliases, draft/private-source
  exclusion, CMS admin denial, server-rendered query propagation, local dialog
  state, retry, malformed responses, raw Blog HTML, and delayed hydration.
- The CMS check reads all 105 related references over multiple pages, deduplicates
  a repeated relationship, and checks trusted slug lookup and content projection.
- The production-cache regression passed: authorized CMS/Blog mutations refresh
  affected output while unrelated cached routes retain hits.
- All 10 publisher regressions passed, including strict snapshot preservation,
  stale/concurrent write rejection, revalidation recovery, and refusal to bypass
  editorial protection.
- The new CMS pagination and publisher snapshot code fences were compiled in the
  existing application's TypeScript project. Both passed; temporary files were
  removed afterward. CMS payloads remain `unknown` until application validation.

Bio Mogging uses an application-owned Search presentation. Its dialog tests
verify the local-state contract, not the exact native scoped-provider example.
The upstream Search regressions cover the native implementation. No real email,
model billing, Blob uploads, production publishing, or hosted preview migration
was exercised by these consumer checks.

## Upstream checks

A clean checkout with the changed documentation was used because the working
checkout contained an older ignored generated-app manifest and stale dependency
links. The initial working-checkout typecheck/docs attempts failed on those
dependencies; they were not counted as passes.

- `pnpm install --frozen-lockfile`: passed in the clean checkout.
- `pnpm typecheck`: passed (53 Turbo tasks and compatibility declarations).
- `pnpm test`: passed (25 package test tasks, 2,432 passing tests).
- `pnpm lint`: passed, including the canonical guidance guard.
- `pnpm --dir docs build`: passed, including MDX, TypeScript, and static generation.

The PR's CI and deployment status must still be checked on its final commit.
