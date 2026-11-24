# Data Model & Persistence Schema — SystemLab

---

## 1. Versioned JSON Schema (`src/schemas/projectSchema.ts`)

- **Current Schema Version:** `1`
- **Maximum Import Size:** `2 MB` (`2 * 1024 * 1024` bytes)
- **Sanitization Pipeline:**
  1. Verify UTF-8 byte size `<= MAX_IMPORT_BYTES`.
  2. Parse JSON cleanly, catching syntax errors.
  3. Recursively rebuild plain objects/arrays while dropping dangerous prototype-pollution keys (`__proto__`, `constructor`, `prototype`).
  4. Validate against strict Zod `ProjectFileV1Schema` (or `ExperimentExportFileV1Schema`).
  5. Verify referential integrity of node IDs, edge `source`/`target` endpoints, and bounded node/edge counts (`<= 100` nodes, `<= 300` edges).

---

## 2. Core Entities

### `SystemLabProject`
- `schemaVersion`: `1`
- `id`: `string`
- `name`: `string` (1–120 chars)
- `description`: `string`
- `scenarioId?`: `string`
- `nodes`: `PersistedNode[]` (position + `SimNode` data)
- `edges`: `SimEdge[]`
- `simConfig`: `{ seed: number; durationMs: number; drainOnEnd: boolean; maxDrainMs: number }`
- `scheduledFaults`: `ScheduledFault[]`
- `createdAt`: ISO timestamp
- `updatedAt`: ISO timestamp

### `ExperimentRecord`
Immutable snapshot stored for side-by-side comparison:
- `schemaVersion`: `1`
- `id`: `string`
- `name`: `string`
- `projectId`: `string`
- `projectName`: `string`
- `engineVersion`: `string` (`"1.0.0"`)
- `seed`: `number`
- `durationMs`: `number`
- `drainOnEnd`: `boolean`
- `graphSnapshot`: `{ nodes: SimNode[]; edges: SimEdge[] }`
- `faultTimeline`: `ScheduledFault[]` (includes scheduled + any manually injected faults converted to exact virtual timestamps)
- `summaryMetrics`: `GlobalMetrics`
- `nodeMetrics`: `Record<string, NodeMetrics>`
- `timeSeries`: `TimeSeriesPoint[]` (capped `<= 600`)
- `createdAt`: ISO timestamp

---

## 3. IndexedDB Storage (`SystemLabDB` via Dexie)

Database name: `SystemLabDB`, version `1`:
- **`projects` store:** indexed by `id`, `updatedAt`, `name`
- **`experiments` store:** indexed by `id`, `projectId`, `createdAt`

User preferences (theme `dark | light`, visualization mode `normal | reduced_motion | high_speed`, snap-to-grid, tutorial completion flag) are stored cleanly under a single versioned `localStorage` key (`systemlab:prefs:v1`) with fallback handling if storage access throws.

**Storage Disclaimer:** Browser IndexedDB is local to the device/browser profile and can be cleared by the user or browser storage eviction. Users should export important projects and experiments as JSON files for durable backup.
