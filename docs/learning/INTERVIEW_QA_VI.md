# Ngân hàng Hỏi Đáp Phỏng vấn Kỹ thuật — SystemLab (58 Câu hỏi theo 13 Chủ đề)

> Toàn bộ câu trả lời dưới đây gắn trực tiếp với mã nguồn thực tế trong SystemLab. Mục tiêu giúp bạn trả lời sắc bén, trung thực về thiết kế, bất biến toán học, tối ưu hiệu năng và đánh đổi kỹ thuật.

---

## Chủ đề 1: Product Vision & Định vị Sản phẩm

### Q1. SystemLab giải quyết bài toán gì mà các công cụ vẽ diagram như Excalidraw hay diagrams.net chưa giải quyết được?
Excalidraw và diagrams.net là công cụ vẽ hình tĩnh: bạn vẽ một cái Cache hay Load Balancer nhưng không thấy được queue đầy ra sao khi RPS tăng gấp đôi. SystemLab biến mỗi node trong kiến trúc thành một thực thể có hành vi (`ComponentType`, hàng đợi `G/G/c/K`, timeout, retry, fault injection) chạy qua lõi Discrete-Event Simulation để đo latency, error rate, throughput và failure propagation ngay trên trình duyệt.

### Q2. Ai là người dùng mục tiêu của SystemLab?
Sinh viên CNTT học môn Hệ phân tán, Junior/Backend Engineers luyện phỏng vấn System Design, và giảng viên muốn minh họa trực tiếp hiệu ứng nghẽn cổ chai, cache stampede, hay circuit breaker theo thời gian thực.

### Q3. SystemLab có thể thay thế load testing như k6, JMeter hoặc Locust trước khi lên production không?
**Không**, và điều này được ghi rõ trong triết lý sản phẩm cũng như `docs/KNOWN_LIMITATIONS.md`. SystemLab dùng mô hình trừu tượng hóa để học và kiểm chứng giả thuyết thiết kế (nhanh, miễn phí, zero-infra), không mô phỏng OS kernel scheduling, TCP congestion, garbage collection thực hay hardware I/O contention.

### Q4. Vì sao bạn chọn hướng local-first, không bắt buộc login và không dùng AI API?
1) Quyền riêng tư và độ tin cậy cao: mở trình duyệt là dùng ngay không cần server backend hay trả tiền API key.
2) Deploy dễ dàng thành static SPA trên GitHub Pages.
3) Mô phỏng hệ phân tán cần tính **tái lập xác định (deterministic)** bằng toán học và PRNG có seed, không phải dùng LLM đoán kết quả.

---

## Chủ đề 2: System Design Concepts được mô phỏng

### Q5. Làm sao SystemLab chứng minh được giá trị của Cache-Aside trước Database?
Trong kịch bản có `cache` đứng trước `database`, request hit cache đi qua nhanh theo `cacheHitRatio` (cấu hình thực + tác động từ `FaultManager.getEffectiveCacheHitRatio()`), chỉ phần cache miss đi xuống `database`. Khi tăng `client` RPS hoặc giảm hit ratio, utilization và queue của `database` tăng vọt theo quan hệ phi tuyến của lý thuyết hàng đợi.

### Q6. `read_replica` giảm tải cho `database` chính bằng cơ chế nào trong mô hình?
Tỷ lệ read traffic đi vào `read_replica` thay vì đổ 100% vào primary `database`, giúp giảm arrival rate $\lambda$ vào node primary, hạ mức sử dụng $\rho = \lambda / (c \cdot \mu)$ và giữ queue length ổn định lâu hơn khi traffic tăng.

### Q7. `circuit_breaker` hoạt động như thế nào để chống cascading failure?
Khi upstream lỗi liên tiếp hoặc tỷ lệ lỗi vượt ngưỡng cấu hình, `circuit_breaker` chuyển trạng thái ngắt mạch, fail-fast request với latency tối thiểu thay vì giữ connection chờ timeout, giúp dịch vụ hạ nguồn có thời gian hồi phục và giải phóng thread/connection slot cho toàn hệ thống.

