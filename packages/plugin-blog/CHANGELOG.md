# @btst/plugin-blog

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

- Open editable drafts in the request-aware editor instead of a static public post URL.
- 83762ab: Isolate private Blog revision history across account and authorization changes, and suppress cached history while identity resolution fails or remains pending. Bound Search snippet input before processing malformed markup to limit server work.
- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0-beta.0

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

### Major Changes

- Extract Blog from Core into its own package. Requires @btst/stack 6.
