# @btst/plugin-helpdesk

## 1.0.0-beta.2

### Patch Changes

- Fix consecutive Blog editorial decisions staying stale when framework refreshes replace the protected editor snapshot. Editorial saves and revision restores refresh their authorized query data without overlapping route refreshes. Preserve identity, endpoint, and authorization-generation isolation.

  Reduce duplicate GitHub ownership lookups within each fresh release-gate observation. Publish the complete coordinated corrective beta installation set together.
- Updated dependencies
  - @btst/stack@6.2.0-beta.1

## 1.0.0-beta.1

### Minor Changes

- 8fedef0: Add private file attachments to customer replies, agent replies, and internal notes through application-owned storage. Validate upload ownership and message association, recheck download authorization, and provide upload progress, retry, and removal controls.
- 6dd9a64: Add ticket subject and conversation search to the customer portal and agent inbox. Customer matches and counts remain scoped to owned public conversations; authorized agents can also search internal notes.
- 57ce430: Add opt-in notification lifecycle bridges for Comments, Kanban, Calendar, Feedback, and Helpdesk, with preference-aware delivery and CLI auto-wiring when Notifications is selected. Add Feedback status and Helpdesk message/update hooks, excluding internal notes from requester notifications.

### Patch Changes

- Updated dependencies [78d330f]
- Updated dependencies [de9a5b5]
  - @btst/stack@6.2.0-beta.0