### Q8. Vì sao `message_queue` + `worker` giúp giảm tail latency cho HTTP request?
HTTP request khi đi tới `message_queue` coi như ack thành công ở biên đồng bộ nếu queue còn sức chứa, không phải chờ `worker` xử lý job nặng hoàn tất. Phần `worker` tiêu thụ job nền chạy bất đồng bộ tách khỏi bộ đếm HTTP request, minh họa đúng pattern asynchronous decoupling.

### Q9. Retry không kiểm soát gây hại gì trong SystemLab (Retry Storm)?
Mỗi lần retry vẫn giữ nguyên `requestId` gốc nhưng phát sinh thêm lượt gọi xuống node hạ nguồn đang quá tải, làm tăng effective arrival rate $\lambda_{\text{eff}}$, đẩy queue capacity $K$ tràn nhanh hơn và kéo p95/p99 lên cực cao nếu không đi kèm timeout hợp lý hoặc circuit breaker.

---

## Chủ đề 3: Architecture & Module Boundaries

### Q10. Nguyên tắc tách lớp quan trọng nhất trong SystemLab là gì?
Nguyên tắc **Engine Isolation (`AGENTS.md` & `src/engine/`)**: thư mục `src/engine/` phải là 100% Pure TypeScript — nghiêm cấm import React, DOM (`window`, `document`), IndexedDB, Zustand, `setTimeout` hay gọi `Math.random()`.

### Q11. Làm sao bạn đảm bảo đội ngũ (hoặc bản thân sau này) không vô tình vi phạm nguyên tắc cách ly `src/engine/`?
Bên cạnh quy ước trong `AGENTS.md`, cấu hình ESLint (`npm run lint`) có rule kiểm soát việc import các module UI/browser bên trong `src/engine/`, đồng thời toàn bộ engine chạy trực tiếp trên Vitest môi trường Node (không có DOM) để phát hiện phụ thuộc ngầm ngay lập tức.

### Q12. Dữ liệu từ UI đi qua những lớp nào để chạy một phiên mô phỏng?
`TopToolbar` / UI → `useWorkspaceStore` (lấy graph + faults) → `validateGraph` (`src/engine/validation/validator.ts`) → `useSimulationStore` → `SimulationWorkerClient` (`src/workers/workerClient.ts`) → `simulation.worker.ts` → `WorkerSessionRunner` (`src/workers/runner.ts`) → `SimulationEngine` (`src/engine/core/engine.ts`) → snapshot qua `WorkerResponse` ngược về `useSimulationStore`.

### Q13. State frontend được chia làm mấy Zustand store và vì sao tách như vậy?
Chia làm 3 store (`src/store/`):
1) `workspaceStore.ts`: đồ thị React Flow, inspector config, undo/redo history 50 bước, autosave.
2) `simulationStore.ts`: trạng thái chạy run/pause/speed, live snapshot metrics, worker lifecycle & `runId`.
3) `experimentStore.ts`: danh sách các `ExperimentRecord` đã lưu, baseline/variant selection và `computeFairnessWarnings`.
Tách store giúp thao tác telemetry frame 50ms ở `simulationStore` không trigger re-render không cần thiết cho editor history hay danh sách experiments.

### Q14. Nhánh `src/schemas/` và `src/features/persistence/` đóng vai trò gì?
`src/schemas/projectSchema.ts` là hàng rào kiểm soát cấu trúc dữ liệu JSON import/export (`ProjectFileV1Schema`, `ExperimentRecordSchema`, `migrateProjectPayload`), còn `src/features/persistence/` (`db.ts`, `repository.ts`) quản lý lưu trữ local bằng `SystemLabDatabase` (Dexie IndexedDB) kèm cơ chế cảnh báo fallback bộ nhớ nếu IndexedDB không khả dụng.

---

## Chủ đề 4: Discrete-Event Simulation (DES) Kernel

