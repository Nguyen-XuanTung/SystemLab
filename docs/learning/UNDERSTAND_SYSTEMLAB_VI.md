# Hiểu Sâu SystemLab Từ Lõi Mô Phỏng Đến Giao Diện (Hướng dẫn Học Code)

> **Mục tiêu:** Tài liệu tự học bằng tiếng Việt giúp bạn nắm chắc 100% cách SystemLab hoạt động từ lúc bấm nút **Run** đến khi vẽ xong từng biểu đồ, lý thuyết mô phỏng sự kiện rời rạc (DES), các design pattern áp dụng, giới hạn mô hình hiện tại và 6 bài tập tự code để làm chủ codebase.

---

## 1. Bức tranh toàn cảnh: Điều gì xảy ra khi bấm nút **Run**?

Khi người dùng nhấn **Run** trên `TopToolbar` (`src/features/workspace/TopToolbar.tsx`), dữ liệu đi qua đúng 5 tầng trách nhiệm tách biệt:

1. **Workspace & Graph Snapshot (`src/store/workspaceStore.ts`):**
   - Lấy đồ thị hiện tại (`nodes`, `edges`), cấu hình workload (RPS, thời lượng, loại phân phối đến, seed) và danh sách chaos faults đang bật.
   - Đẩy qua tầng kiểm tra hợp lệ `validateGraph` (`src/engine/validation/validator.ts`). Nếu đồ thị có chu trình (cycle) bị thuật toán Kahn phát hiện hoặc thiếu node nguồn `client` / thông số sai, mô phỏng dừng trước khi chạy và báo lỗi rõ ràng.
2. **Điều phối Worker (`src/store/simulationStore.ts` → `src/workers/workerClient.ts`):**
   - `SimulationWorkerClient` tăng biến đếm `currentRunId` lên `+1` để vô hiệu hóa mọi message trễ từ lần chạy trước (**runId fencing**).
   - Gửi command `WorkerCommand` (`src/workers/protocol.ts`) sang `src/workers/simulation.worker.ts` (hoặc chạy trực tiếp trên main thread bằng fallback nếu môi trường không có `Worker`).
3. **Vòng chạy phân mảnh (`src/workers/runner.ts`):**
   - `WorkerSessionRunner` khởi tạo `SimulationEngine` (`src/engine/core/engine.ts`).
   - Chia quá trình chạy thành từng lát (slice) tối đa `LIVE_SLICE_MAX_EVENTS = 5_000` (khi xem trực tiếp) hoặc `HEADLESS_SLICE_MAX_EVENTS = 25_000` (khi chạy hết tốc lực / compare).
   - Giữ nhịp gửi telemetry về UI mỗi `TELEMETRY_FRAME_MS = 50` ms để vừa mượt 20 FPS vừa không nghẽn postMessage.
4. **Lõi Discrete-Event Simulation (`src/engine/`):**
   - `SimulationEngine` lấy từng `SimEvent` có timestamp nhỏ nhất từ `MinHeap`, đẩy `VirtualClock.advanceTo(event.timestampMs)` tiến lên, xử lý sự kiện (tạo request, qua gateway/LB, hit/miss cache, xếp hàng `G/G/c/K`, timeout, retry, fault injection...) và ghi nhận vào `MetricsCollector`.
5. **Render & Persistence (`src/features/` + `src/features/persistence/`):**
   - `useSimulationStore` chỉ chấp nhận frame có `runId === currentRunId`, cập nhật node metrics trên `ArchitectureCanvas`, biểu đồ Recharts trong `ChartsPanel`, log sự kiện trong `EventLogPanel` và request trace trong `RequestTraceModal`.
   - Cấu trúc dự án và danh sách thí nghiệm được lưu local qua `SystemLabDatabase` (Dexie / IndexedDB, fallback bộ nhớ khi thiếu IndexedDB) với schema `ProjectFileV1Schema` (`SCHEMA_VERSION = 1`).

---

## 2. Cấu trúc thư mục theo trách nhiệm (Relative Paths)

