# PLAN — HyperFrames Studio v2: thiết kế lại UI + tính năng mới (2026-10-29)

## Hiện trạng (tóm tắt)
- Vue 3 + Vite (`web/`), Express 5 + `hyperframes@0.8.153` (`server/`), MCP endpoint, Claude/Codex CLI generate.
- UI v1: macOS-style, system font, accent xanh `#007aff`, stage trái + panel phải (tab Chỉnh sửa / Bản render),
  template + AI ở header, dope sheet dưới preview, render panel dính đáy panel phải.
- Vấn đề UI: panel phải ôm quá nhiều (AI form + ví dụ prompt + HTML + import + render) → phải cuộn, ví dụ prompt bị cắt;
  accent xanh hệ thống trông "mặc định"; timeline chỉ rộng bằng stage; không có tên/khái niệm project; nút Play
  đè lên chữ trong preview; footer chiếm chỗ.
- Bug thấy khi đọc: `web/src/App.vue:316-317` — 2 dòng `const volume = ref(readVolume()); sound.setVolume(...)` lọt vào
  trong `toggleMute()` (shadow biến `volume`, reset volume mỗi lần mute).

## Design system đề xuất — "Edit bay"
Chủ đề: phòng dựng video. Màn hình chương trình (program monitor) là nhân vật chính; mọi thứ xung quanh lùi về graphite
trung tính. Một ngôn ngữ trạng thái duy nhất mượn từ đèn tally phòng quay: **hổ phách = thời gian / thao tác chính**,
**đỏ tally = đang render / live**, **xanh tally = sẵn sàng**. Bỏ xanh dương hệ thống.

| Token | Dark | Light | Vai trò |
|---|---|---|---|
| `--bay` | `#141517` | `#E9E9EC` | nền app |
| `--deck` | `#1C1D20` | `#FFFFFF` | panel |
| `--deck-2` | `#25262A` | `#F4F4F6` | control, hàng hover |
| `--ink` / `--ink-2` | `#ECEDEF` / `#9B9DA4` | `#1B1C1F` / `#61636B` | chữ |
| `--amber` | `#F5B83D` | `#B97800` (chữ) / `#F5B83D` (fill) | playhead, nút chính, focus |
| `--tally` | `#FF4D3D` | `#D92A1C` | đang render, record, lỗi nặng |
| `--go` | `#3DDC84` | `#1E8E4E` | sẵn sàng / kết nối |
| `--well` | `#0A0A0B` | `#0A0A0B` | monitor + timeline luôn tối |

- Chữ: giữ system font cho UI (offline, đủ tiếng Việt — quyết định ở commit aa298ad). Timecode/frame dùng mono
  `tabular-nums` — chỉ ở timecode, không rải mono cho label.
- Radius phân cấp: monitor 4px (khung máy), panel 10px, control 7px, chip 999px.
- Motion: 160–220ms ease-out, chỉ cho phản hồi thao tác (mở drawer, đổi tab, toast). `prefers-reduced-motion` tắt hết.
- Điểm nhấn duy nhất: **playhead hổ phách + timecode lớn** chạy xuyên monitor ↔ timeline.

## Ràng buộc chủ nhân chốt khi duyệt mockup
- **Vừa khít viewport:** app = `100vw × 100dvh`, `body` không cuộn ngang/dọc ở mọi kích thước desktop. Preview fit
  2 chiều bằng container query (`min(100cqw, 100cqh * ratio)`); rail + inspector cao hết; timeline dưới preview, lane
  chia đều chiều cao; list phiên bản chỉ hiện số dòng vừa chỗ (column-wrap) + "Xem tất cả"; màn thấp thì gọn bớt
  (ẩn ví dụ prompt < 780px, thu textarea < 720px). Mobile: preview 28dvh, inspector chiếm phần giữa, rail ở đáy,
  timeline sau nút bật.
- **Dropdown theo design system:** không dùng `<select>` gốc. Một component `Dropdown` (trigger giữ style của thanh
  chứa nó; popover `--deck`, radius `--r-pop` 10px, item 32px, tick hổ phách cho mục chọn, nhóm + gợi ý phím tắt, mở
  lên trên khi nằm ở transport). Bàn phím: ↑↓ Home End, Enter chọn, Esc đóng và trả focus. Dùng cho: lớp phủ safe
  area, thu phóng, tốc độ, menu kết nối AI, menu project.

