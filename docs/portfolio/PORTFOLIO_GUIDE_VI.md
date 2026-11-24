# Hướng dẫn Showcase Portfolio & Đóng gói Dự án — SystemLab

> **Mục tiêu tài liệu:** Giúp chủ sở hữu dự án (`Nguyen Xuan Tung`, sinh viên năm 3 ngành CNTT) hiểu rõ giá trị kỹ thuật của **SystemLab**, trình bày trung thực khi ứng tuyển thực tập Software Engineering / Backend / Frontend / Distributed Systems, demo trôi chảy trong 3–5 phút và publish hoàn chỉnh lên GitHub + GitHub Pages.

---

## 1. Tóm tắt giá trị cốt lõi của SystemLab

- **Tên dự án:** SystemLab — *Design. Simulate. Break. Understand.*
- **Bài toán giải quyết:** Khi học System Design qua sách vở hay vẽ sơ đồ tĩnh (Excalidraw, diagrams.net), người học rất khó *nhìn thấy* điều gì xảy ra khi traffic tăng vượt capacity, khi cache miss spike tạo thundering herd vào database, hay khi circuit breaker ngắt mạch để ngăn cascading failure. SystemLab biến sơ đồ kiến trúc thành một **môi trường thí nghiệm mô phỏng sự kiện rời rạc (Discrete-Event Simulation — DES)** chạy trực tiếp trong trình duyệt:
  - Kéo thả 10 loại thành phần hạ tầng thực thụ (`client`, `load_balancer`, `api_gateway`, `app_server`, `cache`, `database`, `message_queue`, `worker`, `circuit_breaker`, `read_replica`).
  - Cấu hình latency distribution (`exponential`, `normal`, `uniform`, `constant`), concurrency, queue capacity, timeout, retry policy, cache hit ratio & TTL, circuit breaker thresholds.
  - Bơm tải (workload), tiêm lỗi chủ động (Chaos Lab: kill node, spike latency, degrade cache, drop link), đo lường p50/p95/p99 latency, throughput, error rate, utilization, request trace và so sánh A/B nhiều phương án kiến trúc (kèm cảnh báo công bằng khi thay seed/duration/workload).
- **Định vị trung thực:** Đây là **công cụ mô phỏng phục vụ học tập và kiểm chứng giả thuyết thiết kế ở mức khái niệm**, không phải công cụ thay thế load testing hay capacity planning trên hạ tầng production thực tế.
- **Triết lý thiết kế:** Local-first, privacy-first, deterministic, không cần tài khoản, không phụ thuộc AI API hay backend trả phí.

---

## 2. Tại sao chọn kiến trúc này? (Architecture & Trade-offs)

| Quyết định kiến trúc | Phương án thay thế đã cân nhắc | Lý do chọn & Đánh đổi |
|---|---|---|
| **Discrete-Event Simulation (`MinHeap` + `VirtualClock`)** | Fixed time-step loop (`setInterval` mỗi 10ms) | DES nhảy cóc thẳng tới timestamp sự kiện tiếp theo nên nhanh hơn nhiều ở workload thưa và hoàn toàn bất biến theo tốc độ phát lại UI hoặc Web Worker batching (`TELEMETRY_FRAME_MS = 50`). Đánh đổi: logic event handler cần kỷ luật ưu tiên sự kiện `(timestampMs, priority, sequence)`. |
| **Pure TypeScript `src/engine/` tách biệt khỏi UI** | Đặt logic mô phỏng chung trong Zustand store hoặc React hooks | Bảo đảm 100% có thể test bằng Vitest ở Node, không phụ thuộc DOM/React, tái sử dụng được ở Web Worker và CLI benchmark (`scripts/benchmark.ts`). Được kiểm soát cứng bằng rule ESLint + `AGENTS.md`. |
| **Dedicated Web Worker + monotonic `runId` fencing** | Chạy thẳng trên main thread | Tránh block UI thread khi mô phỏng 10k–100k requests; nếu trình duyệt/test môi trường thiếu `Worker`, `SimulationWorkerClient` tự động fallback sang main-thread `WorkerSessionRunner` đồng bộ theo chunk. `runId` tăng đơn điệu giúp vứt bỏ frame cũ từ run trước. |
| **Client-side PRNG (`SeededRng`: SplitMix32 → xoshiro128\*\*)** | `Math.random()` | `Math.random()` không tái lập được thí nghiệm. `SeededRng` với `.fork()` tạo luồng ngẫu nhiên độc lập theo seed và từng component, đảm bảo cùng graph + config + seed luôn ra kết quả giống hệt nhau. |
| **Dexie (IndexedDB) + `localStorage` fallback** | Backend PostgreSQL / Cloud API | Đạt mục tiêu zero-backend, local-first, deploy miễn phí dạng static SPA trên GitHub Pages; có `safeParseProjectJson` (giới hạn `2 MB`, `stripDangerousKeys` chống prototype pollution, Zod `schemaVersion: 1`) bảo vệ khi import JSON chia sẻ. |
| **Bounded telemetry memory** | Lưu toàn bộ mọi request & time-series không giới hạn | Giới hạn cứng reservoir latency `50_000` mẫu, `500` event logs gần nhất, `200` request traces, `600` điểm time-series giúp trình duyệt không bị OOM ở bài chạy dài. |