### Q15. Discrete-Event Simulation khác gì với vòng lặp mô phỏng theo bước thời gian cố định (Time-Step Loop)?
Time-step loop cập nhật trạng thái theo từng tick cố định (ví dụ mỗi 1ms), lãng phí CPU khi không có sự kiện và thiếu chính xác khi nhiều sự kiện rơi trong cùng 1ms. DES nhảy thẳng đồng hồ `VirtualClock` tới timestamp nhỏ nhất tiếp theo trong `MinHeap`, vừa nhanh vừa chính xác tuyệt đối theo thứ tự nhân quả.

### Q16. Cấu trúc dữ liệu cốt lõi của bộ lập lịch sự kiện trong `src/engine/` là gì?
`MinHeap<T>` (`src/engine/core/minHeap.ts`) lưu `SimEvent` (`src/engine/events/types.ts`). Độ phức tạp thao tác `push()` và `pop()` là $O(\log N)$, `peek()` là $O(1)$, đủ nhẹ để chạy `100_000` requests trong chưa tới 1 giây.

### Q17. Khi hai sự kiện xảy ra tại cùng một `timestampMs` y hệt nhau, engine quyết định thứ tự bằng cách nào?
Qua hàm `compareSimEvents` (`src/engine/events/types.ts`) so sánh theo 3 cấp từ điển:
1) `timestampMs` tăng dần.
2) `EVENT_PRIORITY` (ưu tiên theo ngữ nghĩa hệ thống tại cùng thời điểm).
3) `sequence` tăng đơn điệu (FIFO tuyệt đối theo thứ tự lập lịch, loại bỏ mọi mơ hồ khi đồng hạng).

### Q18. `VirtualClock` (`src/engine/core/clock.ts`) đảm bảo điều gì?
Thời gian mô phỏng chỉ tiến tới (`advanceTo`) hoặc reset (`reset`), hoàn toàn độc lập với đồng hồ hệ thống thực (`Date.now()`, `performance.now()`). Nhờ vậy tăng tốc độ xem lên 4x, 10x hay dừng Pause giữa chừng hoàn toàn không làm lệch dù chỉ 1 mili-giây kết quả.

### Q19. Engine ngăn chặn vòng lặp vô tận (infinite loop / stack overflow) bằng cơ chế nào?
Áp dụng phòng thủ hai lớp:
- **Trước khi chạy:** `validateGraph` (`src/engine/validation/validator.ts`) dùng thuật toán Kahn phát hiện cycle trong đồ thị DAG.
- **Trong lúc chạy:** `DEFAULT_SAFETY_LIMITS` (`src/engine/models/types.ts`) giới hạn cứng `maxEvents: 500_000`, `maxZeroTimeEvents: 10_000`, `maxHops: 64`, `maxInFlight: 100_000`.

### Q20. Vì sao phải đặt riêng giới hạn `maxZeroTimeEvents: 10_000`?
Nếu một chuỗi sự kiện sinh mới đều có delay `0 ms` (ví dụ cấu hình latency = 0 kết hợp retry không backoff), `VirtualClock` sẽ đứng yên ở một mốc timestamp trong khi `MinHeap` nổ sự kiện liên tục. `maxZeroTimeEvents` giúp phát hiện và ngắt ngay trước khi tab trình duyệt treo.

---

## Chủ đề 5: Determinism, Seeded PRNG & Request Conservation

### Q21. Làm sao đảm bảo cùng một kiến trúc, workload và seed luôn ra kết quả giống hệt nhau trên mọi máy?
Mọi tính toán ngẫu nhiên (arrival inter-arrival time, service latency, cache hit/miss, reservoir sampling, lỗi ngẫu nhiên) đều đi qua `SeededRng` (`src/engine/random/prng.ts`), không dùng `Math.random()`, kết hợp với `VirtualClock` và thứ tự `compareSimEvents` xác định tuyệt đối.

### Q22. Thuật toán PRNG nào được chọn trong `SeededRng` và vì sao dùng cặp SplitMix32 + xoshiro128\*\*?
Seed ban đầu được mở rộng bằng **SplitMix32** để khởi tạo trạng thái 128-bit đồng đều (kể cả khi người dùng nhập seed nhỏ như `1`, `42`), sau đó sinh số ngẫu nhiên bằng **xoshiro128\*\*** vì tốc độ rất cao bằng phép toán bit 32-bit trên JavaScript và có tính phân bố tốt, kèm `.fork()` để cô lập luồng PRNG con.

