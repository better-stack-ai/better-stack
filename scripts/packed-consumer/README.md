# Packed consumers

The npm and pnpm fixtures install separately packed packages with strict peer
validation, inspect dependency trees, typecheck public APIs, and build a consumer.

The fixtures use React and React DOM 19.3.1. With the previous 19.2.8 pair, npm 10
and 11 reject the current Better Auth/Drizzle graph while resolving optional
native driver peers: React Native 0.88.0 requires React 19.3. Updating the fixture
pair resolves that graph without overrides, force, or relaxed peer validation.
Workspace tests still use React 19.2.7. This fixture update does not change the
published packages' React peer ranges.
