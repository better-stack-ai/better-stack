# Packed consumers

The npm and pnpm fixtures install separately packed packages with strict peer
validation, inspect dependency trees, typecheck public APIs, and build a consumer.

The `analytics` fixture covers public ingestion, authorization-protected reads,
existing event records, daily session hashing and sanitized exports, public
ESM/CommonJS types, and query partitions. Its mounted ESM and actual CommonJS
dashboard checks cover date ranges, export, cookie-free tracking, shared provider
identity, stylesheet retention and deferred pages. No other plugin is selected.

The fixtures use React and React DOM 19.3.1. With the previous 19.2.8 pair, npm 10
and 11 reject the current Better Auth/Drizzle graph while resolving optional
native driver peers: React Native 0.88.0 requires React 19.3. Updating the fixture
pair resolves that graph without overrides, force, or relaxed peer validation.
Workspace tests use the same React 19.3.1 pair. The packages retain their
existing React 19.2.6+ peer requirement.

The `components` fixture installs only `@btst/components` and its React, form,
schema, and styling peers. It exercises the standalone APIs without Core or
feature packages. Its CommonJS browser build resolves BTST's actual `.cjs`
entries and accepts import conditions for Milkdown Kit's ESM-only dependencies;
it does not replace CSS imports or claim native Node Markdown rendering.

The `affiliate` fixture installs the Affiliate package without other feature
packages. It checks ESM/CommonJS authorization, attribution cookies and safe
redirects, ledger deduplication and payout reservations, existing data identities,
query partitions, and the mounted application form in ESM and CommonJS builds.
The CommonJS browser fixture selects the actual `.cjs` entries for Affiliate,
Core and React Query together so each provider has one module instance.
Its protected pages retain
their existing browser-only data loading. Payment settlement is recorded locally;
no payment provider is called.

The `newsletter` fixture installs Newsletter without Blog, AI Chat or standalone components. It checks ESM/CommonJS management operations, authorization, existing campaign records, stubbed targeted delivery and unsubscribe, identity-partitioned query/SSR prefetch, declarations, and real Markdown preview/rich editing in both module builds. Its CommonJS browser build uses the same documented Milkdown import condition. No email provider is called.

The `calendar` fixture installs Calendar without other feature packages or
standalone components. It checks actual ESM/CommonJS operations, host isolation,
timezone slots, competing reservations, token cancellation and privacy, existing
event/booking records, query partitions and SSR prefetch. Both module formats
mount the public booking, cancellation and event-editor pages with the same Core
provider. Browser checks cover timezone selection, confirmation and management
links, date overrides, hook-driven writes, CSS retention and deferred modules.

The `blog-newsletter` fixture installs both independent packages and opts into the public integration entry. It reads a persisted Blog post, checks matching source IDs and denied reads, creates and sends a reviewed campaign through the actual APIs, preserves the original post, and enforces separate campaign-create/send permissions. Production ESM and actual CommonJS browser builds share the external Core provider. Delivery uses an in-memory stub; no email provider is called.

The `open-api` fixture selects only the backend documentation plugin with Core.
It checks native ESM/CommonJS schema and reference endpoints, public infrastructure
access without identity resolution, protected application authorization/validation,
unchanged application data, safe metadata, and both public declaration targets.
Chromium mounts the generated Scalar HTML; only the external CDN script is stubbed,
so no network service is needed. No client plugin or stylesheet is invented.
