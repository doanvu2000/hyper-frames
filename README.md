# HyperFrames Studio

[English](README.en.md)

Ứng dụng chạy trên máy để làm video motion ngắn bằng [HyperFrames](https://github.com/heygen-com/hyperframes).
Mô tả video để Claude hoặc Codex viết, hoặc import HTML và art của bạn. Xem preview có tiếng, kéo thanh thời gian, rồi
render MP4, WebM, MOV hoặc GIF ngay trên máy.

Chạy trên **Windows** và **macOS** (Linux chạy được từ terminal).

## Cần cài

| | Windows | macOS |
|---|---|---|
| Node.js 22 trở lên | Bộ cài từ [nodejs.org](https://nodejs.org) | [nodejs.org](https://nodejs.org) hoặc `brew install node` |
| FFmpeg trong `PATH` | `winget install Gyan.FFmpeg` | `brew install ffmpeg` |
| AI để viết video (tùy chọn) | Claude CLI hoặc Codex CLI, hoặc Anthropic API key | như Windows |

Lần render đầu cần mạng: HyperFrames tải Chrome headless, và composition tải GSAP, Google Fonts từ CDN.

## Mở Studio

**Windows:** double-click **`HyperFrames Studio.cmd`**.

**macOS:** double-click **`HyperFrames Studio.command`**. Lần đầu macOS có thể chặn: chuột phải vào file, chọn
**Open**, rồi bấm **Open** lần nữa. Nếu báo file không chạy được, mở Terminal chạy một lần:

```bash
chmod +x "HyperFrames Studio.command"
```

Lần đầu sẽ cài thư viện và build giao diện (khoảng 1 phút). Các lần sau mở trong vài giây và tự mở
http://127.0.0.1:8787 trên trình duyệt. Giữ cửa sổ console/Terminal mở khi làm việc, đóng nó là tắt Studio. Sau khi
cập nhật code, mở lại launcher là Studio tự khởi động lại với bản mới.

Hoặc chạy từ terminal:

```bash
npm install
npm run dev        # API ở http://127.0.0.1:8787, giao diện hot reload ở http://localhost:5173
```

Kiểu production: `npm run build && npm start`, rồi mở http://127.0.0.1:8787.

## Lần đầu: kết nối Claude hoặc Codex

Lần đầu vào, Studio hiện bảng **Getting started** (mở lại bằng nút **?** trên thanh trên cùng). Bảng này cho biết
từng CLI đã cài và đã đăng nhập chưa, kèm lệnh để copy.

Chỉ cần một trong hai:

| | Cài | Đăng nhập |
|---|---|---|
| Claude CLI (gói Claude Pro / Max / Team) | `npm install -g @anthropic-ai/claude-code` | `claude auth login` |
| Codex CLI (gói ChatGPT) | `npm install -g @openai/codex` | `codex login` |

Cài hoặc đăng nhập xong, bấm **Check again** trong bảng hướng dẫn hoặc trong menu **AI connections**.

Không có gói nào? Chọn **API key** ở mục Model source và dán Anthropic API key. Key chỉ lưu trên máy ở
`server/data/config.json`, không gửi lên trình duyệt. Đặt biến môi trường `ANTHROPIC_API_KEY` cũng được.

## Làm video trong Studio

1. Bấm **AI & custom HTML** ở đầu panel trái.
2. Ở **Model source**, chọn **Claude CLI** hoặc **Codex CLI**.
3. Mô tả video: nội dung chữ, không khí, màu sắc, chuyển động. Chọn khung hình (Landscape ngang, Portrait dọc, Square
   vuông) và độ dài (giây).
4. Bấm **Generate**. Thường mất 10–60 giây; Claude hiện tiến trình khi đang viết, Codex trả kết quả một lần ở cuối.
5. Xem preview. Bấm Play để nghe tiếng; nút loa để tắt/bật tiếng.
6. Sửa HTML bên dưới nếu muốn, hoặc tick **Revise** rồi mô tả chỗ cần đổi.
7. Chọn định dạng ở phần **Render** bên phải và bấm **Render MP4**. File xong nằm trong tab **Renders**.

### Dùng art và âm thanh riêng

Chuẩn bị một folder có `index.html` (file tạm cũng được) và các file của bạn, ví dụ:

```
my-promo/
  index.html
  img/logo.png
  sfx/whoosh.ogg
  music/bgm.ogg
  fonts/Brand.ttf
```

Kéo thả folder vào ô **Import**, rồi bấm Generate. AI được báo danh sách file và dùng đúng đường dẫn. Nêu rõ các file
quan trọng trong prompt (“logo lấy từ img/logo.png, music/bgm.ogg âm lượng 0.4”). Âm thanh dùng thẻ
`<audio id src data-start data-duration data-track-index data-volume>`; các tiếng phát chồng nhau phải khác
`data-track-index`.

### Template

Một số template có sẵn (title card, số đếm, …) nằm trong mục **Templates** ở panel trái, mặc định gập lại. Chọn một
template để sửa trực tiếp các trường, hoặc bấm **Start from template** trong trình sửa HTML để lấy làm nền.

## Điều khiển Studio từ terminal (MCP)

Studio cũng là một MCP server, nên phiên `claude` hoặc `codex` ở bất kỳ folder nào cũng làm video được qua nó.

1. Mở **AI connections** trên thanh trên cùng (hoặc bước 3 của bảng hướng dẫn) và bấm **Add to Claude Code** hoặc
   **Add to Codex**. Thêm bằng tay:
   ```bash
   claude mcp add --scope user --transport http hyperframes-studio "http://127.0.0.1:8787/mcp?client=claude-cli"
   codex mcp add hyperframes-studio --url "http://127.0.0.1:8787/mcp?client=codex-cli"
   ```
2. Mở một phiên CLI **mới** và yêu cầu, ví dụ:
   > Use HyperFrames Studio to make a 6-second intro for my app, show it in the Studio, then render an MP4.

CLI có thể đọc hướng dẫn viết composition, điền template, xem từng frame, chạy kiểm tra, mở kết quả trong Studio (có
toast Undo) và render. Menu AI connections hiện trạng thái từng kết nối: Not connected, Ready to connect, Connected,
Calling, Running, và Rendering kèm tiến độ. Giữ Studio mở trong lúc CLI đang dùng. Phiên CLI đã mở từ trước cần khởi
động lại mới thấy Studio.

## Bố cục

Trên màn rộng (từ 1280px), kéo thanh mảnh giữa các panel để đổi độ rộng panel trái và panel Edit/Render. Double-click
thanh kéo để về mặc định; dùng bàn phím thì focus vào thanh rồi bấm mũi tên. Độ rộng được nhớ cho lần sau.

## Xử lý lỗi thường gặp

- **“FFmpeg not found”**: cài FFmpeg (xem mục Cần cài), rồi mở lại launcher.
- **CLI báo Not installed / Not signed in**: chạy lệnh cài hoặc đăng nhập trong terminal, rồi bấm Check again. Trên
  macOS nếu CLI đã cài mà Studio không thấy, hãy mở Studio bằng file `.command` (file này nạp đường dẫn Homebrew và
  nvm) hoặc chạy từ Terminal nơi `claude --version` hoạt động.
- **“An older version of the studio is still running”**: đóng cửa sổ console/Terminal cũ (hoặc tắt `node` trong Task
  Manager / Activity Monitor), rồi mở lại launcher.
- **Trình tải (IDM)**: Studio tránh để IDM bắt nhầm. Link tải kết thúc bằng tên file thật, và âm thanh preview được
  tải bằng fetch thay vì thẻ media.

## Cách hoạt động

- `server/` (Express) dựng HTML composition từ template trong `server/src/templates` và render bằng cách gọi CLI
  `hyperframes` (phiên bản cố định). Tiến độ đọc từ dòng `@hf-progress` của CLI và đẩy lên giao diện qua SSE. Mỗi lần
  render một video, kết quả lưu ở `server/data/renders/<id>/`. File import nằm ở `server/data/projects/<id>/` và được
  chép cạnh HTML mỗi lần render.
- `web/` (Vue 3 + Vite) preview cùng HTML đó trong iframe. Một shim nhỏ tua `window.__timelines` và ẩn phần tử nằm
  ngoài khoảng `data-start`/`data-duration`, giống runtime của HyperFrames. Dope sheet dưới preview đọc từ timeline
  GSAP đang chạy. Thẻ `<audio>` được phát bằng Web Audio trong cửa sổ app, khớp với đầu phát.
- CLI chạy không có tool, trong một folder tạm trống. Đổi model bằng `HF_MODEL` (API), `HF_CLAUDE_MODEL` và
  `HF_CODEX_MODEL`.
- Server chỉ nghe `127.0.0.1` vì nó render mọi HTML được gửi tới; chỉ đặt `HOST` khi ở mạng tin cậy. Đây là app chạy
  trên máy theo thiết kế: render cần Chrome headless, FFmpeg và CLI đã đăng nhập, nên không chạy trên serverless như
  Cloudflare Workers.

## Thêm template

Tạo `server/src/templates/<name>.js` export `{ id, name, summary, duration, fields, build(values, ctx) }` và đăng ký
trong `server/src/templates/index.js`. `build` trả về `{ css, body, timeline }`; code timeline thêm tween vào `tl` đang
paused. Giữ tính xác định: không dùng `Math.random()`, `Date.now()` hay fetch.