## Layout đề xuất (NLE 3 vùng)
```
┌ Brand · [Tên project ▾] · ↶ ↷ ·················· ● AI 2 sẵn sàng · ◉ Render 42% · ? · ☾ · [Xuất video] ┐
├──┬──────────────────────────────────────────────┬───────────────────────┤
│✦ │                                              │ Inspector theo ngữ    │
│▤ │            PROGRAM MONITOR (hero)            │ cảnh: AI prompt /     │
│▣ │        safe-area overlay · zoom fit          │ field template /      │
│⇣ │                                              │ HTML / asset          │
│⟲ │ 00:02:00  ▶  ⏮ ⏭  1×  🔁 in–out   1920×1080 │                       │
├──┴──────────────────────────────────────────────┴───────────────────────┤
│ TIMELINE full width: ruler · lane clip · lane audio · marker · in/out   │
└──────────────────────────────────────────────────────────────────────────┘
```
- Rail trái (icon + tooltip + label khi mở): Tạo bằng AI · Template · Asset · Bản render · Lịch sử.
- "Xuất video" là CTA chính duy nhất ở topbar → mở sheet render (định dạng, fps, chất lượng, nhiều tỉ lệ).
- Mobile (<768): monitor trên, timeline gập, rail thành bottom bar 5 mục, inspector thành sheet.

## Tính năng gợi ý (chờ chủ nhân chọn)
A. **Project library** — lưu nhiều composition trên server (tên, thumbnail, duplicate, xoá) thay draft localStorage đơn.
B. **Lịch sử phiên bản AI + Undo/Redo** — mỗi Generate/Revise/sửa HTML là 1 snapshot, so sánh A/B, khôi phục.
C. **Xuất nhiều biến thể** — 1 lần bấm render 16:9 + 9:16 + 1:1 và/hoặc nhiều định dạng; render đoạn in–out.
D. **Batch từ CSV** — template + bảng dữ liệu → hàng loạt video (tên, số liệu…).
E. **Code editor xịn** — CodeMirror 6 (highlight, fold, tìm/thay), lỗi `check_composition` hiện ngay dòng.
F. **Công cụ preview** — safe-area overlay (title safe, khung UI TikTok/Reels/Shorts), tốc độ 0.25–2×, loop in–out,
   J/K/L, marker, chụp frame PNG.
G. **Brand kit** — màu/font/logo lưu sẵn, áp vào template và tự gửi kèm prompt AI.
H. **Command palette (Ctrl+K) + bảng phím tắt.**
I. **Template mới** — logo reveal, end card, caption/subtitle, countdown.
J. **Thông báo render xong** (Notification API) + mở thư mục chứa file.

**Chủ nhân đã chọn (2026-10-29):** A+B (project + lịch sử/undo), F (công cụ preview), C+J (xuất nhiều biến thể +
thông báo), E+H (CodeMirror + Ctrl+K). Duyệt UI qua mockup tĩnh `.planning/mockup-v2.html` trước khi sửa code thật.

## Thứ tự làm (sau khi chốt)
1. Fix bug `toggleMute`.
2. Token + layout shell mới (topbar, rail, monitor, timeline full width, inspector, export sheet) — giữ nguyên logic.
3. Tính năng đã chọn, mỗi cái 1 commit.
4. i18n vi/en cho chuỗi mới; cập nhật README + screenshot.

## Tiến độ (2026-10-29)
- [x] Server: `library.js` (project + version, ghi atomic, tối đa 60 bản), `/api/library*`, render `range` (cắt bằng
  ffmpeg sau render), `/api/snapshot` (PNG), `/api/check`; MCP `render_video` nhận `range`.
- [x] Web shell mới: `TopBar`, `ProjectMenu`, `ConnectionsMenu` (Popover), `Rail`, `MonitorBar`, `Transport`,
  `DopeSheet` (in–out, marker, lane audio), inspector theo panel, `ExportSheet`, `CommandPalette`.
- [x] Component dùng chung `Popover` + `Dropdown` (thay mọi `<select>`), `CodeEditor` (CodeMirror 6) + `CodePanel`
  (lint nhanh `lib/lintComposition.js` + check server), `VersionList`, `TemplatePanel`, `AssetPanel`.
- [x] Composable: `useHistory` (undo/redo), `useLibrary` (autosave, version), `usePlayback` (tốc độ, J/K/L, loop).
- [x] `styles.css` viết lại theo token "Edit bay"; chuỗi mới ở `lib/messages-studio.js` (vi + en).
- [x] Fix bug `toggleMute` khai báo lại `volume` (App.vue viết lại).
- [x] README vi/en: project, lịch sử, công cụ preview, xuất nhiều bản, phím tắt.
- [ ] Chủ nhân chạy thử (`npm run dev`) + chụp lại `docs/screenshots/*` theo UI mới.
- [ ] Chưa làm: "mở thư mục chứa file" sau render (cần endpoint spawn explorer/Finder).
- [x] Review đọc code (2026-10-29), đã sửa: tạo project mới ghi đè project cũ (`library.detach()`), compose template
  về muộn đè HTML, lưu cũ về muộn đánh dấu sai project mới, palette/Export mở trong fullscreen (thoát fullscreen),
  seek poster theo duration cũ, redo bỏ mất thao tác đang gõ, lưu khi đóng tab (`keepalive`), boot tạo "Untitled"
  thừa khi mạng chập, Esc của Export sheet, `e.key` undefined.
