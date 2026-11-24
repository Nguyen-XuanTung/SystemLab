# Báo cáo Kiểm toán Độc lập & Phát hành — SystemLab (`FINAL_RELEASE_REPORT.md`)

**Phiên bản đóng băng:** `v1.0.0` (`package.json` / `package-lock.json`)  
**Ngày cập nhật:** 2026-11-25  
**Nhánh Git:** `main` (kiểm toán từ baseline `f60aaa3`)  
**Môi trường kiểm chứng cục bộ:** Windows 11 (`win32/x64`), Node `v24.14.0`, Playwright (`chrome` & `msedge`)

---

## 1. Trạng thái Phát hành (Release Decision)

- **Trạng thái chính thức:** **`CONDITIONAL PASS — EXTERNAL VERIFICATION PENDING`**
- **Lý do minh bạch:** Toàn bộ kiểm toán mã nguồn độc lập, các bản vá lõi DES (`src/engine/`), Worker/Schema/Store/UI, bộ test mở rộng (`15` file / `67` tests), E2E trên Chrome & Edge Chromium (`4/4` luồng), clean install `npm ci`, kiểm thử live `/SystemLab/` subpath Web Worker, benchmark đa lần chạy, rà soát license/bảo mật và đối chiếu tài liệu đều đã **PASS tại máy cục bộ**. Dự án mang điều kiện **external verification pending** vì 4 hạng mục ngoài phạm vi máy local chưa thể tự hoàn tất trước khi push: (1) GitHub Actions hosted runner (`ci.yml` / `deploy-pages.yml`), (2) URL GitHub Pages trực tuyến, (3) kiểm thử chéo trên Firefox và Safari WebKit (`NOT RUN` do chưa cài trên host Windows), và (4) chủ sở hữu xác nhận cuối cho `LICENSE` / thông tin author trong lịch sử commit cũ.

> Chi tiết đầy đủ 16 phát hiện (AUD-01..16), mức độ nghiêm trọng, nguyên nhân gốc, thay đổi đã áp dụng và bảng so sánh trước/sau nằm tại [`INDEPENDENT_RELEASE_AUDIT.md`](INDEPENDENT_RELEASE_AUDIT.md).

---

## 2. Tóm tắt Sản phẩm & Giá trị Kỹ thuật

**SystemLab** (_Design. Simulate. Break. Understand._) là sân chơi mô phỏng thiết kế hệ thống (System Design) và hệ phân tán theo hướng **local-first, privacy-first, deterministic**:

- Kéo thả và nối dây 10 loại thành phần hạ tầng (`client`, `load_balancer`, `api_gateway`, `app_server`, `cache`, `database`, `message_queue`, `worker`, `circuit_breaker`, `read_replica`).
- Nạp nhanh 10 kịch bản chuẩn (`BUILT_IN_SCENARIOS`), học thuật ngữ qua 16 khái niệm (`SYSTEM_DESIGN_GLOSSARY`) và hướng dẫn 4 bước (`GuidedTutorial`).
- Chạy mô phỏng với biểu đồ chuỗi thời gian (`Recharts`), nhật ký sự kiện giới hạn bộ nhớ, theo dõi hành trình request từng hop (`RequestTraceModal`), tiêm lỗi chủ động/định kỳ (`ChaosLabPanel`), và so sánh thí nghiệm (`ExperimentsPanel`) kèm cảnh báo công bằng (`computeFairnessWarnings`).

---

## 3. Các Bất biến Kỹ thuật & Sửa lỗi Kiểm toán v1.0.0

1. **Cách ly tuyệt đối `src/engine/`:** Pure TypeScript, không React, không DOM, không IndexedDB, không Zustand, không `Math.random()`.
2. **Xác định tuyệt đối & Cô lập Epoch:**
   - `SeededRng` (`SplitMix32` → `xoshiro128**`), `VirtualClock`, `MinHeap<T>` và `(timestampMs, priority, sequence)`.
   - Bổ sung `cbEpoch` & `requestCbContexts` (tránh completion cũ làm hỏng probe `HALF_OPEN` và truyền lỗi từ CB hạ nguồn lên CB thượng nguồn), `nodeEpoch` & `activeRequestIds` hủy job/cache hợp lệ khi `node_failure`, khôi phục `mqJobs` khi `edge_failure` kết thúc, và tách logic bật/hết hạn `traffic_spike`.
3. **Bảo toàn Request & Telemetry Trung thực:**
   - Giữ chặt $\text{generated} = \text{succeeded} + \text{failed} + \text{timedOut} + \text{inFlight}$ trên mọi kịch bản và nhiều seed đa dạng.
   - Các node không có capacity pool (`client`, `load_balancer`, `api_gateway`, `cache`, `circuit_breaker`) hiển thị `—` thay vì `0%` Util giả; `worker` ghi nhận đúng `jobMeanLatencyMs` và kẹp `busyWorkerMs` theo effective capacity khi `capacity_drop`.
