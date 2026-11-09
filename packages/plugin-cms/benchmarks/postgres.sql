-- Run only in a disposable benchmark database. All fixture tables are temporary.
-- psql -v ON_ERROR_STOP=1 -v fanout=5000 -f postgres.sql
\timing on
CREATE TEMP TABLE "contentItem" (
  id text PRIMARY KEY, "contentTypeId" text, "createdAt" timestamp,
  "publishAt" timestamp, data text
);
CREATE TEMP TABLE "contentRelation" (
  id text PRIMARY KEY, "sourceId" text, "targetId" text, "fieldName" text
);
INSERT INTO "contentItem"
SELECT 'source-' || lpad(i::text, 6, '0'),
  CASE WHEN i % 5 = 0 THEN 'other' ELSE 'article' END,
  timestamp '2026-01-01',
  CASE WHEN i % 4 >= 2 THEN timestamp '2030-01-01' END,
  json_build_object('status', CASE WHEN i % 4 = 1 THEN 'draft' ELSE 'published' END,
    'body', repeat('x', 1024))::text
FROM generate_series(0, :fanout - 1) AS i;
INSERT INTO "contentRelation"
SELECT 'relation-' || id, id, 'target', 'related' FROM "contentItem";
INSERT INTO "contentRelation"
SELECT 'duplicate-' || id, id, 'target', 'related' FROM "contentItem"
WHERE right(id, 1) = '0';
INSERT INTO "contentRelation"
SELECT 'noise-' || i, 'unrelated-' || i, 'other-' || (i % 100), 'related'
FROM generate_series(1, 50000) AS i;
ANALYZE "contentRelation";
ANALYZE "contentItem";

\echo 'Baseline reverse lookup: no plugin indexes, 100-row batch, later page'
EXPLAIN (ANALYZE, BUFFERS)
SELECT "sourceId" FROM "contentRelation"
WHERE "targetId" = 'target' AND "fieldName" = 'related'
ORDER BY id LIMIT 100 OFFSET 1000;

\echo 'Proposed source cursor before adding indexes'
EXPLAIN (ANALYZE, BUFFERS)
SELECT "sourceId" FROM "contentRelation"
WHERE "targetId" = 'target' AND "fieldName" = 'related'
  AND "sourceId" > 'source-000999'
ORDER BY "sourceId" LIMIT 500;

-- Same non-unique indexes declared in cmsSchema; duplicates remain valid.
CREATE INDEX "contentRelation_targetId_fieldName_sourceId_idx"
  ON "contentRelation" ("targetId", "fieldName", "sourceId");
CREATE INDEX "contentRelation_sourceId_fieldName_idx"
  ON "contentRelation" ("sourceId", "fieldName");
ANALYZE "contentRelation";
\echo 'Same source cursor with the plugin index'
EXPLAIN (ANALYZE, BUFFERS)
SELECT "sourceId" FROM "contentRelation"
WHERE "targetId" = 'target' AND "fieldName" = 'related'
  AND "sourceId" > 'source-000999'
ORDER BY "sourceId" LIMIT 500;

\echo 'Source-side access used by relation population and replacement'
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "contentRelation" WHERE "sourceId" = 'source-000004';

-- Query prototype only: DBAdapter cannot express EXISTS, JSON scalar predicates,
-- or secondary ordering. This SQL is never used by the CMS runtime.
\echo 'Desired public page, deduplicated before deterministic pagination'
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.* FROM "contentItem" c
WHERE c."contentTypeId" = 'article' AND c."publishAt" IS NULL
  AND c.data::jsonb ->> 'status' = 'published'
  AND EXISTS (
    SELECT 1 FROM "contentRelation" r WHERE r."sourceId" = c.id
      AND r."targetId" = 'target' AND r."fieldName" = 'related'
  )
ORDER BY c."createdAt" DESC, c.id COLLATE "C" DESC LIMIT 20 OFFSET 200;
\echo 'Desired matching total'
SELECT count(*) FROM "contentItem" c
WHERE c."contentTypeId" = 'article' AND c."publishAt" IS NULL
  AND c.data::jsonb ->> 'status' = 'published'
  AND EXISTS (
    SELECT 1 FROM "contentRelation" r WHERE r."sourceId" = c.id
      AND r."targetId" = 'target' AND r."fieldName" = 'related'
  );
