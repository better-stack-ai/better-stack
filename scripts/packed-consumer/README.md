# Packed consumers

The npm and pnpm fixtures install separately packed packages with strict peer
validation, inspect dependency trees, typecheck public APIs, and build a consumer.

The auth fixture explicitly declares `@react-email/render@2.0.6`, the renderer
used by `@react-email/components@1.0.12` in Better Auth UI 2.0.0. Without this direct
dependency, npm 10 and 11 select react-dom 19.3.0 for the nested renderer peer set
before reconciling the consumer's React/React DOM 19.2.8 pair, producing ERESOLVE.
The failure reproduces with only React, React DOM, and React Email Components;
it is not specific to packed BTST artifacts. A published-package consumer using
that React/React Email combination can also be affected. Declaring the matching
renderer directly resolves that graph without overrides, force, or relaxed peers.
The fixture retains React/React DOM 19.2.8 and validates npm and pnpm installation,
types, and builds. It does not change the published packages' React peer ranges.
