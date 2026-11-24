# Kịch bản Live Demo 4 Phút — SystemLab

> **Mục tiêu:** Trình diễn mạch lạc trước nhà tuyển dụng, mentor hoặc giảng viên trong **3.5–4.5 phút** để chứng minh đây là công cụ mô phỏng kỹ thuật thực thụ chạy xác định, không phải đồ họa trang trí.
> **Chuẩn bị trước 30 giây:** Chạy `npm run dev` (hoặc mở bản deploy GitHub Pages), mở trình duyệt full-width ở Dark Mode, chắc chắn tab Console của DevTools sạch lỗi.

---

## 0:00 – 0:45 | Mở đầu & Kiến trúc lõi (Hook)

**Thao tác màn hình:**
- Đang ở màn hình chính `ArchitectureCanvas` của SystemLab.
- Mở **Scenario Library** (`ScenarioLibraryView`), chọn một kịch bản kinh điển có sẵn (ví dụ kịch bản **Database Bottleneck** hoặc **Cache-Aside Read Scaling**).
- Rê chuột nhanh qua thanh **Component Palette** bên trái và **Properties Inspector** bên phải.

**Lời nói gợi ý:**
> *"Chào anh/chị, đây là **SystemLab** — một playground mô phỏng hệ thống phân tán chạy hoàn toàn trên trình duyệt theo hướng local-first. Khác với các công cụ vẽ diagram tĩnh như Excalidraw, ở đây mỗi node như Load Balancer, Cache, Database hay Circuit Breaker đều được gắn mô hình hàng đợi G/G/c/K, timeout, retry và phân phối độ trễ riêng.*
> *Toàn bộ lõi mô phỏng là Discrete-Event Simulation thuần TypeScript chạy trong Web Worker với PRNG có seed, tách hoàn toàn khỏi React và DOM."*

---

## 0:45 – 2:00 | Chạy Workload & Phá hệ thống bằng Chaos Lab

**Thao tác màn hình:**
- Bấm nút **Run** trên `TopToolbar`.
- Khi đường biểu đồ ở Bottom Dock (`ChartsPanel`) bắt đầu vẽ Throughput, Latency (`p50`, `p95`, `p99`) và Error Rate, lưu baseline bằng nút **Save Experiment** trong tab **Experiments** (hoặc ghi nhớ giá trị ổn định ban đầu).
- Chuyển qua tab **Chaos Lab** (`ChaosLabPanel`), kích hoạt một sự cố trực tiếp (ví dụ **Degrade Cache Hit** hoặc **Kill/Spike Node**).
- Chỉ vào biến động ngay trên biểu đồ và các node trên Canvas.

**Lời nói gợi ý:**
> *"Khi em bấm Run, đồng hồ ảo `VirtualClock` trong Web Worker nhảy theo sự kiện trên MinHeap chứ không phụ thuộc tốc độ render màn hình — dù chỉnh phát lại 1x hay 4x, kết quả cuối cùng vẫn giống hệt nhau. Mọi request đều tuân theo bất biến bảo toàn: tổng request tạo ra luôn bằng thành công + thất bại + timeout + đang xử lý.*
> *Bây giờ em vào Chaos Lab chủ động gây suy giảm Cache hoặc tạo latency spike ở Database. Mọi người có thể thấy ngay hiệu ứng tắc nghẽn dây chuyền: queue của tầng app và database dâng lên, p95 và error rate bật tăng đồng thời trên biểu đồ thực."*

---

## 2:00 – 3:15 | Sửa kiến trúc, Chạy lại & So sánh A/B có Fairness Check

**Thao tác màn hình:**
- Tắt fault (hoặc giữ nguyên bài toán bottleneck ở kịch bản quá tải).
- Kéo thêm node `read_replica` hoặc `circuit_breaker` / `cache` từ `ComponentPalette` vào Canvas (hoặc tăng `concurrency` / bật `cache`), giữ nguyên **Seed** và **Workload**.
- Bấm **Auto Layout** (`applyDagreLayout`) cho gọn đồ thị.
- Bấm **Run**, chờ chạy xong rồi bấm **Save Experiment** thành Variant B.
- Mở tab **Experiments** (`ExperimentsPanel`), chọn so sánh **Baseline vs Variant B**.

**Lời nói gợi ý:**
> *"Thay vì đoán xem thêm Read Replica hay chỉnh timeout có hiệu quả không, em giữ nguyên Seed và Workload cũ để chạy lại Variant B. Trong tab Experiments, SystemLab tính chính xác delta giữa hai phương án về throughput, error rate và p95/p99 latency.*
> *Đặc biệt tụi em còn cài `computeFairnessWarnings`: nếu người dùng vô tình đổi Seed hay đổi thời lượng chạy giữa hai lần test, hệ thống sẽ cảnh báo ngay phép so sánh không còn công bằng."*

---

## 3:15 – 4:00 | Request Trace, An toàn Import & Kết thúc

**Thao tác màn hình:**
- Chuyển qua tab **Event Log** / mở một bản ghi trong **Request Trace** (`RequestTraceModal`) để cho thấy từng bước đi qua các node (`enqueue`, `service`, `complete` hoặc `timeout`).
- Kết thúc bằng một câu chốt về kiểm thử và kiến trúc.

**Lời nói gợi ý:**
> *"Khi bấm vào một request cụ thể, em có thể soi từng hop với timestamp chính xác tới mili-giây ảo để tìm đúng nguyên nhân request chết ở đâu.*
> *Về mặt kỹ thuật, trong quá trình phát triển em từng tối ưu một nút thắt khiến engine giảm từ vượt timeout 5 giây xuống chạy 100.000 request trong khoảng 0.85 giây, phủ unit/analytical/integration test với Vitest và E2E Chrome thực bằng Playwright, đồng thời chặn prototype pollution khi import file JSON. Em rất sẵn sàng trao đổi sâu hơn về phần `SimulationEngine` hoặc Web Worker fencing nếu anh/chị quan tâm!"*

---

## Mẹo xử lý tình huống bất ngờ khi Demo

1. **Nếu mạng chậm hoặc không mở được link deploy:** Chạy trực tiếp bản local (`npm run dev` hoặc `npm run preview`) — toàn bộ ứng dụng local-first không gọi API mạng nên hoạt động 100% offline.
2. **Nếu lỡ tạo chu trình (cycle) khi kéo dây nối trực tiếp trước mặt người phỏng vấn:** Đừng hoảng! Hãy chỉ ngay vào thông báo lỗi DAG Validation: *"Đây chính là lớp bảo vệ đầu tiên dùng thuật toán Kahn chặn chu trình HTTP trước khi đẩy vào Worker."*
3. **Nếu câu hỏi đi sâu vào giới hạn mô hình:** Thừa nhận thẳng thắn cache hiện tại là probabilistic model và chưa có dynamic autoscaler (đã ghi rõ trong `docs/KNOWN_LIMITATIONS.md`).
