---
'@tanstack/solid-query': patch
---

Avoid repeated reconciliation for unchanged query data and reset reconciliation when switching queries so data from different query keys is not merged.
