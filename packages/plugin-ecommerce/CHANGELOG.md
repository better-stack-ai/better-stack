# @btst/plugin-ecommerce

## 1.2.0-beta.1

### Patch Changes

- Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.
- Updated dependencies
  - @btst/plugin-cms@1.2.0-beta.1
  - @btst/plugin-media@1.1.0-beta.1
  - @btst/stack@6.2.0-beta.1

## 1.2.0-beta.0

### Minor Changes

- 78d330f: Add optional payment-provider refund capabilities and authorized full-order refund administration with persisted attempts, verified outcomes, and reconciliation. Refunds preserve fulfillment and inventory state.
- db73f26: Add opt-in digital fulfillment from verified paid orders with durable item grants, protected downloads, expiring guest capabilities, delivery recovery, and refund or cancellation revocation. Show delivery status and purchaser download controls in order pages.

### Patch Changes

- Updated dependencies [75fc257]
- Updated dependencies [559543f]
- Updated dependencies
- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/plugin-cms@1.2.0-beta.0
  - @btst/plugin-media@1.1.0-beta.0
  - @btst/stack@6.2.0-beta.0

## 1.1.0

### Minor Changes

- Add read-only page AI context with authorized order counts and active filters, excluding customer records and checkout credentials.
- Add optional browser referral capture and verified payment conversion bridges. Persist attribution privately through asynchronous checkout; use original paid amounts and stable entity references for commission retries.

## 1.0.1

### Patch Changes

- Share payment provider adapters through Core and add signed asynchronous checkout for School and Calendar. Ecommerce retains its existing exports. School payment adapters now use the shared asynchronous contract; migrate synchronous payment callbacks and add the documented nullable payment-state columns before upgrading persistent databases.
- Updated dependencies
  - @btst/stack@6.1.0

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

Initial independent package for core v6, preserving Ecommerce behavior, CMS data, and optional Media registration.
