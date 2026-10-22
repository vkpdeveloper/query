---
id: important-defaults
title: Important Defaults
ref: docs/framework/react/guides/important-defaults.md
---

[//]: # 'StructuralSharing'

- Solid Query stores query results in a reactive store. **Reconciliation is disabled by default.** Set `reconcile` to a key such as `'id'` to preserve matching items with Solid's reconciliation, or provide an `(oldData, newData) => resolvedData` function for custom reconciliation.

- Reconciliation runs when defined query data changes, including data from `select` or cache updates. Fetch status changes, errors, and repeated results with the same data reference do not run reconciliation again. The first reconciliation receives `undefined` as `oldData`, and changing the query key or query client starts reconciliation with `undefined` again so data from different queries is not merged.

[//]: # 'StructuralSharing'
[//]: # 'Materials'
[//]: # 'Materials'