### Q23. Bất biến bảo toàn request (`Request Conservation Invariant`) trong SystemLab là gì?
Ở mọi thời điểm và khi kết thúc mô phỏng:
$$\text{generated} = \text{succeeded} + \text{failed} + \text{timedOut} + \text{inFlight}$$
Mỗi request logic chỉ được phép chuyển sang **tối đa một trạng thái kết thúc** (`succeeded`, `failed`, hoặc `timed_out`).

### Q24. Retry ảnh hưởng thế nào đến bất biến bảo toàn?
Nếu một request bị lỗi lần 1 và được retry, nó vẫn dùng chung `requestId` gốc và không tăng thêm `generated`. Trạng thái kết thúc cuối cùng chỉ được chốt một lần khi hết retry hoặc thành công, hoặc timeout xảy ra trước.

### Q25. Làm sao job bất đồng bộ từ `message_queue` sang `worker` không làm sai lệch bất biến bảo toàn HTTP?
Khi HTTP request tới `message_queue`, nhánh HTTP xem như ack thành công ở queue. Job nền đẩy cho `worker` chạy qua vòng đời job bất đồng bộ riêng, không cộng vào biến `generated` của HTTP request từ `client`.

---

## Chủ đề 6: Queueing Theory & Metrics Calculation

### Q26. Mô hình hàng đợi trong SystemLab thuộc loại nào?
Là mô hình đa server có giới hạn hàng đợi **G/G/c/K**:
- $G$ (General arrival): phân phối thời gian đến tùy chọn (Poisson/exponential, constant...).
- $G$ (General service): phân phối thời gian xử lý (`fixed`, `exponential`, `lognormal`).
- $c$: `concurrency` (số request xử lý song song tại node).
- $K$: `queueCapacity` (số chỗ chờ tối đa trước khi bị reject vì tràn queue).

### Q27. Bạn đã kiểm chứng tính đúng đắn toán học của mô hình hàng đợi bằng cách nào?
Trong `tests/unit/engine/` (và tài liệu `docs/verification/SIMULATION_VALIDATION.md`), các bài test giải tích A–H đối chiếu kết quả mô phỏng của hệ M/M/1 và Little's Law ($L = \lambda \cdot W$) với giá trị lý thuyết, kiểm tra boundary overflow khi $\lambda > \mu$, và kiểm tra tính bất biến khi đổi tốc độ phát lại UI.

### Q28. Tại sao tính p50/p95/p99 bằng thuật toán R-7 linear interpolation (`computeR7Percentile`) thay vì lấy phần tử `Math.floor(0.95 * n)` đơn giản?
R-7 (`computeR7Percentile` trong `src/engine/metrics/collector.ts`) nội suy tuyến tính giữa hai điểm lân cận khi cỡ mẫu vừa phải (giống chuẩn của NumPy và R `quantile type=7`), giúp đồ thị p95/p99 mượt và ít bị nhảy bậc giả khi mẫu còn ít.

### Q29. Hệ thống xử lý hàng trăm nghìn request bằng cách nào mà không bị tràn RAM trong `MetricsCollector`?
Dùng bộ nhớ giới hạn cố định: `MAX_LATENCY_RESERVOIR = 50_000` (reservoir sampling giữ phân phối đồng đều trên toàn bộ chuỗi mẫu), `MAX_EVENT_LOG = 500`, `MAX_TRACE_HISTORY = 200` và `MAX_TIME_SERIES_POINTS = 600` (tự động gộp bucket khi thời gian mô phỏng dài).

### Q30. Khi chưa có mẫu latency nào (`count === 0`), UI hiển thị thế nào?
Theo rule #3 của `AGENTS.md`, không bao giờ bịa số `0 ms` hay giá trị fallback; UI sử dụng helper trong `src/lib/format.ts` để hiển thị rõ `—` khi số mẫu bằng `0`.

---

## Chủ đề 7: Chaos Lab & Failure Propagation

