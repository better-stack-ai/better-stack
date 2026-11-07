# @btst/plugin-feature-flags

## 1.2.0-beta.1

### Patch Changes

- Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.
- Updated dependencies
  - @btst/stack@6.2.0-beta.1

## 1.2.0-beta.0

### Minor Changes

- 75fc257: Add route-restricted AI authoring tools for Form Builder, Newsletter, CMS, Kanban, and School, with validated client handlers and read-only summary context for administrative dashboards. Source plugins use the optional Core page-context bridge and do not require AI Chat.
- 25a6b4b: Add opt-in anonymous experiment exposure tracking and protected per-variant conversion reports, with UTC-day attribution and separate configuration fingerprints.

### Patch Changes

- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0-beta.0

## 1.1.0

### Minor Changes

- Prepare the feature-variant and Calendar rescheduling APIs required by Analytics bridges. Add optional rescheduled confirmation context while retaining existing notification callbacks.

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

Initial independent package for Core v6. Preserves existing feature flag data, evaluation and authorization contracts.