4. **Worker, Schema & Storage:**
   - Giữ trạng thái `paused` khi `RECOVER_FAULT` lúc đang tạm dừng; cho phép `step()` khôi phục từ `halted_safety`.
   - Giới hạn độ sâu JSON `MAX_JSON_DEPTH = 64` trong `stripDangerousKeys()`, siết `NodeMetricsSchema` (loại `z.any()`), hủy `autosaveTimer` khi xóa project đang mở, và đồng bộ xóa `experimentStore` khi reset dữ liệu.

---

## 4. Ma trận Kiểm chứng Cuối cùng (Post-Audit v1.0.0)

| Hạng mục kiểm tra                             | Lệnh thực thi                                | Kết quả quan sát                                | Phạm vi & Ghi chú                                                                                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ESLint & Engine Purity**                    | `npm run lint`                               | **PASS** (0 errors/warnings)                    | Kiểm tra `src/`, `tests/`, `scripts/`, quy tắc cô lập `src/engine/`                                                                                                                                                       |
| **Prettier Format Check**                     | `npm run format:check`                       | **PASS** (sửa từ FAIL 43 files)                 | Kiểm tra `"src/**/*.{ts,tsx,css}"` & `"tests/**/*.{ts,tsx}"`                                                                                                                                                              |
| **Strict TypeScript**                         | `npm run typecheck`                          | **PASS** (0 errors)                             | `tsc --noEmit`                                                                                                                                                                                                            |
| **Unit, Analytical, Invariant & Integration** | `npm run test:coverage`                      | **PASS** (**15 files, 67/67 tests**)            | Bao phủ Tests A–H, invariant 10 seed đa dạng, schema depth, worker/persistence integration                                                                                                                                |
| **V8 Coverage Scope**                         | `npm run test:coverage`                      | **PASS** (thresholds met)                       | **Tổng (`src/engine/`, `schemas/`, `scenarios/`):** `91.43%` stmts, `82.40%` branches, `97.48%` funcs, `94.68%` lines · **Riêng `src/engine/**/*.ts`:** `91.35%` stmts, `82.62%` branches, `98.29%` funcs, `94.75%` lines |
| **End-to-End (Google Chrome)**                | `npm run test:e2e`                           | **PASS** (**4/4 tests**, 0 console/page errors) | Architecture CRUD/wiring/undo, Simulation+Chaos+Experiments, Export/Import/Reset, Quota Fallback+Worker                                                                                                                   |
| **End-to-End (Edge Chromium)**                | `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e` | **PASS** (**4/4 tests**, 0 console/page errors) | Toàn bộ 4 luồng E2E trên `vite preview`                                                                                                                                                                                   |
| **End-to-End (Firefox / WebKit)**             | —                                            | **NOT RUN**                                     | Runtime Firefox & Safari WebKit không có trên máy Windows cục bộ                                                                                                                                                          |
| **Clean Install & `/SystemLab/` Live Worker** | `npm ci` + `VITE_BASE_PATH=/SystemLab/`      | **PASS** (11 HTTP `200`, 0 errors)              | Chạy thực trên Chrome từ thư mục sạch: Worker ES module, `./logo.svg`, `./favicon.svg`, `Conservation:`                                                                                                                   |

_(Lưu ý về phạm vi coverage trong `vitest.config.ts`: `src/workers/`, `src/store/`, `src/features/persistence/`, `src/lib/` và UI components không nằm trong `coverage.include`, mà được kiểm chứng qua `workerProtocol.test.ts`, `persistence.test.ts`, `workspaceFlow.test.tsx` và 4 luồng Playwright E2E.)_

---

## 5. Kết quả Benchmark Kiểm soát (`npm run benchmark`)

Đo trên **Node `v24.14.0` · `win32/x64`**, **1 warmup + 5 lần lặp tính giờ / mỗi kịch bản**, dùng các seed phân biệt (`42`, `101`, `202`, `303`, `404`, `505`).  
_(Ghi chú: `DES Throughput (events/sec)` là tốc độ xử lý sự kiện rời rạc trong bộ nhớ Node; `Virtual Workload (sim req/s)` là mật độ tải trong thời gian mô phỏng — **không phải hiệu năng HTTP production**.)_