```text
src/
├── app/                     # Shell chính kết nối palette, canvas, inspector, bottom dock (App.tsx)
├── components/ui/           # Primitive UI tái sử dụng (ComponentIcon, StatusBadge)
├── engine/                  # 100% Pure TypeScript — CẤM React, DOM, IndexedDB, Zustand, Math.random()
│   ├── core/                # clock.ts (VirtualClock), minHeap.ts (MinHeap), engine.ts (SimulationEngine)
│   ├── events/              # types.ts (SimulationEventType, EVENT_PRIORITY, compareSimEvents)
│   ├── metrics/             # collector.ts (MetricsCollector, computeR7Percentile)
│   ├── models/              # types.ts (DEFAULT_SAFETY_LIMITS), nodeRegistry.ts (10 node types)
│   ├── policies/            # faults.ts (FaultManager)
│   ├── random/              # prng.ts (SeededRng: SplitMix32 -> xoshiro128**)
│   └── validation/          # validator.ts (validateGraph + Kahn cycle detection)
├── features/
│   ├── canvas/              # ArchitectureCanvas, SystemNode, TrafficEdge
│   ├── experiments/         # ExperimentsPanel (Baseline vs Variant comparison)
│   ├── fault-injection/     # ChaosLabPanel
│   ├── monitoring/          # OverviewPanel, ChartsPanel, EventLogPanel, RequestTraceModal
│   ├── node-library/        # ComponentPalette
│   ├── persistence/         # db.ts (Dexie SystemLabDatabase), repository.ts
│   ├── scenarios/           # scenarios.ts (10 kịch bản 01–10), glossary.ts (16 thuật ngữ), UI views
│   └── workspace/           # TopToolbar, PropertiesInspector, SettingsDialog, AboutView, GuidedTutorial
├── lib/                     # format.ts (formatMs, formatPct, formatRps...), layout.ts (applyDagreLayout)
├── schemas/                 # projectSchema.ts (stripDangerousKeys, MAX_IMPORT_BYTES, Zod v1)
├── store/                   # workspaceStore.ts, simulationStore.ts, experimentStore.ts
├── styles/                  # tokens.css (CSS variables --sl-*), index.css
└── workers/                 # protocol.ts, runner.ts, simulation.worker.ts, workerClient.ts
```

---

## 3. Từ đồ thị UI sang mô hình mô phỏng

Mỗi **Node** trên React Flow (`@xyflow/react`) tương ứng một thực thể mô hình hóa trong `COMPONENT_DEFINITIONS` (`src/engine/models/nodeRegistry.ts`) với `ComponentType` gồm 10 loại:
- **Traffic & Entry:** `client`, `load_balancer`, `api_gateway`
- **Compute & Resilience:** `app_server`, `circuit_breaker`, `worker`
- **Data & Async:** `cache`, `database`, `read_replica`, `message_queue`

Mỗi **Edge** mang trọng số/điều hướng (routing weight / connection) và có thể chịu lỗi mạng (như drop link từ Chaos Lab). Khi chạy `validateGraph`:
- Kiểm tra đồ thị có bị vòng lặp hay không bằng **thuật toán Kahn (topological sort)** — vì HTTP request DAG không được phép quay vòng vô hạn.
- Kiểm tra ngưỡng số học (RPS >= 0, concurrency >= 1, xác suất trong `[0, 1]`, latency không âm...) và tính kết nối hợp lệ.
- Trong lúc chạy thật vẫn có thêm **lớp bảo vệ thứ hai** (`DEFAULT_SAFETY_LIMITS` trong `src/engine/models/types.ts`):
  - `maxEvents: 500_000` (tránh treo trình duyệt)
  - `maxZeroTimeEvents: 10_000` (phát hiện vòng lặp zero-latency)
  - `maxHops: 64` (chặn nhảy hop vô tận)
  - `maxInFlight: 100_000` (giới hạn bộ nhớ request đang bay)

---

## 4. Lõi Discrete-Event Simulation (DES) & Hàng đợi Ưu tiên

### Vì sao DES tốt hơn vòng lặp tick cố định (`setInterval`)?
Nếu dùng tick `1 ms`, giả sử trong `100 ms` đầu không có request nào tới thì vòng lặp vẫn phải quay 100 lần vô ích; ngược lại nếu 2 sự kiện xảy ra ở `10.12 ms` và `10.45 ms`, tick `1 ms` làm mất độ chính xác thứ tự.

