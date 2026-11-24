# Báo cáo Kiểm toán Độc lập & Phát hành — SystemLab (`FINAL_RELEASE_REPORT.md`)

**Ngày lập báo cáo:** 2026-11-24  
**Nhánh Git:** `main`  
**Môi trường kiểm chứng:** Windows 11 (`win32/x64`), Node `v24.14.0`, npm `11.9.0`, Git `2.54.0`, Google Chrome (`@playwright/test` `channel: 'chrome'`)

---

## 1. Trạng thái Phát hành (Release Status)

- **Trạng thái chính thức:** **`RELEASE READY — LOCAL VERIFIED`**
- **Giải thích trung thực:** Toàn bộ mã nguồn, lõi mô phỏng DES, giao diện React Flow, bộ kiểm thử tự động (Unit, Analytical, Integration, Chrome E2E), benchmark hiệu năng, build production (cả root `/` lẫn subpath `/SystemLab/`), kiểm tra bảo mật `npm audit` và bộ tài liệu mở đều đã được **kiểm chứng trực tiếp tại máy cục bộ và vượt qua 100%**. Dự án **chưa gắn nhãn `FULLY VERIFIED PUBLIC RELEASE`** vì chưa được chủ sở hữu push lên GitHub remote, chưa chạy trên GitHub Actions hosted runner và chưa kiểm tra URL GitHub Pages công khai trực tuyến.

---

## 2. Tóm tắt Sản phẩm & Giá trị Kỹ thuật

**SystemLab** (*Design. Simulate. Break. Understand.*) là sân chơi mô phỏng thiết kế hệ thống (System Design) và hệ phân tán theo hướng **local-first, privacy-first, deterministic**:
- Kéo thả và nối dây 10 loại thành phần hạ tầng thực thụ (`client`, `load_balancer`, `api_gateway`, `app_server`, `cache`, `database`, `message_queue`, `worker`, `circuit_breaker`, `read_replica`).
- Nạp nhanh 10 kịch bản chuẩn (`BUILT_IN_SCENARIOS`), học thuật ngữ qua 16 khái niệm (`SYSTEM_DESIGN_GLOSSARY`) và hướng dẫn 4 bước (`GuidedTutorial`).
- Chạy mô phỏng workload với biểu đồ chuỗi thời gian (`Recharts`), nhật ký sự kiện giới hạn bộ nhớ, theo dõi hành trình request từng hop (`RequestTraceModal`), tiêm lỗi chủ động (`ChaosLabPanel`), và so sánh thí nghiệm Baseline vs Variant B (`ExperimentsPanel`) kèm cảnh báo sai lệch điều kiện thử (`computeFairnessWarnings`).

---

## 3. Kiến trúc & Các Bất biến Cốt lõi

1. **Cách ly tuyệt đối `src/engine/`:** 100% Pure TypeScript, không React, không DOM (`window`, `document`), không IndexedDB, không Zustand và không gọi `Math.random()`.
2. **Xác định tuyệt đối (`Determinism`):**
   - `SeededRng` (`src/engine/random/prng.ts`): mở rộng seed bằng `SplitMix32` → `xoshiro128**` kèm `.fork()`.
   - `VirtualClock` (`src/engine/core/clock.ts`) + `MinHeap<T>` (`src/engine/core/minHeap.ts`) + bộ phá hòa 3 cấp `compareSimEvents` (`timestampMs` → `EVENT_PRIORITY` → `sequence`). Chỉnh tốc độ phát lại UI không bao giờ làm sai lệch kết quả.
3. **Bất biến bảo toàn Request Logic:**
   $$\text{generated} = \text{succeeded} + \text{failed} + \text{timedOut} + \text{inFlight}$$
   Mỗi request chỉ đi tới tối đa một trạng thái kết thúc; retry giữ chung `requestId` gốc; job bất đồng bộ qua `message_queue` → `worker` tách biệt khỏi bộ đếm HTTP.
4. **Chạy nền Web Worker & Chặn gói tin cũ (`WorkerSessionRunner` + `runId` fencing):**
   - `src/workers/workerClient.ts` gắn `currentRunId` tăng đơn điệu để vứt bỏ frame trễ từ lần chạy trước, có fallback đồng bộ trên main thread nếu môi trường không có Worker.
   - Giới hạn an toàn động cơ (`DEFAULT_SAFETY_LIMITS`): `maxEvents: 500_000`, `maxZeroTimeEvents: 10_000`, `maxHops: 64`, `maxInFlight: 100_000`, cùng reservoir bounded memory (`50_000` mẫu latency, R-7 quantile `computeR7Percentile`).