---

## 3. Điểm nhấn kỹ thuật & Con số kiểm chứng thực tế

> Mọi số liệu dưới đây trích từ các báo cáo kiểm chứng thực chạy trên workspace local (Node + Chrome Playwright). Không có bất kỳ số liệu ước đoán hay fabricate nào.

1. **Bất biến bảo toàn request logic (Conservation Invariant):**
   $$\text{generated} = \text{succeeded} + \text{failed} + \text{timedOut} + \text{inFlight}$$
   - Các lần retry vẫn dùng chung `requestId` ban đầu nên không làm phình số lượng `generated`.
   - Job nền được sinh ra sau `message_queue` sang `worker` chạy bất đồng bộ riêng, tách bạch hoàn toàn với HTTP request counters để tránh đếm trùng.
2. **Độ chính xác hàng đợi & phân vị:**
   - Hỗ trợ hàng đợi đa server `G/G/c/K` với kiểm chứng giải tích `M/M/1` / Little's Law (`tests/unit/engine/`).
   - Tính phân vị p50/p95/p99 bằng **R-7 linear interpolation** trên latency reservoir đã sắp xếp.
3. **Tối ưu hiệu năng thực tế (root-cause fix đã commit):**
   - Trong quá trình tối ưu engine, việc gọi `getGlobalMetrics()` bên trong từng vòng `step()`, `handleMetricsTick()`, `handleRequestCreated()` từng gây sắp xếp lại reservoir liên tục (khiến suite 10 kịch bản vượt ngưỡng timeout >5s). Sau khi chuyển sang hàm O(1) `getProcessedEventCount()` và `getInFlightCount()`, bộ unit test chạy lại gọn gàng và benchmark cho thấy engine xử lý:
     - **1,000 requests:** `~13.68 ms`
     - **10,000 requests:** `~63.26 ms`
     - **100,000 requests:** `~676.62 ms`
     - **25-node topology (5,000 reqs):** `~32.84 ms`
     - Toàn bộ kịch bản benchmark đều bảo toàn request conservation (`conserved: true`).
4. **Chất lượng kiểm thử & bảo mật:**
   - **Unit + Integration (Vitest):** 14 file test, 57 tests, độ bao phủ ~`90.80%` statements, `81.94%` branches, `97.44%` functions, `94.25%` lines.
   - **E2E (Playwright + Chrome thực):** Kiểm tra tương tác kéo thả/kịch bản/mô phỏng/dock không có console error hay page error.
   - **Security (`npm audit` & static scan):** 0 lỗ hổng đã biết, không dùng `eval`/`new Function`/`dangerouslySetInnerHTML`, có Zod schema validation + `stripDangerousKeys`.

*(Lưu ý: Xem con số cập nhật mới nhất ở `FINAL_RELEASE_REPORT.md` và `docs/verification/` sau lần verify cuối cùng.)*

---

## 4. Hướng dẫn Demo 3–5 phút ấn tượng trước Nhà tuyển dụng

Xem kịch bản lời thoại chi tiết từng giây tại [DEMO_SCRIPT_VI.md](../learning/DEMO_SCRIPT_VI.md). Tóm tắt 4 bước cốt lõi:

