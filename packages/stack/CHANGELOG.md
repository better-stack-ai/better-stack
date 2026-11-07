# @btst/stack

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
