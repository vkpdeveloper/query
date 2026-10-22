---
'@tanstack/react-query': patch
---

Apply the latest query options before resubscribing when an Activity tree is revealed, preventing requests for query keys that changed while hidden.