### Q31. Các loại lỗi nào có thể tiêm trong Chaos Lab (`FaultManager` — `src/engine/policies/faults.ts`)?
Hỗ trợ tác động trực tiếp vào node và link trong khi chạy hoặc theo lịch trình: ngắt node (node down / kill), tăng vọt độ trễ (latency spike), làm suy giảm tỷ lệ cache hit (`getEffectiveCacheHitRatio`), hoặc cắt kết nối mạng (drop link).

### Q32. `FaultManager` kiểm soát vòng đời lỗi thế nào để không phá tính xác định của DES?
Việc bật/hết hạn fault (`activateFault`, `expireFault`, `injectFault`, `recoverFault`) được đưa vào lịch sự kiện theo `VirtualClock` chứ không dùng `setTimeout` của trình duyệt. Vì vậy một bài thí nghiệm Chaos Lab chạy lại với cùng cấu hình thời điểm tiêm lỗi sẽ cho kết quả giống hệt nhau.

### Q33. Làm sao người dùng quan sát được hiện tượng "cascading failure" trong SystemLab?
Ví dụ khi giảm cache hit ratio trong Chaos Lab: lượng request miss tăng vọt dồn thẳng xuống `database` → utilization của `database` chạm 100% → `queue` của `database` đầy và `wait time` tăng mạnh → các `app_server` bị giữ kết nối chờ DB cho tới khi timeout → toàn bộ `inFlight` và `errorRate` lan ngược lên `api_gateway` và `client`. Người dùng thấy rõ hiệu ứng này trên màu sắc topology, time-series charts và request trace hops.

---

## Chủ đề 8: Frontend, React Flow & UX Accessibility

### Q34. Thách thức khi dùng `@xyflow/react` v13 (`13.0.3`) với TypeScript là gì?
Ở v13, callback `OnNodesChange` làm việc với kiểu `NodeChangeset` (cung cấp `.toArray()`, `.applyTo(nodes)`) thay vì mảng thô như các bản cũ. Việc bọc gọn logic trong `ArchitectureCanvas.tsx` giúp code sạch, type-safe và không làm rò rỉ API React Flow vào `src/engine/`.

### Q35. Làm thế nào React Canvas mượt khi có telemetry cập nhật liên tục từ Worker?
1) Worker tự throttle tối đa 1 snapshot mỗi `TELEMETRY_FRAME_MS = 50` ms (20 FPS) thay vì gửi từng sự kiện lẻ.
2) Các node custom (`SystemNode.tsx`) dùng `React.memo` và chọn state chi tiết (fine-grained Zustand selectors) để tránh re-render toàn bộ cây UI khi chỉ metric thay đổi.

### Q36. Tính năng Auto-layout đồ thị sử dụng thư viện nào?
Dùng `@dagrejs/dagre` qua hàm `applyDagreLayout` (`src/lib/layout.ts`) để sắp xếp các node theo tầng từ `client` sang phải gọn gàng chỉ bằng một click.

### Q37. Hệ thống hỗ trợ Dark/Light mode, Responsive và Accessibility thế nào?
- Toàn bộ màu sắc dùng CSS custom properties `var(--sl-*)` trong `src/styles/tokens.css`, không hardcode mã hex trong component React.
- Hỗ trợ phím tắt Undo/Redo (`50` bước), `aria-label` đầy đủ, vòng focus bàn phím rõ nét và media query `prefers-reduced-motion` để tắt hiệu ứng động khi người dùng yêu cầu.
- Đã kiểm thử thực tế trên Playwright Chrome ở các viewport desktop, tablet (`1024x768`) và mobile (`390x844`), không lỗi console.

---

## Chủ đề 9: Web Worker & Performance Engineering

### Q38. Giao thức giao tiếp giữa Main Thread và Web Worker được thiết kế ra sao?
Định nghĩa chặt chẽ bằng discriminated unions `WorkerCommand` và `WorkerResponse` trong `src/workers/protocol.ts`, được xử lý bởi `WorkerSessionRunner` (`src/workers/runner.ts`) và bọc bởi `SimulationWorkerClient` (`src/workers/workerClient.ts`).

