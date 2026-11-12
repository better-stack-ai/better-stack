# @btst/plugin-search

## 1.1.1

### Patch Changes

- Rank titles and public aliases containing all query terms above incidental snippet matches while preserving exact and phrase precedence, bounded federation, and deterministic ties.

## 1.1.0

### Minor Changes

- Rank exact names and aliases ahead of weaker matches across sources, preserve deterministic result windows, and bound Blog candidate fetching through the updated Blog operation.
- d6e06c2: Validate successful Search responses, keep async states outside the dialog listbox,
  and bound the native dialog to small viewports. Add result/loading presentation
  callbacks while retaining Search-owned accessibility, navigation and recovery.
  Document local embedded state using the existing scoped router mechanism and
  refresh the ejectable Search registry views.

  Restore case-insensitive phrase highlighting in result titles and previews, and
  export SearchHighlight for custom rows receiving the current query.

  Keep the discovery trigger disabled until hydration so early opening clicks are
  not lost before client handlers attach.

### Patch Changes


## 1.0.0

### Patch Changes

- 5a7bfcf: Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.

  Preserve an archive-verified npm provisioning placeholder on `latest` while publishing its first beta to `next`.
- 83762ab: Isolate private Blog revision history across account and authorization changes, and suppress cached history while identity resolution fails or remains pending. Bound Search snippet input before processing malformed markup to limit server work.
- Updated dependencies [5a7bfcf]
- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0

## 1.0.0-beta.2

### Patch Changes

- Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.
- Updated dependencies
  - @btst/stack@6.2.0-beta.1

## 1.0.0-beta.1

### Patch Changes

- 83762ab: Isolate private Blog revision history across account and authorization changes, and suppress cached history while identity resolution fails or remains pending. Bound Search snippet input before processing malformed markup to limit server work.
- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0-beta.0
