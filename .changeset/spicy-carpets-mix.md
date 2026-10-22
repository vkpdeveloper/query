---
'@tanstack/query-persist-client-core': patch
---

Remove persisted entries with missing or null query state without interrupting query restoration or garbage collection. Preserve valid queries whose data is null.
