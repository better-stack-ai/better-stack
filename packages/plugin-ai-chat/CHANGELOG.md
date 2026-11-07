# @btst/plugin-ai-chat

## 1.1.0

### Minor Changes

- 75fc257: Add route-restricted AI authoring tools for Form Builder, Newsletter, CMS, Kanban, and School, with validated client handlers and read-only summary context for administrative dashboards. Source plugins use the optional Core page-context bridge and do not require AI Chat.

### Patch Changes

- 5a7bfcf: Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.

  Preserve an archive-verified npm provisioning placeholder on `latest` while publishing its first beta to `next`.
- Updated dependencies [5a7bfcf]
- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0

## 1.1.0-beta.1

### Patch Changes

- Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.
- Updated dependencies
  - @btst/stack@6.2.0-beta.1

## 1.1.0-beta.0

### Minor Changes

- 75fc257: Add route-restricted AI authoring tools for Form Builder, Newsletter, CMS, Kanban, and School, with validated client handlers and read-only summary context for administrative dashboards. Source plugins use the optional Core page-context bridge and do not require AI Chat.

### Patch Changes

- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0-beta.0

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

- Extract AI Chat from the BTST v5.2.0 baseline for core v6, preserving the
  `aiChat` runtime identity, permission namespace, routes and stored data.
- Provide independently installable backend, client, hooks, components, context,
  query-key, permission, type and stylesheet entries with ESM/CommonJS declarations.