| Kịch bản Benchmark                         | Nodes / Edges | Seed  | Median Wall (Min–Max, IQR)                | DES Throughput | Virtual Workload  | Conserved |
| ------------------------------------------ | ------------- | ----- | ----------------------------------------- | -------------- | ----------------- | --------- |
| `1k requests · small 2-node`               | 2 / 1         | `42`  | **5.40 ms** (4.15–6.64, IQR 1.56)         | 703,459 ev/s   | 99.6 sim req/s    | `true`    |
| `10k requests · 3-tier medium`             | 6 / 6         | `101` | **58.95 ms** (55.88–74.76, IQR 8.10)      | 1,209,870 ev/s | 1,011.2 sim req/s | `true`    |
| `100k requests · 3-tier stretch (40s)`     | 6 / 6         | `202` | **709.34 ms** (524.59–914.56, IQR 155.84) | 1,023,249 ev/s | 2,506.5 sim req/s | `true`    |
| `25-node large topology · 5k requests`     | 25 / 43       | `303` | **30.59 ms** (29.67–38.46, IQR 3.44)      | 1,331,976 ev/s | 501.9 sim req/s   | `true`    |
| `Failure & recovery · 10k requests`        | 6 / 6         | `404` | **58.45 ms** (53.14–71.27, IQR 6.36)      | 1,209,309 ev/s | 1,001.6 sim req/s | `true`    |
| `Queue saturation overload · 10k requests` | 6 / 6         | `505` | **38.67 ms** (33.36–47.59, IQR 7.14)      | 1,137,449 ev/s | 1,990.8 sim req/s | `true`    |

- **Kiểm tra dọn dẹp `WorkerSessionRunner` (`20 x 5,000` requests):** `774.53 ms` tổng thời gian, `heapDeltaMb: -6.74 MB`, `allConserved: true`.

---

## 6. Bảo mật, License, CI & Vệ sinh Repository

- **`npm audit`:** `0` lỗ hổng (kiểm tra trong clean install `358` packages).
- **License inventory (`348` packages):** Toàn bộ là permissive (`MIT`, `ISC`, `Apache-2.0`, `BSD`, `BlueOak-1.0.0`, `CC-BY-4.0`, `0BSD`) + 2 build package `MPL-2.0` (`lightningcss@1.33.0`, `lightningcss-win32-x64-msvc@1.33.0`); không có GPL/AGPL.
- **Quét tĩnh (`121` file deliverable + toàn bộ `git log --all -p`):** `0` secrets, `0` đường dẫn máy cá nhân, `0` `eval`/`new Function`/`dangerouslySetInnerHTML`, `0` `fetch`/`XHR`/`WebSocket`, `0` `Math.random()` trong `src/engine/`, `0` file `.ai-local/` tracked.
- **GitHub Actions Permissions:** `.github/workflows/ci.yml` thiết lập `permissions: { contents: read }` kèm bước `npm run format:check`; `.github/workflows/deploy-pages.yml` giới hạn `pages: write` / `id-token: write` chỉ tại job `deploy`.

---

## 7. Giao diện, Responsive & Chỉ mục Tài liệu

- **Ảnh chụp mới (`docs/assets/*.png`):** `workspace-overview.png`, `monitoring-charts.png`, `experiment-comparison.png`, `chaos-lab-fault.png` đã được chụp lại sau sửa lỗi contrast & telemetry.
- **Responsive Viewports:** Kiểm tra `1920x1080`, `1440x900`, `1366x768`, `1024x768` (gồm `SettingsDialog` với Seed & Horizon) và Mobile `390x844` — không overflow ngang, điều hướng bàn phím & contrast đạt WCAG AA.
- **Release Notes:** Xem [`docs/RELEASE_NOTES_v1.0.0.md`](docs/RELEASE_NOTES_v1.0.0.md) và [`CHANGELOG.md`](CHANGELOG.md).

---

## 8. Các Bước Hoàn tất Xuất bản GitHub (Chủ sở hữu thực hiện)

1. Kiểm tra lại thông tin tác giả/bản quyền trong [`LICENSE`](LICENSE) (`Copyright (c) 2026 Nguyen Xuan Tung`), [`SECURITY.md`](SECURITY.md) và lịch sử commit cũ trước khi đẩy public.
2. Push lên GitHub (chưa gắn tag v1.0.0 ngay):
   ```bash
   git remote add origin https://github.com/<your-username>/SystemLab.git
   git push -u origin main
   ```
3. Mở **Actions** kiểm tra `ci.yml` pass trên Linux runner, bật **Settings → Pages → Source → GitHub Actions**, rồi kiểm tra trực tiếp URL công khai trên Chrome/Firefox/Safari.
4. Chỉ sau khi CI và GitHub Pages công khai hoạt động hoàn chỉnh, gắn và đẩy tag phát hành:
   ```bash
   git tag -a v1.0.0 -m "Release SystemLab v1.0.0"
   git push origin v1.0.0
   ```
