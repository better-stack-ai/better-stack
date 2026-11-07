---
"@btst/plugin-crm": minor
---

Add manager review of duplicate contacts and companies, explicit field conflict choices, and transactional merges that preserve declared relationships and audit history. Preserve merged contact email aliases for Helpdesk matching. Requires schema migration and normalization/revision backfill before enabling merges, plus an adapter with isolated transactions and enforced foreign keys.
