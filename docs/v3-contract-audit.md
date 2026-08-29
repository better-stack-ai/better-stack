# v3 all-plugin contract audit

This matrix is the completion record for issue #225. Programmatic IDs are
camelCase identifiers; kebab-case package exports and URL slugs remain
unchanged. Paths beginning with `src/` or `consumer-tests/` are relative to
`packages/stack/`.

| Surface | Final contract | Focused evidence |
| --- | --- | --- |
| AI Chat (`aiChat`) | Options-object backend preserves model and tools; the runtime-independent client factory preserves public/authenticated mode and resolves all loader/browser transport from the client stack. | `src/plugins/ai-chat/__tests__/authorization.test.ts`, `client-sweep.test.tsx`, `chat-hooks.test.tsx`, and `src/__tests__/ai-chat-client-runtime.test.ts` |
| Blog (`blog`) | Options-object backend and nested lifecycle hooks remain; loaders, metadata, sitemap, hydration, queries, and mutations share the resolved runtime. | `src/plugins/blog/__tests__/authorization.test.ts`, `client-runtime.test.ts`, `client-runtime.browser.test.tsx`, and `client-sweep.test.tsx` |
| CMS (`cms`) | Content-type configuration remains factory-owned; request operations, trusted operations, raw helpers, client runtime, and provider behavior stay separated. | `src/plugins/cms/__tests__/authorization.test.ts`, `schema-roundtrip.test.ts`, `client-runtime.test.ts`, `client-runtime.browser.test.tsx`, and `client-sweep.test.tsx` |
| Comments (`comments`) | Flags, moderation, and user-resolution behavior remain; backend hooks use the nested grammar and client data uses the resolved runtime. | `src/plugins/comments/__tests__/authorization.test.ts`, `client-runtime.test.ts`, `client-runtime.browser.test.tsx`, and `client-sweep.test.tsx` |
| Form Builder (`formBuilder`) | Form/submission operation lifecycles, loaders, browser mutations, authorization gates, and provider services retain parity. | `src/plugins/form-builder/__tests__/authorization.test.ts`, `client-runtime.test.ts`, `client-runtime.browser.test.tsx`, `client-sweep.test.tsx`, and `form-renderer-authorization.test.tsx` |
| Kanban (`kanban`) | The options-object backend preserves user search/resolution and board/column/task lifecycles; protected query keys and browser runtime are identity-partitioned. | `src/plugins/kanban/__tests__/authorization.test.ts`, `client-runtime.test.ts`, `client-runtime.browser.test.tsx`, `identity-partition.test.tsx`, and `client-sweep.test.tsx` |
| Media (`media`) | Storage and tenant state stay server-side; upload lifecycle, cross-origin isolation, identity partitions, hydration, and browser mutation behavior use the resolved runtime without secret leakage. | `src/plugins/media/__tests__/authorization.test.ts`, `storage-adapters.test.ts`, `client-runtime.test.ts`, `client-runtime.browser.test.tsx`, `identity-partition.test.tsx`, and `client-sweep.test.tsx` |
| OpenAPI (`openApi`) | Intentionally backend-only; schema/reference routes use validated endpoint inventory and emit deterministic safe access metadata. | `src/plugins/open-api/__tests__/route-introspection.test.ts` and `src/__tests__/endpoint-inventory.test.ts` |
| Route Docs (`routeDocs`) | Intentionally client-only; the definition inherits site/query runtime and inspects resolved client routes by canonical ID. | `src/plugins/route-docs/client/plugin.tsx`, `src/plugins/route-docs/generator.ts`, and `src/__tests__/client-runtime.test.ts` |
| UI Builder (`uiBuilder`) | Intentionally client-only over CMS; component registration stays factory-owned while provider overrides are inferred from the registered definition. | `src/plugins/ui-builder/__tests__/client-sweep.test.tsx`, `src/plugins/ui-builder/client/plugin.tsx`, and `src/__tests__/plugin-registration.typecheck.tsx` |
| Third-party consumer | Public backend/client definitions require stable IDs, preserve route/operation inference, and reject mismatched IDs, overrides, configs, and auth catalogs without internal imports. | `consumer-tests/constructor-exports`, `src/__tests__/plugins.test.tsx`, `plugin-registration.test.tsx`, and `plugin-registration.typecheck.tsx` |

## Cross-cutting contract evidence

- `src/__tests__/stack-constructors.test.ts` and
  `package-metadata.test.ts` prove that only `createBackendStack` and
  `createClientStack` exist across source, declarations, ESM, and CJS.
- `src/__tests__/client-runtime.test.ts` covers one runtime, same-origin path
  overrides, complete endpoint replacement, sensitive-header isolation,
  provider projection, SSR/browser hydration, and rejected unqualified runtime
  fields.
- `src/__tests__/plugin-registration.test.tsx` covers canonical IDs, mismatch and
  duplicate failures, provider inference, and route diagnostics.
- `src/__tests__/authorization.test.ts`, `authorization.typecheck.ts`, and the
  plugin authorization suites cover permissive omitted auth, authoritative
  enabled auth, trusted fact derivation, `trusted`/`raw` boundaries, immutable
  results, and lifecycle behavior.
- `src/__tests__/initial-identity-hydration.test.tsx` and
  `initial-identity-layouts.test.tsx` cover tri-state request hydration across
  Next.js, React Router, and TanStack helpers.
- `scripts/check-canonical-dx.mjs`, package consumer compiles, strict package
  metadata tests, registry generation/install tests, generated app builds, and
  root Node 22 verification are the release gates for this matrix.