### Q39. `runId` fencing trong `workerClient.ts` giải quyết race condition nào?
Khi người dùng bấm **Run**, sau đó bấm **Reset** hoặc đổi kịch bản bấm **Run** mới ngay lập tức, worker cũ có thể đã kịp postMessage 1–2 snapshot trễ vào queue sự kiện trình duyệt. `SimulationWorkerClient` giữ `currentRunId` tăng đơn điệu và bỏ qua mọi `WorkerResponse` có `runId !== currentRunId`, triệt tiêu hoàn toàn lỗi UI hiển thị số liệu ma của lần chạy trước.

### Q40. Tại sao `WorkerSessionRunner` có chế độ `LIVE_SLICE_MAX_EVENTS = 5_000` và `HEADLESS_SLICE_MAX_EVENTS = 25_000`?
Khi chạy xem trực tiếp (`live`), slice nhỏ hơn (`5_000` events) giúp nhả CPU đều để cập nhật đồ thị 50ms/lần cho mắt nhìn chuyển động mượt. Khi chạy so sánh hoặc benchmark/headless (`runToCompletion`), slice lớn (`25_000`) giảm chi phí lặp và đồng bộ frame, hoàn thành nhanh tối đa.

### Q41. Hãy kể lại một bug hiệu năng thực tế bạn tìm ra và sửa triệt để trong quá trình phát triển SystemLab?
Trong quá trình tối ưu `src/engine/`, chúng tôi phát hiện bộ test 10 kịch bản bị timeout `>5s`. Truy vết gốc rễ cho thấy `step()`, `handleMetricsTick()` và `handleRequestCreated()` đang gọi `getGlobalMetrics()` ở mỗi event — mà `getGlobalMetrics()` lại đi copy và sort toàn bộ latency reservoir (tối đa `50_000` phần tử) để tính percentile! Sau khi tách thành hai hàm $O(1)$ là `getProcessedEventCount()` và `getInFlightCount()` trong `MetricsCollector` (`src/engine/metrics/collector.ts`) và chỉ sort khi xuất snapshot, bộ test tụt từ timeout xuống dưới `1 giây`, và `100_000` requests chỉ mất `~853 ms` (`~849k events/s`) trong benchmark cuối.

### Q42. Vì sao cần script `scripts/benchmark.ts` tách riêng khỏi bộ unit test?
Unit test cần chạy rất nhanh trong CI và khẳng định tính đúng đắn logic, trong khi `npm run benchmark` đo wall-clock latency trên `1k`, `10k`, `100k` requests, topology 25 node, bão lỗi và bão hàng đợi — đồng thời khẳng định cả `conserved: true` trên tải nặng.

---

## Chủ đề 10: Security, Validation & Local Persistence

### Q43. Những rủi ro bảo mật nào có thể xảy ra khi cho phép người dùng import file JSON kiến trúc từ người khác?
1) **Prototype Pollution:** Payload chứa khóa `__proto__`, `constructor`, `prototype`.
2) **Memory DoS:** Import file JSON hàng trăm MB làm treo tab trình duyệt.
3) **Malformed Data / Type Confusion:** Dữ liệu thiếu trường hoặc sai kiểu gây crash runtime hoặc NaN trong engine.

### Q44. SystemLab chặn đứng các rủi ro trên bằng những cơ chế cụ thể nào trong `src/schemas/projectSchema.ts`?
1) Chặn sớm theo dung lượng với hằng số `MAX_IMPORT_BYTES = 2 * 1024 * 1024` (`2 MB`).
2) Đệ quy làm sạch mọi object bằng hàm `stripDangerousKeys` (loại bỏ `__proto__`, `constructor`, `prototype`).
3) Kiểm định cấu trúc chặt chẽ qua `ProjectFileV1Schema` và `ExperimentRecordSchema` bằng Zod trước khi nạp vào store; tuyệt đối không dùng `eval` hay `new Function`.

### Q45. Chuyện gì xảy ra nếu trình duyệt người dùng tắt IndexedDB (ví dụ chế độ ẩn danh nghiêm ngặt)?
`src/features/persistence/repository.ts` bắt lỗi khởi tạo `SystemLabDatabase` (Dexie), phát cảnh báo qua `getStorageWarning()` lên UI để người dùng biết và fallback sang lưu trữ trên bộ nhớ tạm / `localStorage` cho preferences mà không làm sập ứng dụng.