**DES** nhảy trực tiếp qua các mốc thời gian có sự kiện thực sự xảy ra:
- **Đồng hồ ảo (`VirtualClock` — `src/engine/core/clock.ts`):** `nowMs`, `advanceTo()`, `reset()`. Không bao giờ đọc `Date.now()` hay `performance.now()` để tính thời gian request! Nhờ vậy, chỉnh playback speed `1x`, `4x`, hay chạy headless không làm sai lệch 1 micro-giây nào của kết quả.
- **Hàng đợi ưu tiên (`MinHeap<T>` — `src/engine/core/minHeap.ts`):** Tự cài binary min-heap để `push`/`pop` đạt $O(\log n)$, giữ thứ tự bằng comparator `compareSimEvents` (`src/engine/events/types.ts`):
  1. So sánh `timestampMs` tăng dần (xảy ra trước xử lý trước).
  2. Nếu trùng `timestampMs`, so sánh `EVENT_PRIORITY` (xác định thứ tự nhân quả hợp lý tại cùng thời điểm).
  3. Nếu trùng tiếp, so sánh `sequence` tăng đơn điệu (FIFO tuyệt đối, không bao giờ mơ hồ).

### Định nghĩa Event Ordering & Determinism (`SeededRng`)
- `src/engine/random/prng.ts` dùng **SplitMix32** để băm seed số nguyên không âm thành state 128-bit cho **xoshiro128\*\*** — PRNG cực nhanh, chu kỳ $2^{128}-1$, chất lượng thống kê tốt hơn nhiều so với LCG đơn giản và hoàn toàn tách khỏi `Math.random()`.
- Hỗ trợ `.fork()` để sinh nhánh PRNG con theo từng node/mục đích: thay đổi thông số phân phối của một node không làm xáo trộn ngẫu nhiên ngoài ý muốn ở nơi khác nếu seed phân nhánh độc lập.
- Sinh thời gian đến & thời gian xử lý thông qua `nextFloat()`, `nextExponentialMs()`, `nextServiceTimeMs()`.

---

## 5. Vòng đời một Request & Bất biến Bảo toàn

Một HTTP logical request bắt đầu từ node `client`, nhận một `requestId` duy nhất và ghi nhận bộ đếm `generated + 1`. Khi đi qua các node trung gian:
1. **Load Balancing:** Chọn nhánh hạ nguồn (`round_robin`, `random`, hoặc `least_in_flight` tùy cấu hình LB).
2. **Circuit Breaker:** Nếu số lỗi liên tiếp đạt `failureThreshold`, chuyển trạng thái mở và fail-fast ngay lập tức thay vì dồn tải chết vào upstream.
3. **Cache (`cache`):** Kiểm tra xác suất hit (`FaultManager.getEffectiveCacheHitRatio()` có tính đến fault giảm cache hit nếu Chaos Lab đang bật). Hit thì trả về ngay với latency cache; Miss thì đẩy tiếp xuống DB/origin.
4. **Queueing (`G/G/c/K`):** Tại server/DB/replica có giới hạn `concurrency = c` và `queueCapacity = K`:
   - Nếu có slot rảnh (`active < c`): xử lý ngay (`serviceTime` lấy từ `SeededRng.nextServiceTimeMs()`).
   - Nếu bận hết nhưng queue còn chỗ (`queued < K`): xếp hàng chờ; khi xong 1 job sẽ pop job tiếp theo (FIFO) và kiểm tra xem request đã bị timeout trong lúc chờ chưa.
   - Nếu queue đầy (`queued >= K`): reject ngay (queue overflow failure).
5. **Timeout & Retry:** Mỗi timeout timer là một event riêng trên `MinHeap`. Khi request hoàn thành quá hạn hoặc timer nổ trước, chỉ lần chuyển trạng thái đầu tiên thắng cuộc. Khi retry, request vẫn giữ nguyên **`requestId` gốc**.
6. **Message Queue Async (`message_queue` -> `worker`):** HTTP request gửi vào hàng đợi bất đồng bộ xem như đã ack thành công ở nhánh HTTP khi vào queue; phần `worker` tiêu thụ job nền phía sau được chạy tách biệt để không cộng đúp vào HTTP request count.

