# Search #417 benchmark

This is a synthetic benchmark, not evidence of a production latency regression.
The public Search and Blog operations are real. The default run uses the memory
adapter; the optional run uses Prisma and disposable PostgreSQL. The CMS callback reproduces bio-mogging's
explicit field selection (`name`, `aliases`, `overview`), normalization, paging,
and public projection. It is application code, not library indexing.

## Reproduce

Use the repository's Node 22 and pnpm 10.17.1 toolchain:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec tsx packages/plugin-search/benchmarks/search.ts > search.jsonl
# Optional larger fixtures / more repetitions:
SEARCH_BENCH_SIZES=100,1000,10000 SEARCH_BENCH_REPEATS=10 pnpm exec tsx packages/plugin-search/benchmarks/search.ts > search-large.jsonl
```

To reproduce the baseline, use a separate checkout of
`381f8f0c0cc75677431f470d52fd1d274cd5d6c0`, copy the final
`packages/plugin-search/benchmarks/` directory into it, install/build, and run
the same command. The fixture opts into `batchSize: 201`, which the baseline ignores; it is compatible with both versions. The intermediate
`ranking` capture applies only the Search ordering change; `database` also applies
Blog database predicates/pagination; `single-batch` adds the one-call Blog candidate batch.
Schema indexes do not affect memory-adapter timings. No production data, model, external search service, or application credentials
are needed. Set `SEARCH_BENCH_BATCH_SIZE=100` to measure the compatibility batch;
the default 201 opts into the updated Blog operation.

The checked-in captures use Node 22.19.0, Linux x64, three repetitions per case,
100 and 1,000 records per source, and one, five, and eight sources. Fixtures have
2 KiB bodies, 10% Blog drafts, exact-name records, CMS aliases, and prose matches.
Queries cover exact name and mixed sources (`Masteron`), prefix (`Mast`), punctuation-insensitive
alias (`dro-stanolone`), broad Blog prose (`Research`), no match, a literal NUL query, page five, and changing
to Blog-only source scope. The regression suite separately specifies relevance
ordering and the case where one source fills all 201 candidates.

`queries` counts adapter findOne/findMany/count calls, **not SQL statements**;
`rows` counts returned records (including repeated rows), and
`bytes` is UTF-8 JSON size of adapter results, not wire protocol bytes. Counts are
summed across repetitions. They measure fetched/processed application rows, not
a database query plan's rows examined. `p50Ms`/`p95Ms` time the public request
operation through QueryClient, excluding seeding. With three samples p95 is the
maximum; these are diagnostic observations, not stable performance budgets.
Cold means an uncached QueryClient entry, not a cold OS or database. Repeat means
the same fresh browser cache key; all captured repeats have zero provider calls
and adapter reads. The fixture scopes its cache to one synthetic identity and
never adds a server cache. Source and page changes use distinct keys.

## Measured changes

Memory adapter:

| Stage / query (1,000 rows, Blog only) | Adapter reads/request | SQL/request | Rows fetched/request | Bytes/request | Median ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline / exact | 3 | — | 100 | 236490 | 1.218 |
| baseline / broad | 3 | — | 100 | 236490 | 1.491 |
| baseline / none | 3 | — | 100 | 236490 | 1.178 |
| ranking / exact | 3 | — | 100 | 236490 | 1.204 |
| ranking / broad | 3 | — | 100 | 236490 | 1.61 |
| ranking / none | 3 | — | 100 | 236490 | 1.139 |
| database / exact | 4 | — | 1 | 2356 | 1.251 |
| database / broad | 12 | — | 201 | 475370 | 5.689 |
| database / none | 3 | — | 0 | 3 | 0.368 |
| single-batch / exact | 4 | — | 1 | 2356 | 0.742 |
| single-batch / broad | 4 | — | 201 | 475358 | 3.44 |
| single-batch / none | 3 | — | 0 | 3 | 0.388 |

PostgreSQL 17 through Prisma:

| Stage / query (1,000 rows, Blog only) | Adapter reads/request | SQL/request | Rows fetched/request | Bytes/request | Median ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline / exact | 3 | 4 | 100 | 261390 | 3.741 |
| baseline / broad | 3 | 4 | 100 | 261390 | 4.129 |
| baseline / none | 3 | 4 | 100 | 261390 | 3.475 |
| database / exact | 4 | 5 | 1 | 2605 | 20.708 |
| database / broad | 12 | 15 | 201 | 525419 | 10.365 |
| database / none | 3 | 3 | 0 | 3 | 8.236 |
| single-batch / exact | 4 | 5 | 1 | 2605 | 20.785 |
| single-batch / broad | 4 | 5 | 201 | 525407 | 7.473 |
| single-batch / none | 3 | 3 | 0 | 3 | 8.395 |

For selective Blog exact-name queries, the final run fetches one full post rather
than 100 (about 99% fewer bytes). No-match queries fetch zero records instead of
100. Ranking adds no provider reads. With the larger compatible batch, broad
queries evaluate the database predicate/count once rather than once per source
page. The intermediate `database` stage uses 100-record batches and the final
`single-batch` stage opts into 201.

Latency gains are not universal. The baseline silently searches only the adapter's
default 100 fetched posts, undercounting broader results. The final path searches
all 900 public matches and returns the requested 201 candidates with accurate
pagination. It therefore does more correct work. Native substring predicates can
scan large bodies, and exact totals add a count query; lower transfer does not
necessarily mean lower PostgreSQL latency. The captures report these costs rather
than claiming an across-the-board speedup. The regression verifies more than
1,000 matches before paging, and literal fallback scans also page explicitly.

Five-source queries remain dominated by the four application-owned CMS callbacks.
The Search window does not bound those callbacks' internal scans. These fixtures
are not production estimates and do not measure an index-creation speedup. Both
PostgreSQL captures use the same indexed schema so differences reflect runtime
query changes. Cached repeats have zero provider calls and database queries.

## Ownership and boundaries

| Layer | Implemented change / remaining limit |
| --- | --- |
| Search orchestration | Rank returned public candidates by exact title, alias, prefix, substring, then prose; stable source/resource ID ties. Still 201 candidates/source, 200 global results, 10 pages. |
| Blog provider | Optional `batchSize: 201` uses one authorized operation rather than three repeated scans. Default stays 100 for existing integrations. Opt in only with a matching Blog release. |
| Blog source | Without editorial activation on memory or Prisma PostgreSQL, eligible printable-ASCII title/content/excerpt predicates form an OR group before AND scope filters, then count/page full posts in the DB. Existing publication/slug/tag predicates remain part of matching and paging. |
| Editorial Blog | Keep the approved-live-revision projection and JavaScript filtering. Never prefilter public queries using private working copies. |
| CMS provider | Remains an explicit callback. Public fields, Unicode aliases, and subtype/destination rules remain application-owned. No new generic CMS text predicate substitutes for bio-mogging normalization. |
| DB adapter | Existing `contains`, `mode: insensitive`, OR/AND connectors, count, and pagination suffice for the known adapters. Unicode, nonprinting, SQL-wildcard, and unknown-adapter queries retain paged literal JavaScript matching. No adapter extension is proposed. |
| Schema | Blog `(published, createdAt)` and CMS `(contentTypeId, createdAt)` indexes support existing equality/paging predicates. They cannot accelerate the JavaScript alias scan or general substring predicates. |

Exact-title records beat aliases; aliases beat prefixes; prefixes beat substrings;
prose-only matches come last. NFKD normalization retains Unicode letters/numbers,
lowercases, and removes punctuation/combining marks. Matching remains the provider's
responsibility. Optional alias metadata affects ranking and is removed from output.
Source labels already present categories; subtype labels are a separate UI choice,
not a relevance score. No category fields or UI changes are introduced.

Equal-rank results still favor earlier source IDs. A stronger later-source result
can enter the global window, but equal-rank source fairness is not promised.
Relevance cannot rescue a candidate outside its provider's own selected 201.
There is no numeric cross-provider score, exact global total, or immutable snapshot.
Concurrent content edits may move results between pages. Providers still apply
authorization and visibility before returning candidates or continuation metadata.

## Schema generation and existing databases

The indexes are in the plugin schemas, not handwritten application SQL. Verify
that the pinned generation path carries them through:

```sh
pnpm dlx @btst/cli@3.0.1 generate --orm prisma --config packages/plugin-search/benchmarks/schema.ts --output /tmp/search-schema.prisma --yes
```

The generated Prisma schema includes:

```prisma
@@index([published, createdAt], map: "post_published_createdAt_idx")
@@index([contentTypeId, createdAt], map: "contentItem_contentTypeId_createdAt_idx")
```

For a consuming application, regenerate its actual schema with
`pnpm exec btst generate ...`, create/review the ORM migration, and apply it using
the application's migration workflow. Removing these additive indexes is reversible;
large tables may need database-specific online index creation. No application data
migration or deployment is performed by this library PR.

Application-specific normalized alias/name columns, JSON paths, and any text indexes
remain explicit application decisions. No missing DB capability has been established
for this change, so no speculative DB follow-up or external indexing dependency is
added. A PostgreSQL benchmark with real query plans is needed before claiming an
index speedup or selecting specialized text indexes.

Generation was also verified through Drizzle (using the CLI's `drizzle-orm` peer)
and Kysely against disposable PostgreSQL 17. The generated Kysely SQL was applied
successfully, and both indexes were found in `pg_indexes`. The fixture schema
contains only the two plugin schemas; existing applications must generate from
their own complete schema instead of copying this fixture.

## PostgreSQL capture

The optional PostgreSQL mode runs the same fixture through the real Prisma adapter
and PostgreSQL 17. `sqlQueries` counts Prisma query events, including relation
queries; adapter rows/bytes retain the definitions above. This measures the Search
request operation through database I/O and response construction, excluding fixture
creation. It does not measure browser/network rendering or PostgreSQL EXPLAIN rows.

Use a new disposable database named `search_benchmark` on loopback. The runner
rejects other database names/hosts and nonempty fixture tables, and removes its
fixtures after each case. Recreate the database after an interrupted run.
The optional runtime lives outside the workspace; no application dependency changes
are needed:

```sh
podman run --rm -d --name search-benchmark -e POSTGRES_PASSWORD=benchmark -e POSTGRES_DB=search_benchmark -p 127.0.0.1:56417:5432 postgres:17-alpine
search_bench_runtime=$(mktemp -d)
npm install --prefix "$search_bench_runtime" --no-audit --no-fund @btst/adapter-prisma@3.0.1 @prisma/client@6.19.0 prisma@6.19.0 better-auth@1.7.14 @better-auth/core@1.7.14 @better-auth/utils@0.5.1
cp packages/plugin-search/benchmarks/postgres.prisma "$search_bench_runtime/schema.prisma"
export DATABASE_URL=postgresql://postgres:benchmark@127.0.0.1:56417/search_benchmark
"$search_bench_runtime/node_modules/.bin/prisma" generate --schema "$search_bench_runtime/schema.prisma"
"$search_bench_runtime/node_modules/.bin/prisma" db push --schema "$search_bench_runtime/schema.prisma" --skip-generate
SEARCH_BENCH_RUNTIME="$search_bench_runtime" SEARCH_BENCH_DATABASE_URL="$DATABASE_URL" SEARCH_BENCH_SOURCES=1,5 pnpm exec tsx packages/plugin-search/benchmarks/search.ts > postgres.jsonl
podman stop search-benchmark
```

The same baseline-checkout procedure above reproduces the PostgreSQL baseline.
`postgres-database.jsonl` uses the final query path with
`SEARCH_BENCH_BATCH_SIZE=100`; `postgres-single-batch.jsonl` uses 201.
Both captures use the same indexed schema, Prisma 6.19.0 (a supported adapter peer),
PostgreSQL 17, source counts 1/5 and sizes 100/1,000. They isolate runtime query
changes; they do not attribute latency differences to index creation. Bio-mogging
uses Prisma 7, so these are a library fixture rather than an app-specific forecast.

The committed Prisma fixture follows generated Blog/CMS fields and indexes, with
explicitly named source/target CMS relations. The unmodified CLI 3.0.1 output has
a pre-existing duplicate-relation error tracked in
[better-auth #54](https://github.com/better-stack-ai/better-auth/issues/54).
Generation emits both indexes, but that complete Prisma output cannot pass
validation until #54 is fixed. Do not overwrite an application's working relations
with the fixture or the currently invalid generator output. Kysely generation and
migration were verified without this workaround.
