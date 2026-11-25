# User Guide — SystemLab

## 1. Quick Start Workflow

1. **Choose or Design a Topology:** Start with the preloaded `01 — Hello, System Design` scenario or open the **Scenarios** view to load any of the 14 built-in architectures (10 core distributed-systems scenarios plus 4 **VCraft Case Study** scenarios).
2. **Add & Connect Components:** Drag components from the left **Components** library onto the canvas (or click any component button for keyboard-accessible insertion). Drag from a right output handle to a left input handle to connect nodes.
3. **Configure Parameters:** Click a node or edge to open the right **Inspector**. Adjust rates, concurrency, queue limits, cache hit probability, or link latency. Switch to the **Learn** tab anytime for theory and simplifications.
4. **Check Validation:** The validation pill in the top bar highlights blocking DAG errors (e.g., missing client, cycle) vs. non-blocking warnings. Click an issue to jump directly to the node or edge.
5. **Run & Observe:** Click **Run** (or press `Space`). Watch live metrics in **Overview**, time-series curves in **Charts**, and filtered warnings/traces in **Event Log**.

---

## 2. Using Chaos Lab

Open the **Chaos Lab** bottom tab:

- **Before Running:** Add scheduled faults at specific virtual timestamps (e.g., crash `app-2` at `5s` for `7s`). Watch the horizontal fault timeline track update.
- **While Running or Paused:** Inject live faults immediately at the current virtual clock (`node_failure`, `latency_spike`, `capacity_drop`, `traffic_spike`, `packet_drop`, `cache_cold_start`, `edge_latency_spike`, `edge_failure`) and click **Recover Now** at any point.

---

## 3. Comparing Experiments Fairly

1. Run your Baseline topology and open the **Experiments** tab.
2. Enter a descriptive name and click **Save Snapshot**.
3. Click **Reset**, make a targeted architecture or config change (keeping the same **Seed** and **Duration**), and run again.
4. Save the second snapshot as **Candidate**.
5. Review the comparison table and chart. Pay attention to any yellow **Comparison Fairness Notice** if seeds, durations, or workloads differ.

---

## 4. Backing Up Work

Projects and experiments save automatically to your browser's **IndexedDB**. Because browser storage can be cleared by privacy tools or OS disk cleanup, use **Project Menu → Export JSON** and **Experiments → Export JSON** for portable backups.
