# PLAN — HyperFrames Studio (web GUI gen video)

## Mục tiêu
Web tool: chọn template motion → sửa nội dung → preview live → render MP4/WebM qua HyperFrames CLI.

## Stack
- `server/` — Node 22+ ESM, Express 5, `hyperframes@0.8.153` (pin), spawn CLI `render`.
- `web/` — Vue 3 + Vite, CSS thuần với design token (light/dark).
- Root `package.json` dùng npm workspaces; `npm run dev` chạy cả hai.

## Backend
- `GET  /api/templates` — danh sách template + schema field.
- `POST /api/compose` `{templateId|html, values, aspect}` → HTML composition (preview dùng chung nguồn với render).
- `POST /api/renders` `{templateId|html, values, aspect, fps, quality, format}` → job; hàng đợi chạy 1 job/lần.
- `GET  /api/renders` — lịch sử; `GET /api/renders/:id/events` — SSE tiến độ (parse dòng `@hf-progress {json}`).
- `GET  /api/renders/:id/file` — tải file; `DELETE /api/renders/:id` — huỷ/xoá.
- `GET  /api/health` — ffmpeg + version hyperframes.
- Job lưu ở `server/data/renders/<id>/` (index.html + output + job.json).

## Template (server/src/templates)
Mỗi template: `{ id, name, summary, duration, fields[], build(values, frame) → body/css/timeline }`.
- `title-card` — headline kinetic theo chữ, subtitle, accent.
- `stat-countup` — số đếm lên + nhãn + chú thích.
- `lower-third` — tên + vai trò, thanh trượt vào.
- `feature-list` — app promo 3 tính năng lần lượt.
Tỉ lệ khung: 16:9 (1920×1080), 9:16 (1080×1920), 1:1 (1080×1080).

## Frontend
- Layout: header · [template rail | stage + transport + track ruler | inspector] · render queue.
- Preview: iframe `srcdoc` (same-origin) + shim seek: `__timelines` + ẩn/hiện `[data-start]` theo t.
- Transport: play/pause, scrub, timecode `SS:FF`, ruler hiển thị clip lane parse từ `data-start/duration`.
- Inspector: form theo schema; tab "HTML" sửa composition thô.
- Mobile: stack dọc, không scroll ngang.

## Design
- Ý tưởng: bàn dựng broadcast — chữ Archivo width rộng cho tiêu đề (gợi title card truyền hình),
  Martian Mono cho timecode, accent ultramarine + vàng playhead (burn-in timecode).
- Signature: track ruler kiểu dope-sheet — lane theo clip thật, tick theo frame, playhead vàng.