5. **An toàn Dữ liệu & Lưu trữ Local:**
   - `src/schemas/projectSchema.ts` áp dụng `MAX_IMPORT_BYTES = 2 * 1024 * 1024` (`2 MB`), `stripDangerousKeys` (loại `__proto__`, `constructor`, `prototype`) và Zod `ProjectFileV1Schema` (`SCHEMA_VERSION = 1`).
   - Lưu trữ IndexedDB via Dexie (`SystemLabDatabase`) kèm fallback cảnh báo khi trình duyệt khóa IndexedDB.

---

## 4. Ma trận Kiểm chứng Tự động (M15 Fresh Sweep)

| Hạng mục kiểm tra | Lệnh thực thi | Kết quả quan sát trực tiếp | Chi tiết phạm vi |
|---|---|---|---|
| **ESLint & Engine Purity** | `npm run lint` | **PASS** (exit `0`, 0 errors/warnings) | Kiểm tra React Hooks, TypeScript rules & rule cô lập `src/engine/` |
| **Strict TypeScript** | `npm run typecheck` | **PASS** (exit `0`) | `tsc --noEmit` toàn bộ workspace `src/`, `tests/`, `scripts/` |
| **Unit, Analytical & Integration + Coverage** | `npm run test:coverage` | **PASS** (`14` test files, `57/57` tests passed, `6.27s`) | **V8 Coverage:** `90.8%` Statements, `81.94%` Branches, `97.44%` Functions, `94.25%` Lines |
| **End-to-End Browser Suite** | `npm run test:e2e` | **PASS** (`1/1` passed, `3.1s` test / `6.5s` total) | Chrome thực (`channel: 'chrome'`): kịch bản, run/pause/resume, Chaos Lab, Experiment compare, export/import, reload persistence |
| **Subpath Production Build (Pages)** | `$env:VITE_BASE_PATH='/SystemLab/'; npm run build` | **PASS** (`built in 1.00s`) | `dist/index.html` tham chiếu chuẩn `/SystemLab/assets/...`; `simulation.worker-BHw9O67k.js` bundled |
| **Default Production Build (`/`)** | `npm run build` | **PASS** (`built in 786ms`) | `dist/` tạo đầy đủ HTML, CSS, JS chunks & Web Worker bundle |

---

## 5. Kết quả Benchmark M15 (`npm run benchmark`)

Đo trực tiếp trên **Node `v24.14.0` · `win32/x64`**, seed `42`:

| Kịch bản Benchmark | Nodes / Edges | Horizon (ms) | Wall Time (ms) | Generated | Succeeded | Failed | TimedOut | Events Processed | Throughput (events/sec) | Heap Delta (MB) | Conserved |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `1k requests · small 2-node` | 2 / 1 | 10000 | **14.98** | 996 | 985 | 11 | 0 | 3,801 | 253,798 | +1.42 | `true` |
| `10k requests · 3-tier medium (6 nodes)` | 6 / 6 | 10000 | **88.75** | 10,147 | 10,040 | 107 | 0 | 71,554 | 806,278 | +8.02 | `true` |
| `100k requests · 3-tier stretch (6 nodes)` | 6 / 6 | 40000 | **853.15** | 100,127 | 99,088 | 1,039 | 0 | 724,610 | 849,339 | +41.63 | `true` |
| `25-node large topology · 5k requests` | 25 / 43 | 10000 | **43.64** | 4,981 | 4,981 | 0 | 0 | 40,406 | 925,985 | -19.65 | `true` |
| `Failure & recovery · 10k requests` | 6 / 6 | 10000 | **77.24** | 10,114 | 10,008 | 106 | 0 | 71,400 | 924,388 | +4.28 | `true` |
| `Queue saturation overload · 10k requests` | 6 / 6 | 5000 | **47.08** | 10,040 | 2,784 | 7,256 | 0 | 44,724 | 949,956 | +39.49 | `true` |

*(Ghi chú: Giá trị Heap Delta âm ở case 25-node phản ánh Garbage Collector của V8 dọn bộ nhớ giữa các phép đo tuần tự; 6/6 kịch bản đều giữ `conserved: true`.)*

