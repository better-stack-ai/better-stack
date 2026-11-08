# Search #417 benchmark

This is a synthetic adapter benchmark, not evidence of a production latency
regression. The public API and public Blog operations are real; the memory
adapter replaces a database server. The CMS callback reproduces bio-mogging's
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
the same command. The fixture is compatible with both versions. The intermediate
`ranking` capture applies only the Search ordering change; `database` also applies
Blog ID predicates/pagination; `single-batch` adds the one-call Blog candidate batch.
Schema indexes do not affect memory-adapter timings. No production data, model,
external search service, or application credentials are needed.

The checked-in captures use Node 22.19.0, Linux x64, three repetitions per case,
100 and 1,000 records per source, and one, five, and eight sources. Fixtures have
2 KiB bodies, 10% Blog drafts, exact-name records, CMS aliases, and prose matches.
Queries cover exact name and mixed sources (`Masteron`), prefix (`Mast`), punctuation-insensitive
alias (`dro-stanolone`), broad Blog prose (`Research`), no match, page five, and changing
to Blog-only source scope. The regression suite separately specifies relevance
ordering and the case where one source fills all 201 candidates.

`queries` counts adapter findOne/findMany/count calls, **not SQL statements**;
`rows` counts returned records (including ID-only matches and repeated rows), and
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

| Stage / query (1,000 rows, Blog only) | Reads/request | Rows fetched/request | Bytes/request | Median ms |
| --- | ---: | ---: | ---: | ---: |
| baseline / exact | 3 | 100 | 236490 | 1.188 |
| baseline / broad | 3 | 100 | 236490 | 1.453 |
| baseline / none | 3 | 100 | 236490 | 1.171 |
| ranking / exact | 3 | 100 | 236490 | 1.179 |
| ranking / broad | 3 | 100 | 236490 | 1.516 |
| ranking / none | 3 | 100 | 236490 | 1.166 |
| database / exact | 7 | 2 | 2377 | 0.737 |
| database / broad | 21 | 5598 | 561734 | 35.511 |
| database / none | 5 | 0 | 8 | 0.464 |
| single-batch / exact | 7 | 2 | 2377 | 0.563 |
| single-batch / broad | 7 | 2000 | 504146 | 13.106 |
| single-batch / none | 5 | 0 | 8 | 0.438 |

For selective Blog exact-name queries, full body transfer falls from 236,490 to
2,377 bytes/request (99%). No-match Blog queries fetch zero rows instead of 100.
Ranking adds no provider reads. The single candidate batch reduces the new broad
query from 21 to seven adapter reads/request and about 35.5 to 13.1 ms in this run.

Broad queries are **not faster than the baseline**: the baseline silently searches
only the adapter's default 100 fetched posts and therefore undercounts results.
The new path returns the requested 201 candidates out of all 900 public matches,
with accurate pagination. It transfers more ID rows and does more work. This is a
correctness/cost tradeoff, not a latency win. The regression verifies more than
1,000 matches so ID paging also cannot silently apply the adapter default.

Five-source exact queries still take about 21–23 ms because the four CMS callbacks
dominate. No-match queries across five sources remain around 56–60 ms and scan the
CMS fixtures. The Search window does not bound a callback's internal scan. These
numbers do not predict PostgreSQL performance, nor measure a benefit from indexes.

## Ownership and boundaries

| Layer | Implemented change / remaining limit |
| --- | --- |
| Search orchestration | Rank returned public candidates by exact title, alias, prefix, substring, then prose; stable source/resource ID ties. Still 201 candidates/source, 200 global results, 10 pages. |
| Blog provider | One authorized 201-candidate operation rather than three repeated scans. Upgrade Search and Blog together; older Blog rejects a limit above 100. |
| Blog source | Without editorial activation, eligible ASCII case-insensitive title/content/excerpt predicates fetch paged IDs, union/deduplicate, then count/page full posts in the DB. Existing publication/slug/tag predicates apply to each ID query. |
| Editorial Blog | Keep the approved-live-revision projection and JavaScript filtering. Never prefilter public queries using private working copies. |
| CMS provider | Remains an explicit callback. Public fields, Unicode aliases, and subtype/destination rules remain application-owned. No new generic CMS text predicate substitutes for bio-mogging normalization. |
| DB adapter | Existing `contains`, `mode: insensitive`, `select`, `in`, count, and pagination suffice. Three AND-only queries avoid incompatible OR grouping. Unicode and SQL-wildcard queries retain paged literal JavaScript matching. No adapter extension is proposed. |
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
