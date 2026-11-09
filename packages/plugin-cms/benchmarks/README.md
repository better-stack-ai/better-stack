# Reverse-relationship pagination (#418)

The portable getter still discovers every matching source on each requested
page. This change reduces round trips, indexes source-ordered junction scans, and
excludes scheduled public bodies before transfer. It retains source
deduplication, exact totals, creation-time/ID descending order, content-type
filtering, and the full-content visibility recheck. Native operation authorization
and lifecycle boundaries are unchanged.

## Reproduce the getter measurements

Use the repository's Node 22 and pnpm versions. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
git show d6e06c2e:packages/plugin-cms/src/api/getters.ts > packages/plugin-cms/src/api/.reverse-relation-baseline.ts
CMS_BENCH_GETTERS=src/api/.reverse-relation-baseline.ts CMS_BENCH_OUTPUT=/tmp/cms-before.json pnpm --filter @btst/plugin-cms exec vitest run --config benchmarks/vitest.config.ts
CMS_BENCH_OUTPUT=/tmp/cms-after.json pnpm --filter @btst/plugin-cms exec vitest run --config benchmarks/vitest.config.ts
rm packages/plugin-cms/src/api/.reverse-relation-baseline.ts
```

The baseline is the original implementation at the PR's base commit. The fixture
uses the real memory adapter with 0, 100, 1,000 and 5,000 unique source items,
one or two source types, two relation fields, unrelated targets, duplicate
junction rows, tied timestamps, 1 KiB bodies, drafts, future schedules, and past
schedules. A non-null schedule is hidden even when its date is in the past.
Public and unrestricted reads request 20 items at offsets 0 and 200. Each case
has one warmup and five measured repetitions; setup is outside the measurement.

`queries` counts calls to the adapter's `findOne` and `findMany` interfaces,
including type lookup and page hydration. `rows` counts returned top-level rows;
`bytes` is their UTF-8 JSON encoding size, not network protocol bytes. Those rows
are processed by the getter; these counts do not measure rows examined inside an
engine, implicit join queries, or allocated heap. `medianMs` measures the full
getter, including instrumentation. Memory has no physical indexes and no network
latency. Do not interpret these numbers as production PostgreSQL latency.

Complete measurements are in `results-before.json` and `results-after.json`.

Recorded with Node 22.19.0, the real memory adapter 3.0.1, and this fixture on
2026-11-09 UTC. Selected cases with mixed source types:

| Sources | Read | Offset | Calls before → after | Rows before → after | JSON bytes before → after | Median ms before → after |
| --- | --- | --- | --- | --- | --- | --- |
| 1,000 | unrestricted | 0 | 24 → 7 | 1,921 → 1,921 | 111,983 → 111,965 | 18.137 → 13.066 |
| 1,000 | public | 0 | 24 → 7 | 1,921 → 1,521 | 1,012,495 → 532,521 | 17.209 → 13.038 |
| 5,000 | unrestricted | 200 | 108 → 24 | 9,521 → 9,521 | 438,107 → 438,023 | 368.796 → 515.619 |
| 5,000 | public | 200 | 108 → 24 | 9,521 → 7,521 | 4,945,019 → 2,543,379 | 385.467 → 643.616 |

The larger public case reduces adapter calls by 78% and transferred JSON by
49%. Later pages still repeat discovery and metadata work. The largest memory
cases were slower in this recorded run; fewer round trips do not establish an
application latency guarantee. Full SQL-backed getter latency remains unmeasured.

## PostgreSQL index and query prototype

`postgres.sql` uses temporary tables in a disposable PostgreSQL database. It
creates 5,000 sources, 500 duplicate edges, and 50,000 unrelated relationships,
then runs `EXPLAIN (ANALYZE, BUFFERS)` before and after the schema-owned indexes:

```sh
psql "$CMS_BENCH_DATABASE_URL" -v ON_ERROR_STOP=1 -v fanout=5000 -f packages/plugin-cms/benchmarks/postgres.sql
```

The script reports rows, filters, buffers and execution latency. It separately
tests the original ID/offset lookup, the proposed source ordering without an
index, the same query with the reverse index, source-side access, and the
desired database-native public page and matching count. The query prototype
uses `EXISTS` so duplicate edges cannot duplicate content items.

Measured on PostgreSQL 17, the same 500-row source-ordered query at offset 1,000
examined 55,500 junction rows without an index (5,500 survived filtering) and
1,500 index entries with the reverse index, returning 500 rows in both cases.
Execution time was 4.600 ms versus 0.198 ms in that run; the index-only scan
still performed 1,500 heap visibility fetches. The original ID/offset query
examined 51,100 entries to return 100 at offset 1,000 (3.326 ms). The source-side
lookup used its own index (0.025 ms).
These are single-query fixture measurements, not an end-to-end application
benchmark. Plans and timings depend on statistics, cache and data distribution.

## Index ownership and migration

`cmsSchema.schema.contentRelation` owns these non-unique indexes:

```text
(targetId, fieldName, sourceId)   reverse filter, source order and projection
(sourceId, fieldName)             source population/replacement; source-only prefix
```

No uniqueness constraint is added. The schema index validator does not accept
the implicit `id` as an index field; the indexed source ordering uses the
explicitly declared `sourceId`. The getter retains offset scans: the memory
adapter sorts strings with `localeCompare` but compares `gt` with JavaScript
`>`, so a keyset cursor can omit mixed-case IDs. A regression covers that batch
boundary. Final content ordering remains the existing JavaScript comparison.

From `packages/plugin-cms`, verify the pinned generator against the real schema:

```sh
npx --yes @btst/cli@3.0.1 generate --config=benchmarks/schema.config.ts --output=/tmp/cms-schema.prisma --orm=prisma --yes
npx --yes @btst/cli@3.0.1 generate --config=benchmarks/schema.config.ts --output=/tmp/cms-schema.ts --orm=drizzle --yes
```

Drizzle generation requires the consumer's compatible `drizzle-orm` peer.
Both generators emit the two compound indexes. The separate
[Prisma relation-generator defect](https://github.com/better-stack-ai/better-auth/issues/54)
still affects the two references to `ContentItem`; this work verifies index
output, not a fix for that defect. Preserve existing valid relation declarations
when reviewing generated schema changes. For existing applications, use
`@btst/codegen generate` and the ORM's reviewed migration workflow, then verify
live indexes. Installing the package does not migrate a database.

Bio-mogging's committed Prisma schema and a read-only `pg_indexes` inspection of
its configured database on 2026-11-09 showed only primary-key indexes on
`contentRelation` and `contentItem`. No application files or database contents
were changed. Its server helper requests successive 100-item pages, repeating
the previous implementation's scans. Search performance is separate (#417).

PostgreSQL 17 plans were measured. SQLite/MySQL plans and latency were not;
engine collation and indexed-string size limits still apply. Memory does not
create physical indexes. Batches of 500 keep ID predicates below SQLite's legacy
999-bind limit, including the type and publication predicates. There is no
cross-request cache or snapshot guarantee across separate page requests.

## Why the portable fallback remains

The executed SQL prototype needs a filtered source semi-join (`EXISTS`), a JSON
scalar publication predicate, identical distinct-source count predicates, and
two-field ordering before pagination. Current `DBAdapter` joins accept only a
model and optional limit; base-field predicates cannot filter joined sources,
and `sortBy` accepts one field. Limiting junction rows before source type and
publication filtering would change totals and pages.

[BTST/db #55](https://github.com/better-stack-ai/better-auth/issues/55) records
those precise missing capabilities. This PR does not widen that API or add
runtime SQL. Public metadata still transfers unscheduled bodies to inspect the
configured JSON publication field; only ID and creation time survive that
inspection. ID discovery and content sorting remain proportional to matches,
including on later pages. Offset scans can revisit earlier index entries;
consistent adapter sort/comparison semantics are also needed before replacing
them with a portable keyset cursor.