### Q46. Cách SystemLab hỗ trợ nâng cấp tương thích file JSON trong tương lai?
Mỗi file export đều gắn `SCHEMA_VERSION = 1` và đi qua hàm `migrateProjectPayload()` trước khi validate schema mới nhất, giúp mở được project export từ các phiên bản cũ hơn về sau.

---

## Chủ đề 11: Testing Strategy & QA Automation

### Q47. Kim tự tháp kiểm thử (Testing Pyramid) của SystemLab gồm những tầng nào?
1) **Unit & Analytical Tests (`tests/unit/`):** Kiểm thử PRNG, `MinHeap`, `VirtualClock`, bảo toàn request, định luật Little / M/M/1, FaultManager, Zod schema security (`stripDangerousKeys`, `2 MB` cap), và tất cả 10 built-in scenarios.
2) **Integration Tests (`tests/integration/`):** Kiểm thử `WorkerSessionRunner` / `workerClient` protocol (`runId` fencing), Dexie persistence và luồng workspace UI (`workspaceFlow.test.tsx`).
3) **E2E Tests (`tests/e2e/systemlab.spec.ts`):** Chạy trình duyệt Chrome thực bằng Playwright kiểm tra render, kịch bản, chạy mô phỏng và không có console/page error.

### Q48. Thế nào là "Analytical Test" trong `tests/unit/engine/` và vì sao unit test thông thường không đủ?
Unit test thông thường chỉ check hàm không ném lỗi; Analytical test đối chiếu kết quả thống kê của mô phỏng DES với công thức giải tích hàng đợi (ví dụ kỳ vọng latency trung bình $W = \frac{1}{\mu - \lambda}$ ở tải ổn định, hoặc kiểm chứng bất biến `generated === succeeded + failed + timedOut + inFlight` trên hàng nghìn request).

### Q49. Cách test Web Worker trong Vitest khi Node/jsdom không có native browser Web Worker thread thực?
`SimulationWorkerClient` (`src/workers/workerClient.ts`) thiết kế giao diện trừu tượng với main-thread fallback chạy cùng `WorkerSessionRunner` (`src/workers/runner.ts`). Nhờ vậy integration test `workerProtocol.test.ts` kiểm thử được chính xác giao thức `WorkerCommand`/`WorkerResponse` và logic `runId` fencing, còn E2E Playwright kiểm chứng chạy Worker thật trên Chrome.

### Q50. Tính năng `computeFairnessWarnings` trong `src/store/experimentStore.ts` giải quyết lỗi tư duy nào khi làm thí nghiệm A/B?
Nhiều người học sửa kiến trúc nhưng lại vô tình giảm RPS hoặc đổi `seed` ở lần chạy B rồi kết luận "kiến trúc B tốt hơn". `computeFairnessWarnings` so sánh metadata của Baseline và Variant B; nếu lệch seed, duration hay workload profile, UI sẽ hiện cảnh báo để tránh rút ra kết luận sai.

---

## Chủ đề 12: CI/CD, Open-Source & Maintainability

### Q51. Quy trình CI (`.github/workflows/ci.yml`) kiểm tra những bước gì?
Chạy tự động kiểm tra chất lượng code gồm: ESLint (`npm run lint`), TypeScript strict (`npm run typecheck`), bộ test Vitest (`npm run test`), production Vite build (`npm run build`) và Playwright E2E để không merge code gãy vào `main`.

### Q52. Làm thế nào build của SystemLab deploy mượt trên cả root domain lẫn subpath GitHub Pages (`/SystemLab/`)?
`vite.config.ts` đọc biến môi trường `VITE_BASE_PATH` (mặc định `/`). Workflow `.github/workflows/deploy-pages.yml` truyền subpath thích hợp khi build để toàn bộ asset JS, CSS và Web Worker chunk phân giải đúng đường dẫn, và điều này đã được kiểm chứng thực tế bằng build thử với `/SystemLab/`.

