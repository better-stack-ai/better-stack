# @btst/stack

## 6.2.2

### Patch Changes

- d6e06c2: Validate successful Search responses, keep async states outside the dialog listbox,
  and bound the native dialog to small viewports. Add result/loading presentation
  callbacks while retaining Search-owned accessibility, navigation and recovery.
  Document local embedded state using the existing scoped router mechanism and
  refresh the ejectable Search registry views.
  
  Restore case-insensitive phrase highlighting in result titles and previews, and
  export SearchHighlight for custom rows receiving the current query.
  
  Keep the discovery trigger disabled until hydration so early opening clicks are
  not lost before client handlers attach.

## 6.2.1

### Patch Changes

- Render prefetched native Blog pages without page-wide Suspense so large static pages remain visible before JavaScript runs. Preserve permission checks, client error handling, and route lifecycle hooks. Keep lazy registry routes unchanged and update the CLI installation set to select the compatible Core and Blog fixes.

## 6.2.0

### Minor Changes

- 78d330f: Add optional payment-provider refund capabilities and authorized full-order refund administration with persisted attempts, verified outcomes, and reconciliation. Refunds preserve fulfillment and inventory state.

### Patch Changes

- 5a7bfcf: Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.

  Preserve an archive-verified npm provisioning placeholder on `latest` while publishing its first beta to `next`.
- de9a5b5: Commit Next.js search-parameter updates before notifying list-state subscribers, fixing stale filtered lists after loading a URL with existing search parameters.

## 6.2.0-beta.1

### Patch Changes

- Preserve a verified npm provisioning placeholder on `latest` during initial beta publication to `next`.

- Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.

## 6.2.0-beta.0

### Minor Changes

- 78d330f: Add optional payment-provider refund capabilities and authorized full-order refund administration with persisted attempts, verified outcomes, and reconciliation. Refunds preserve fulfillment and inventory state.

### Patch Changes

- de9a5b5: Commit Next.js search-parameter updates before notifying list-state subscribers, fixing stale filtered lists after loading a URL with existing search parameters.

## 6.1.0

### Minor Changes

- Share payment provider adapters through Core and add signed asynchronous checkout for School and Calendar. Ecommerce retains its existing exports. School payment adapters now use the shared asynchronous contract; migrate synchronous payment callbacks and add the documented nullable payment-state columns before upgrading persistent databases.

## 6.0.0

- Release the shared Core v6 runtime after beta validation. Feature implementations and standalone components remain in their independently versioned packages.

## 6.0.0-beta.0

- Begin the independently versioned plugin migration and expose shared page context from core. Feature import replacements are a breaking migration; runtime IDs and stored data remain stable.
