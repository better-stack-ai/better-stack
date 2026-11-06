# @btst/plugin-ecommerce

## 1.0.1

### Patch Changes

- Share payment provider adapters through Core and add signed asynchronous checkout for School and Calendar. Ecommerce retains its existing exports. School payment adapters now use the shared asynchronous contract; migrate synchronous payment callbacks and add the documented nullable payment-state columns before upgrading persistent databases.
- Updated dependencies
  - @btst/stack@6.1.0

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

Initial independent package for core v6, preserving Ecommerce behavior, CMS data, and optional Media registration.
