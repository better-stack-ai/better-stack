# @btst/plugin-comments

## 1.1.0

### Minor Changes

- fb9b362: Publish the current feature set for coordinated beta verification. Include Blog editorial review and revisions, comment and media page overrides, conditional forms and file uploads, Job Board and School bridges, Newsletter recovery, and the updated shared UI. Refresh the API-reference and route-reference packages in the tested installation set.

  Open editable Blog drafts in their request-aware editor while preserving published and read-only post links.

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

- Publish the current feature set for coordinated beta verification. Include Blog editorial review and revisions, comment and media page overrides, conditional forms and file uploads, Job Board and School bridges, Newsletter recovery, and the updated shared UI. Refresh the API-reference and route-reference packages in the tested installation set.

### Patch Changes

- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0-beta.0

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

- Extract Comments from the v5 stack into an independently versioned package for Core v6.
