# @btst/plugin-crm

## 1.1.0-beta.1

### Patch Changes

- Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.
- Updated dependencies
  - @btst/plugin-kanban@1.1.0-beta.1
  - @btst/stack@6.2.0-beta.1

## 1.1.0-beta.0

### Minor Changes

- dd14356: Add optional deal ownership using the existing Kanban task assignee, a trusted application staff directory, explicitly authorized assignment with concurrent-edit protection, and owner filters in pipeline and deal views. Require CRM assignment operations for linked task reassignment, and document migration and separate workspace access policies.
- 79f157c: Add manager review of duplicate contacts and companies, explicit field conflict choices, and transactional merges that preserve declared relationships and audit history. Preserve merged contact email aliases for Helpdesk matching. Requires schema migration and normalization/revision backfill before enabling merges, plus an adapter with isolated transactions and enforced foreign keys.

### Patch Changes

- Updated dependencies [75fc257]
- Updated dependencies [dd14356]
- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/plugin-kanban@1.1.0-beta.0
  - @btst/stack@6.2.0-beta.0

## 1.0.0

- Release the extracted plugin after beta validation with Core >=6.0.0 <7.0.0 support.

## 1.0.0-beta.0

Extract CRM with its existing Kanban relationship for BTST core v6.
