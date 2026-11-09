# @btst/plugin-cms

## 1.2.1

### Patch Changes

- 55c5bff: Reduce reverse-relationship round trips with bounded source-ordered scans and filter scheduled public records before transferring their bodies. Declare reverse-lookup and source-lookup indexes in the CMS schema; existing SQL applications must generate and apply an ORM migration to install them.

## 1.2.0

### Minor Changes

- 75fc257: Add route-restricted AI authoring tools for Form Builder, Newsletter, CMS, Kanban, and School, with validated client handlers and read-only summary context for administrative dashboards. Source plugins use the optional Core page-context bridge and do not require AI Chat.
- 559543f: Add opt-in content-type publication policies, filtered public content projections, and trusted scheduled publication dispatch with revision history and a host revalidation hook.

### Patch Changes

- 5a7bfcf: Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.

  Preserve an archive-verified npm provisioning placeholder on `latest` while publishing its first beta to `next`.
- Updated dependencies [5a7bfcf]
- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0

## 1.2.0-beta.1

### Patch Changes

- Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.
- Updated dependencies
  - @btst/stack@6.2.0-beta.1

## 1.2.0-beta.0

### Minor Changes

- 75fc257: Add route-restricted AI authoring tools for Form Builder, Newsletter, CMS, Kanban, and School, with validated client handlers and read-only summary context for administrative dashboards. Source plugins use the optional Core page-context bridge and do not require AI Chat.
- 559543f: Add opt-in content-type publication policies, filtered public content projections, and trusted scheduled publication dispatch with revision history and a host revalidation hook.

### Patch Changes

- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0-beta.0

## 1.1.0

### Minor Changes

- Prepare CMS revision and scheduling APIs required by the current School package and include the compatible CMS release in the tested CLI cohort.

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

Initial independent CMS package for BTST core v6. Existing data, routes, permissions and query keys are preserved.
