---
"@btst/plugin-cms": patch
---

Reduce reverse-relationship round trips with bounded source-cursor scans and filter scheduled public records before transferring their bodies. Declare reverse-lookup and source-lookup indexes in the CMS schema; existing SQL applications must generate and apply an ORM migration to install them.
