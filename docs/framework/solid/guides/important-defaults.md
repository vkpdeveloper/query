---
id: important-defaults
title: Important Defaults
ref: docs/framework/react/guides/important-defaults.md
---

[//]: # 'StructuralSharing'

- Query results by default are **structurally shared to detect if data has actually changed** and if not, **the data reference remains unchanged** to better help with value stabilization. If this concept sounds foreign, then don't worry about it! 99.9% of the time you will not need to disable this and it makes your app more performant at zero cost to you.

- A custom `reconcile` callback runs for defined data updates, including refetches that return the same value. Fetch-status and staleness changes reuse the reconciled data without calling the callback. Switching query keys or query clients starts reconciliation with `oldData` set to `undefined`.

[//]: # 'StructuralSharing'
[//]: # 'Materials'
[//]: # 'Materials'