Nhờ kỷ luật trạng thái kết thúc đơn nhất (terminal state guard), **bất biến bảo toàn luôn đúng ở mọi bước**:
$$\text{generated} = \text{succeeded} + \text{failed} + \text{timedOut} + \text{inFlight}$$

---

## 6. Metrics, Bộ nhớ giới hạn & Điểm tối ưu Hiệu năng Thực tế

Trong `src/engine/metrics/collector.ts`:
- **Bounded Memory:** Tránh rò rỉ RAM khi chạy 100k requests bằng 4 giới hạn cứng:
  - `MAX_LATENCY_RESERVOIR = 50_000` (reservoir sampling bằng `SeededRng` giữ phân phối mẫu đại diện).
  - `MAX_EVENT_LOG = 500` sự kiện log gần nhất.
  - `MAX_TRACE_HISTORY = 200` trace request gần nhất.
  - `MAX_TIME_SERIES_POINTS = 600` điểm chuỗi thời gian (gộp bucket tự động nếu phiên chạy dài).
- **Tính phân vị R-7 (`computeR7Percentile`):** Thuật toán nội suy tuyến tính R-7 chuẩn thống kê (giống `numpy.percentile` mặc định / R `quantile(..., type=7)`), cho p50, p95, p99 mượt và chính xác trên mảng mẫu đã sắp xếp.
- **Bài học Root-Cause Performance Fix (đáng nhớ khi đi phỏng vấn!):**
  - Ban đầu, vòng lặp `step()`, `handleMetricsTick()` và `handleRequestCreated()` của engine gọi `getGlobalMetrics()` để lấy chỉ số kiểm tra ngưỡng an toàn `inFlight` và tiến độ event — nhưng `getGlobalMetrics()` lại đi copy + sort toàn bộ reservoir latency (tối đa `50_000` phần tử) trên *từng event*, biến độ phức tạp mỗi bước thành $O(N \log N)$ và khiến suite 10 kịch bản chạy quá timeout `>5s`.
  - **Cách sửa triệt để:** Tách hai hàm $O(1)$ là `getProcessedEventCount()` và `getInFlightCount()`, chỉ chạy tính quantile/sort khi thực sự xuất telemetry snapshot (`TELEMETRY_FRAME_MS = 50`) hoặc kết thúc mô phỏng. Kết quả suite unit chạy chỉ còn ~`189 ms` và `100k` requests hoàn thành dưới `700 ms`.

---

## 7. Web Worker Architecture, Fairness & Persistence Security

1. **Web Worker + `runId` Fencing (`src/workers/workerClient.ts`):**
   - Người dùng bấm **Run** lần 1 rồi đổi ý bấm **Reset / Run** lần 2 ngay lập tức: message cũ của Worker 1 có thể vẫn đang nằm trong hàng đợi postMessage trình duyệt. Mọi packet `WorkerResponse` đều mang `runId`; UI chỉ cần so sánh `res.runId === currentRunId`, loại bỏ frame lỗi thời trong $O(1)$.
   - Nếu trình duyệt/test JSdom không hỗ trợ Web Worker, `workerClient.ts` tự động chạy qua fallback trên main thread dùng chính `WorkerSessionRunner` nên hành vi test và production nhất quán 100%.
2. **So sánh thí nghiệm công bằng (`computeFairnessWarnings` trong `src/store/experimentStore.ts`):**
   - Trong thực nghiệm kỹ thuật, đổi cả kiến trúc lẫn traffic/seed một lúc sẽ gây kết luận sai. Khi so sánh Baseline và Variant B, `computeFairnessWarnings` tự kiểm tra xem **seed**, **duration** hay **workload** có bị khác nhau không để cảnh báo thẳng cho người học.