---

## 6. Đánh giá Bảo mật, Quyền riêng tư & Vệ sinh Repository

| Hạng mục Audit | Kết quả quan sát | Chi tiết |
|---|---|---|
| **Dependency Vulnerabilities (`npm audit`)** | **PASS** (`found 0 vulnerabilities`) | Không có lỗ hổng nào trong 356 packages |
| **Local AI Tracking Isolation (`git ls-files .ai-local`)** | **PASS** (`0` files tracked) | Thư mục `.ai-local/` được exclude sạch khỏi Git |
| **Unsafe Dynamic JS (`eval`, `new Function`, `dangerouslySetInnerHTML`)** | **PASS** (`0` hits) | Không có điểm chèn mã nguy hiểm trong `src/` |
| **Engine PRNG Purity (`Math.random` in `src/engine/`)** | **PASS** (`0` calls) | Lần khớp grep duy nhất là dòng JSDoc comment ở `src/engine/random/prng.ts:5` (`never calls Math.random()`) |
| **Secret / Personal Path Hygiene** | **PASS** (`0` real leaks) | `ENV_SECRET_REFS=0`; không có username cục bộ, email cá nhân hay API key; kết quả regex duy nhất là chuỗi minh họa chung trong `docs/verification/SECURITY_REVIEW.md:25` |

---

## 7. Kiểm chứng Giao diện, Ảnh chụp & Accessibility

- **Ảnh chụp màn hình thực từ Playwright Chrome (`docs/assets/`):**
  - `workspace-overview.png`, `monitoring-charts.png`, `experiment-comparison.png`, `chaos-lab-fault.png` đã được tạo và kiểm tra trực quan sạch lỗi render/tràn chữ.
- **Responsive & Theme:** Đã tinh chỉnh và kiểm tra bố cục trên Desktop, Tablet (`1024x768`), Mobile (`390x844`), cả **Dark mode** và **Light mode** dùng CSS custom properties `var(--sl-*)`.
- **Accessibility & UX:** Toàn bộ nút điều khiển có label rõ ràng, vòng focus bàn phím, hỗ trợ `prefers-reduced-motion`, undo/redo 50 bước, và hiển thị `—` khi số mẫu = `0`.

---

## 8. Chỉ mục Tài liệu, CI/CD, Portfolio & Học tập