1. **0:00–0:45 — Hook & Kiến trúc trực quan:** Mở SystemLab, nạp sẵn một Scenario có sẵn (ví dụ kịch bản bottleneck hoặc cache-aside). Giới thiệu ngắn: *"Thay vì vẽ diagram tĩnh, mỗi node trên canvas là một thực thể có hàng đợi, giới hạn kết nối và bộ sinh số ngẫu nhiên theo seed chạy trong Web Worker."*
2. **0:45–2:00 — Chạy mô phỏng & Tiêm lỗi (Chaos Lab):** Bấm **Run**, chỉ vào biểu đồ live time-series (Throughput, p50/p95/p99, Error Rate). Chuyển sang **Chaos Lab**, kích hoạt fault (ví dụ hạ cache hit ratio hoặc ngắt một node), quan sát latency tăng vọt và lỗi lan truyền ngay trên topology.
3. **2:00–3:15 — Sửa kiến trúc & So sánh A/B (Experiments):** Thêm `read_replica` hoặc `cache` / chỉnh timeout hoặc circuit breaker, bấm **Run** lại cùng seed/workload, lưu **Experiment Baseline vs Variant B**, mở tab **Experiments** để chỉ ra delta p95 latency và error rate thay đổi đo được bằng số thực — đồng thời chỉ tính năng **Fairness Warning** nếu lỡ đổi seed hoặc duration.
4. **3:15–4:15 — Request Trace & Deterministic Architecture:** Bấm vào một request trong trace list để xem từng hop (`enqueue`, `start`, `finish`, `timeout`), kết thúc bằng việc nhấn mạnh tách biệt `src/engine/` pure TypeScript khỏi React UI.

---

## 5. Danh sách Source File nên đọc kỹ trước khi phỏng vấn

Đọc theo thứ tự từ lõi mô phỏng ra ngoài giao diện (dùng đường dẫn tương đối trong repo):

1. `src/engine/core/engine.ts` — Trái tim DES: vòng lặp `step()`, `runUntil()`, xử lý sự kiện tạo/nhận/hoàn tất/timeout/retry request và tiêm fault.
2. `src/engine/core/minHeap.ts` & `src/engine/events/types.ts` — Hàng đợi ưu tiên O(log n) và quy tắc phá hòa `(timestampMs, priority, sequence)`.
3. `src/engine/random/prng.ts` — `SeededRng` (`SplitMix32` → `xoshiro128**`), `.fork()` và sinh thời gian phân phối xác suất.
4. `src/engine/metrics/collector.ts` — Bộ thu thập metric giới hạn bộ nhớ, R-7 quantile, time-series bucketing và `getProcessedEventCount()` O(1).
5. `src/engine/policies/faults.ts` & `src/engine/validation/validator.ts` — Cơ chế Chaos Lab và phát hiện chu trình DAG bằng thuật toán Kahn.
6. `src/workers/runner.ts` & `src/workers/workerClient.ts` — Điều phối Web Worker, throttle telemetry `50 ms`, `runId` fencing và main-thread fallback.
7. `src/schemas/projectSchema.ts` — Bảo vệ import JSON (`MAX_IMPORT_BYTES`, `stripDangerousKeys`, Zod `v1`).
8. `src/store/workspaceStore.ts`, `simulationStore.ts`, `experimentStore.ts` — Quản lý state undo/redo 50 bước, so sánh thí nghiệm và `computeFairnessWarnings`.
9. `src/features/canvas/ArchitectureCanvas.tsx` — Tích hợp `@xyflow/react` v13, `SystemNode`, `TrafficEdge` và auto-layout Dagre.

---

## 6. Gợi ý CV Bullet Points (Tiếng Anh — Trung thực & Chuẩn Kỹ thuật)

> **Nguyên tắc trung thực:** Không bịa lượng người dùng thật, GitHub stars hay nhận đã tự tay gõ từng dòng code không có công cụ hỗ trợ. Diễn đạt đúng vai trò thiết kế kiến trúc, triển khai, kiểm chứng và sử dụng AI coding workflow như một đòn bẩy năng suất có kiểm soát chất lượng.

