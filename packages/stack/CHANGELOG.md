# @btst/stack

## 6.1.0

### Minor Changes

- Share payment provider adapters through Core and add signed asynchronous checkout for School and Calendar. Ecommerce retains its existing exports. School payment adapters now use the shared asynchronous contract; migrate synchronous payment callbacks and add the documented nullable payment-state columns before upgrading persistent databases.

## 6.0.0

- Release the shared Core v6 runtime after beta validation. Feature implementations and standalone components remain in their independently versioned packages.

## 6.0.0-beta.0

- Begin the independently versioned plugin migration and expose shared page context from core. Feature import replacements are a breaking migration; runtime IDs and stored data remain stable.