- **Gốc Repository:** `README.md`, `LICENSE` (MIT), `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, `AGENTS.md`
- **CI/CD Workflows:** `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`
- **Kiến trúc & ADR:** `docs/architecture/{PRD,ARCHITECTURE,SIMULATION_ENGINE,DATA_MODEL}.md`, `docs/research/PRODUCT_RESEARCH.md`, `docs/adr/ADR-001..009`
- **Hướng dẫn sử dụng & vận hành:** `docs/guides/{USER_GUIDE,DEVELOPER_GUIDE,DEPLOYMENT_GUIDE,SCENARIO_AUTHORING}.md`, `docs/ROADMAP.md`, `docs/KNOWN_LIMITATIONS.md`
- **Báo cáo kiểm chứng:** `docs/verification/{SIMULATION_VALIDATION,TEST_REPORT,PERFORMANCE_REPORT,SECURITY_REVIEW}.md`
- **Gói Portfolio & Tự học (Tiếng Việt):**
  - `docs/portfolio/PORTFOLIO_GUIDE_VI.md` — Hướng dẫn trình bày CV, mô tả dự án, phỏng vấn, GitHub setup
  - `docs/learning/UNDERSTAND_SYSTEMLAB_VI.md` — Giải phẫu codebase từ lõi DES đến React UI + 6 bài tập tự code
  - `docs/learning/INTERVIEW_QA_VI.md` — 58 câu hỏi-đáp phỏng vấn theo 13 chủ đề
  - `docs/learning/DEMO_SCRIPT_VI.md` — Kịch bản live demo 4 phút

---

## 9. Giới hạn Mô hình & Phạm vi Chưa Kiểm chứng Thực địa

1. **Giới hạn mô phỏng (đã ghi rõ trong `docs/KNOWN_LIMITATIONS.md`):**
   - Chỉ hỗ trợ đồ thị DAG cho luồng HTTP (thuật toán Kahn chặn cycle).
   - Mô hình cache mang tính xác suất (`cacheHitRatio` ± suy giảm fault), chưa mô phỏng LRU/LFU hay key hotspot Zipfian.
   - Chưa mô phỏng autoscaling động, BFT/consensus (Raft/Paxos) hay băng thông/TCP congestion thực.
   - Công cụ phục vụ học tập và thực nghiệm khái niệm, **không thay thế load testing production**.
2. **Phạm vi hạ tầng chưa chạy:**
   - Bộ E2E chỉ mới chạy trên Google Chrome cục bộ; chưa test chéo trên Firefox và Safari WebKit.
   - Workflow `.github/workflows/ci.yml` và `.github/workflows/deploy-pages.yml` chưa từng chạy trên GitHub Actions runner thật do repo hiện mới tồn tại ở local.

---

## 10. Các Xác nhận Cần Chủ Sở hữu Quyết định Trước khi Public Release

1. **Tên chủ sở hữu bản quyền trong `LICENSE`:** Hiện đang ghi `Nguyen Xuan Tung` (lấy từ `git config user.name`). Vui lòng rà soát lại chính tả/năm trước khi đẩy public.
2. **Kênh báo lỗi bảo mật trong `SECURITY.md`:** Kiểm tra xem bạn muốn nhận báo lỗi qua **GitHub Security Advisories** (mặc định an toàn, không lộ email cá nhân) hay bổ sung thêm một địa chỉ email phụ chuyên cho open-source.
3. **Tên Repository & Biến `VITE_BASE_PATH`:** Nếu tạo repo trên GitHub tên là `SystemLab` dưới tài khoản cá nhân, giữ nguyên `VITE_BASE_PATH="/SystemLab/"` khi deploy Pages (đã verify build). Nếu dùng tên khác hoặc custom domain, cập nhật biến tương ứng trong workflow Pages.

---

## 11. Checklist Xuất bản Lên GitHub & GitHub Pages

1. Kiểm tra lại `LICENSE` và `SECURITY.md`.
2. Tạo repository mới trên GitHub (ví dụ `<username>/SystemLab`).
3. Chạy các lệnh đẩy mã nguồn:
   ```bash
   git remote add origin https://github.com/<your-username>/SystemLab.git
   git push -u origin main
   ```
4. Vào tab **Actions** trên GitHub xác nhận workflow `ci.yml` pass trên cloud runner.
5. Vào **Settings → Pages → Build and deployment → Source → GitHub Actions**, sau đó chạy/theo dõi `deploy-pages.yml` và mở URL công khai để kiểm tra trực tiếp.
6. Ghim repository lên GitHub Profile và gắn các topics gợi ý trong `docs/portfolio/PORTFOLIO_GUIDE_VI.md`.

---

## 12. Lịch sử Commit & Kết luận Bàn giao

Các mốc commit đã hoàn thiện trên nhánh `main` (commit cuối phát hành sẽ thêm ngay sau báo cáo này):
- `e6a42bd` — Khởi tạo workspace, nghiên cứu & tài liệu PRD
- `70af79c` — Toolchain Vite/React/TS, tokens thiết kế & tài liệu kiến trúc + 9 ADRs
- `81712cb` — Lõi mô phỏng DES thuần TypeScript & kiểm chứng giải tích
- `8761412` — Tối ưu hiệu năng $O(1)$ counters cho vòng lặp DES
- `d5d60da` — Schema bảo mật Zod, lưu trữ Dexie, 10 kịch bản & 16 thuật ngữ
- `6612e0a` — Web Worker protocol, `runId` fencing & Zustand stores
- `0d619f2` — Canvas Editor (`@xyflow/react`), palette, custom nodes & edges
- `9f2199f` — Inspector, Monitoring charts, Chaos Lab, Experiment Studio & Scenario views
- `06a9e95` — Tinh chỉnh UI responsive, sửa race condition hydrate & chụp ảnh màn hình
- `3675567` — RTL integration tests, Playwright E2E, benchmarks & verification reports
- `bb6849e` — Tài liệu open-source, CI/Pages workflows, portfolio & learning guides

**Kết luận:** SystemLab đã hoàn tất đầy đủ 16 milestone (M00–M15), đạt mọi tiêu chí kỹ thuật, hiệu năng, bảo mật và tài liệu hóa ở trạng thái **`RELEASE READY — LOCAL VERIFIED`**, sẵn sàng để chủ sở hữu rà soát thông tin cá nhân và xuất bản lên GitHub.
