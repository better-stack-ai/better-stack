---
"@btst/plugin-blog": patch
"@btst/plugin-search": patch
---

Isolate private Blog revision history across account and authorization changes, and suppress cached history while identity resolution fails or remains pending. Bound Search snippet input before processing malformed markup to limit server work.