### Q53. Dự án sử dụng Vite 8 (Rolldown) và TypeScript ~5.9 — có điểm cấu hình kỹ thuật nào cần lưu ý không?
Trên Vite 8 dùng Rolldown bundler, cấu hình `manualChunks` phải viết dưới dạng hàm `(id) => string | undefined` thay vì object literal tĩnh như các phiên bản Rollup cũ. Phiên bản TypeScript được giữ ở `~5.9.3` để tương thích ổn định với `typescript-eslint`.

---

## Chủ đề 13: Trade-offs, Hạn chế & Hướng phát triển tiếp

### Q54. Trade-off lớn nhất khi chọn mô phỏng tại client (Browser + Worker) thay vì viết Simulation Backend bằng Go/Rust?
**Được:** Trải nghiệm tức thì, $0 chi phí vận hành server, privacy tuyệt đối, không network round-trip cho mọi thay đổi nhỏ. **Mất:** Bị giới hạn bởi single-thread JS worker và dung lượng RAM trình duyệt (nên phải đặt giới hạn `500_000` events và `100_000` in-flight). Nếu cần mô phỏng hàng chục triệu request phân tán liên vùng, kiến trúc đúng sẽ là giữ giao thức `WorkerCommand`/`metrics` này và chuyển engine sang Go/Rust/WASM.

### Q55. Tại sao dùng R-7 percentile trên reservoir `50_000` thay vì t-digest hay HdrHistogram?
Reservoir `50_000` mẫu (`Float64Array`/array + `SeededRng`) chỉ tốn dưới ~1 MB RAM, dễ kiểm chứng, không cần dependency ngoài bên trong `src/engine/` và tính p50/p95/p99 trong vài mili-giây khi chỉ chạy ở mỗi frame `50 ms` hoặc kết thúc phiên. Khi quy mô nâng lên hàng triệu mẫu mỗi run, có thể thay nội bộ `MetricsCollector` bằng HdrHistogram mà không cần đổi API bên ngoài.

### Q56. Hạn chế nào của SystemLab hiện tại bạn muốn ưu tiên cải thiện ở phiên bản v1.1+?
Theo `docs/ROADMAP.md` và `docs/KNOWN_LIMITATIONS.md`: (1) Hỗ trợ autoscaling policy (scale `concurrency` động theo CPU/queue depth), (2) Mô hình hóa cache LRU/LFU thực tế theo phân phối Zipfian key để minh họa hot-key problem rõ hơn, và (3) Cho phép multi-step failure loop có điều kiện dừng thay vì chỉ DAG thuần.

### Q57. Một kỹ sư khác muốn thêm loại Node thứ 11 (ví dụ `rate_limiter` hoặc `cdn`) vào SystemLab thì cần sửa ở đâu?
Theo cấu trúc modular:
1) Khai báo type và default parameters trong `src/engine/models/types.ts` và `nodeRegistry.ts`.
2) Thêm logic xử lý sự kiện tại node đó trong `src/engine/core/engine.ts` và cập nhật `validateGraph` nếu có luật kết nối riêng.
3) Thêm Zod schema trong `src/schemas/projectSchema.ts`.
4) Gắn icon/inspector form ở `ComponentIcon.tsx` / `PropertiesInspector.tsx` và viết unit test bảo toàn request.

### Q58. Nếu nhà tuyển dụng hỏi thẳng: *"Bạn có dùng AI hỗ trợ khi làm dự án này không, và bạn đóng góp giá trị kỹ thuật gì?"* — trả lời thế nào cho chuẩn mực?
*"Có, em chủ động sử dụng AI coding workflow như một công cụ tăng tốc triển khai và soạn tài liệu. Giá trị kỹ thuật em tự kiểm soát gồm: xác lập kiến trúc tách biệt `src/engine/` không DOM, thiết kế các bất biến bảo toàn request và fairness comparison, phát hiện và truy vết nguyên nhân lỗi sort reservoir khiến engine chậm, kiểm tra giới hạn bảo mật prototype pollution và tự đọc/chạy kiểm chứng toàn bộ Vitest, Benchmark và Playwright E2E trên máy."*