### Lựa chọn 1 — Nhấn mạnh Software / Fullstack / Frontend Engineering
- **SystemLab — Interactive Distributed Systems Simulator** (`TypeScript`, `React 19`, `Web Workers`, `@xyflow/react`, `Zustand`, `Vitest`, `Playwright`)
  - Architected and shipped a local-first discrete-event simulation playground using a pure TypeScript engine (`src/engine/`) strictly isolated from React/DOM and offloaded to a Web Worker with monotonic `runId` fencing and automatic main-thread fallback.
  - Designed deterministic experiment reproduction using a `SplitMix32`/`xoshiro128**` PRNG (`SeededRng`), bounded-memory R-7 percentile metrics (`50k` latency reservoir), DAG cycle validation (Kahn's algorithm), and `50`-step undo/redo persistence via IndexedDB (`Dexie`).
  - Eliminated a hot-path sorting bottleneck inside the DES step loop (verified via unit & benchmark runs reaching `~63 ms` for `10k` requests and `~677 ms` for `100k` requests while preserving strict request conservation).
  - Verified reliability across unit, integration, analytical queueing, and headless Chrome E2E suites (`57` Vitest tests, `>90%` statement coverage) plus Zod import hardening against prototype pollution (`stripDangerousKeys`, `2 MB` cap).

### Lựa chọn 2 — Rút gọn 2–3 dòng cho CV thực tập sinh (1 trang)
- **SystemLab — Deterministic System Design Simulator** (*Open-Source Personal Project, AI-Assisted Workflow*): Built a browser-based discrete-event system simulator (`TypeScript`, `React`, `Web Workers`, `Vitest`, `Playwright`) featuring 10 modeled infrastructure nodes, fault injection, request-hop tracing, and A/B experiment comparison; isolated a pure TS DES engine (`100k` requests in `<700 ms`) with verified analytical queueing invariants and prototype-pollution-safe JSON schema persistence.

*(Mẹo phỏng vấn: Nếu nhà tuyển dụng hỏi có dùng AI khi làm không, hãy trả lời thẳng thắn: bạn đóng vai trò Product Architect / Reviewer định nghĩa invariants, kiểm chứng lỗi hiệu năng, review từng boundary bảo mật/Worker/test và dùng AI assistant tăng tốc code & tài liệu — điều quan trọng nhất là bạn giải thích được từng dòng trong `engine.ts` và chứng minh qua test suite.)*

---

## 7. Cấu hình GitHub Repository & Quy trình Publish

### Repository Description gợi ý
> Local-first deterministic discrete-event system design simulator — Design architectures, run workloads, inject chaos faults, trace requests, and compare A/B experiments right in the browser.

### GitHub Topics gợi ý (12–15 tags)
`system-design`, `distributed-systems`, `discrete-event-simulation`, `architecture-simulator`, `chaos-engineering`, `typescript`, `react`, `react-flow`, `web-workers`, `vitest`, `playwright`, `local-first`, `open-source`, `educational-tool`

### Checklist từng bước đưa lên GitHub & GitHub Pages
1. **Kiểm tra thông tin chủ sở hữu:**
   - Mở `LICENSE` ở thư mục gốc, kiểm tra lại tên copyright holder (`Nguyen Xuan Tung`) và năm bản quyền.
   - Mở `SECURITY.md` nếu muốn bổ sung email hoặc kênh GitHub Security Advisories thay cho hướng dẫn mặc định.
   - Xác nhận `.ai-local/` không bị git track (`git ls-files .ai-local` phải rỗng).
2. **Tạo repository mới trên GitHub** (ví dụ tên `SystemLab`, để Public nếu muốn showcase portfolio).
3. **Kết nối remote và push nhánh `main`:**
   ```bash
   git remote add origin https://github.com/<your-username>/SystemLab.git
   git push -u origin main
   ```
4. **Kiểm tra GitHub Actions CI (`.github/workflows/ci.yml`):**
   - Vào tab **Actions** trên GitHub, xác nhận workflow CI chạy `lint`, `typecheck`, `test`, `build` và `e2e` xanh toàn bộ.
5. **Bật GitHub Pages (`.github/workflows/deploy-pages.yml`):**
   - Vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
   - Nếu deploy ở URL dạng `https://<username>.github.io/SystemLab/`, workflow `deploy-pages.yml` cần biến môi trường `VITE_BASE_PATH="/SystemLab/"` (hoặc `/<ten-repo>/`). Đã kiểm chứng trước ở local với `VITE_BASE_PATH='/SystemLab/' npm run build` thành công.
   - Nếu deploy ở root domain (`https://<username>.github.io/` hoặc custom domain), đặt `VITE_BASE_PATH="/"`.
6. **Ghim lên GitHub Profile:** Pin repo `SystemLab`, gắn Website URL là link GitHub Pages, dán các topics ở trên và kiểm tra ảnh preview `README.md` hiển thị sắc nét từ `docs/assets/`.
