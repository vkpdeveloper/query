---
'@tanstack/query-core': patch
---

Honor explicit `fetchStatus` filters in `QueryClient.isFetching` and the framework hooks that use it, including `useIsFetching`. Omitted or `undefined` statuses continue to default to `'fetching'`.
