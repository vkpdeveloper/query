---
id: important-defaults
title: Important Defaults
ref: docs/framework/react/guides/important-defaults.md
---

[//]: # 'StructuralSharing'

- Solid Query stores query results in a reactive store. Reconciliation is disabled by default. Set `reconcile` to a string key (for example, `'id'`) or a function `(oldData, newData) => resolvedData` to preserve references between data updates.

- Reconciliation runs when defined observer data changes. Fetch-status updates and option updates that leave the data unchanged preserve the previously reconciled value. When switching queries, `oldData` is `undefined`; placeholder data is also excluded from the next data update's `oldData`.

[//]: # 'StructuralSharing'
[//]: # 'Materials'
[//]: # 'Materials'
