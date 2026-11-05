# Packed consumers

The npm and pnpm fixtures install separately packed packages with strict peer
validation, inspect dependency trees, typecheck public APIs, and build a consumer.

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
query partitions, and the mounted application form. Its protected pages retain
their existing browser-only data loading. Payment settlement is recorded locally;
no payment provider is called.