3. **Bảo vệ Import JSON (`src/schemas/projectSchema.ts`):**
   - Kiểm tra kích thước tối đa `MAX_IMPORT_BYTES = 2 * 1024 * 1024` (`2 MB`) trước khi parse sâu.
   - Đệ quy loại bỏ khóa nguy hiểm `__proto__`, `constructor`, `prototype` qua `stripDangerousKeys` chống Prototype Pollution.
   - Validate chặt bằng `ProjectFileV1Schema` / `ExperimentRecordSchema` (Zod v4) và hàm migrate version (`migrateProjectPayload`). Không bao giờ `eval` hay thực thi code từ JSON.

---

## 8. Những giới hạn hiện tại của mô hình (Hiểu rõ để không nói quá)

1. **Đồ thị DAG không có chu trình HTTP:** Thuật toán Kahn chặn cycle để ngăn deadlock request vòng; kiến trúc có feedback loop phức tạp (ví dụ microservice A gọi B rồi B gọi lại A theo path khác nhau) chưa được mô phỏng trực tiếp.
2. **Giả lập mạng đơn giản hóa:** Link latency chưa mô phỏng băng thông chia sẻ (congestion/TCP slow start/packet fragmentation), chủ yếu tập trung vào queueing delay tại node + fault drop/spike trên edge.
3. **Cache model xác suất:** Cache hit dựa trên hit ratio cấu hình (`0..1`) + suy giảm fault chứ chưa duy trì bảng key-value LRU/LFU thực của từng key cụ thể.
4. **Autoscaling & Multi-region:** Chưa có auto-scaler tự động tăng giảm instance theo CPU utilization theo thời gian thực hay mô phỏng độ trễ đồng bộ Raft/Paxos giữa nhiều region.

---

## 9. 6 Bài tập thực hành tự nâng cấp SystemLab (Hands-on Exercises)

Làm các bài sau trên một nhánh git thử nghiệm để làm chủ hoàn toàn SystemLab:

1. **Bài 1 (Dễ — UI & Registry):** Thêm một preset kịch bản thứ 11 vào `BUILT_IN_SCENARIOS` (`src/features/scenarios/scenarios.ts`) mô phỏng **Rate Limiting API Gateway + App Server + DB** đang bị burst traffic, rồi chạy `npm run test` xem bài test kiểm tra registry (`tests/unit/scenarios/scenarios.test.ts`) có tự pass hết không.
2. **Bài 2 (Trung bình — Engine Metrics):** Tại `src/engine/metrics/collector.ts`, viết thêm một trường tính **tail-latency spike ratio (`p99 / p50`)** trong snapshot và hiển thị nó ở `OverviewPanel.tsx` (nhớ giữ `—` khi số mẫu = `0` theo đúng `AGENTS.md`).
3. **Bài 3 (Trung bình — Queueing Policy):** Thêm tùy chọn thuật toán cân bằng tải **Random** hoặc **Least-Loaded** trong node `load_balancer` (sử dụng `SeededRng`, tuyệt đối không dùng `Math.random()`) và viết test chứng minh hai thuật toán cho kết quả xác định với cùng seed.
4. **Bài 4 (Khá — Chaos Lab):** Thêm một fault type mới vào `FaultManager` (`src/engine/policies/faults.ts`), ví dụ `packet_duplication` hoặc `gc_pause` theo chu kỳ, kèm unit test kiểm chứng request conservation vẫn giữ nguyên `100%`.
5. **Bài 5 (Khá — Schema Migration):** Giả lập `SCHEMA_VERSION = 2` bằng cách thêm một trường cấu hình tùy chọn vào `ProjectFileV1Schema`, viết hàm nâng cấp ở `migrateProjectPayload` (`src/schemas/projectSchema.ts`) và bổ sung unit test vào `tests/unit/schemas/schemaAndSecurity.test.ts` để đảm bảo file `v1` cũ import vào vẫn hợp lệ.
6. **Bài 6 (Nâng cao — Performance Profiling):** Chạy `npm run benchmark`, thử tăng giới hạn tải lên `200_000` requests trong một script nháp và dùng Node `--cpu-prof` kiểm tra xem hàm nào chiếm CPU nhiều nhất (gợi ý: quan sát `MinHeap.pop()` và reservoir insertion trong `collector.ts`).
