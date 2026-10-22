---
'@tanstack/query-core': patch
---

Honor explicit `fetchStatus` filters in `QueryClient.isFetching` and framework `useIsFetching` equivalents. Omitted or undefined statuses still default to `fetching`.
