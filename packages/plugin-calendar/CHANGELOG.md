# @btst/plugin-calendar

## 1.2.0

### Minor Changes

- Add optional browser referral capture and verified payment conversion bridges. Persist attribution privately through asynchronous checkout; use original paid amounts and stable entity references for commission retries.

## 1.1.0

### Minor Changes

- Share payment provider adapters through Core and add signed asynchronous checkout for School and Calendar. Ecommerce retains its existing exports. School payment adapters now use the shared asynchronous contract; migrate synchronous payment callbacks and add the documented nullable payment-state columns before upgrading persistent databases.
- Prepare the feature-variant and Calendar rescheduling APIs required by Analytics bridges. Add optional rescheduled confirmation context while retaining existing notification callbacks.

### Patch Changes

- Updated dependencies
  - @btst/stack@6.1.0

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

- Extract existing Calendar booking, availability and host-management APIs and UI for core v6.
