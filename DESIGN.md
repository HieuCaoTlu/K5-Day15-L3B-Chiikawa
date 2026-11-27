# DESIGN.md — quy chuẩn giao diện (bắt buộc)

Rút từ giao diện EstateSmart (P-020). Mục tiêu: mọi người trong nhóm (và agent code của họ) làm ra màn hình trông như
**một người** vẽ. Token nằm ở `frontend/app/globals.css`, component ở `frontend/app/components.css` (`d-*`) và
`frontend/components/kit/`. Tài liệu này mô tả **luật dùng**.

## 1. Tinh thần

- **Phẳng, sáng, nhiều khoảng thở.** Nền xanh xám nhạt, thẻ trắng nổi lên bằng màu chứ không bằng viền hay bóng.
- **Chữ to, mảnh.** Tiêu đề weight 400 tracking âm; body 18px. Ít chữ, kết luận ngắn, có màu.
- **Mọi thứ bo tròn.** Thẻ 24–28px, ô nhập 12px, nút và chip bo tròn hẳn.
- **Màu có nghĩa cố định** (mục 2). Không dùng màu để trang trí.
- **Chuyển động nhẹ, có mục đích**: hiện dần khi vào màn hình, phản hồi khi rê chuột. Tắt hết khi người dùng chọn giảm chuyển động.

## 2. Màu

| Token (Tailwind) | Hex | Dùng cho |
|---|---|---|
| `page` | `#e9eff5` | Nền trang. Mọi trang đều có nền này |
| `white` | `#ffffff` | Thẻ, sidebar, ô nhập |
| `ink` | `#111a24` | Chữ chính; nút đen (`d-b-ink`); bubble người dùng trong chat |
| `muted` | `#4a5664` | Chữ phụ, mô tả, nhãn form |
| `subtle` | `#5f6b79` | Chữ mờ nhất: thời gian, chú thích, placeholder |
| `line` / `line-soft` / `line-strong` | `#d6dfe8` / `#e1e8ef` / `#c3ceda` | Đường kẻ bảng / vạch chia nhẹ / viền ô nhập, nút phụ |
| `soft` / `soft-hover` | `#f4f8fc` / `#eaf1f8` | Nền khối phụ trong thẻ, hover; bubble trợ lý |
| `pale` | `#dce8f5` | Nền chip thông tin, mục menu đang chọn, rãnh thanh tiến độ |
| `brand` / `brand-dark` | `#2c6ab0` / `#1f5a9e` | Hành động chính, link, focus. `brand-dark` cho hover và chữ trên nền `pale` |
| `go` / `go-bg` | `#2e7d5b` / `#e6f2ec` | Tốt, xong, đã duyệt, trực tuyến |
| `warn` / `warn-bg` | `#e07b3c` / `#fbebdd` | Cần chú ý, sắp vượt ngưỡng, **tin xấu** |
| `rust` | `#a34f1b` | Chữ rủi ro / lỗi trên nền `warn-bg` |
| `danger` | `#c8372d` | CHỈ nút xoá / thao tác không hoàn tác, viền ô nhập sai |

Gradient Gemini (`#2c6ab0 → #7b6fd6 → #d96570`) **chỉ** dùng trong khung chat (đang xử lý, nút gửi, chữ lấp lánh).

**Luật màu**
- Không viết mã hex trong component. Màu mới → thêm token vào `globals.css` + bảng trên.
- Tin xấu = cam (`warn`/`rust`), nói **điều kiện cần** ("cần thêm X để…", "đã dùng 85% ngân sách"), không phán quyết
  ("thất bại", "lỗ", "tệ"). Đỏ không dùng cho thông báo.
- Không dùng màu brand cho trang trí lớn (nền khối to). Brand là tín hiệu "bấm vào đây".

## 3. Chữ

| Vai trò | Font | Cỡ / weight | Class |
|---|---|---|---|
| Mọi chữ | Familjen Grotesk | body 18px / 400 | mặc định |
| Chữ thương hiệu trang trí (mặc định không dùng) | Instrument Serif, **không nghiêng** | `clamp(72px, 13vw, 200px)`, leading .82 | `font-serif` + `aria-hidden` |
| Hero landing | Grotesk | `clamp(44px, 6.4vw, 96px)` / 400 / tracking -0.04em | xem `app/page.tsx` |
| Tiêu đề section landing | Grotesk | `clamp(32px, 3.6vw, 54px)` / 400 | `.h2` |
| Tiêu đề trang ứng dụng | Grotesk | 34px / 400 / -0.02em | `.d-h1` |
| Tiêu đề thẻ | Grotesk | `text-lg` (20px) / 400 | `text-lg` |
| Nhãn nhỏ viết hoa | Grotesk | 13px / 500 / tracking 0.16em / uppercase / `muted` | `.lbl` (landing), `.d-ov` (app) |
| Số lớn (KPI) | Grotesk | 42px / 400 / -0.04em / tabular | `.d-kpi .v`, `.num` |
| Chữ phụ | | 15–16px, `muted` hoặc `subtle` | `.d-muted`, `.d-faint` |

- **Instrument Serif rất hạn chế**: chỉ cho tên thương hiệu cỡ rất lớn, đứng một mình, mang tính trang trí (tối đa
  1–2 chỗ trên toàn site). **Không** dùng trong câu, không trộn với Grotesk trong cùng dòng, không dùng `italic`, không
  dùng cho tiêu đề, nội dung, nút hay trang ứng dụng (chat/admin). Muốn nhấn một cụm trong tiêu đề → đổi màu
  (`text-brand`), không đổi font.
- Thang Tailwind đã **+2px** (`text-xs` = 14px, `text-sm` = 16px, `text-base` = 18px…). Đừng ghi đè lại.
- **Không in đậm tiêu đề.** Weight 500 chỉ cho nút, nhãn, tên trong danh sách. 600 chỉ cho logo chữ.
- Số trong bảng/KPI: `tabular-nums`.

## 4. Khoảng cách & bo góc

- Trang: padding **12px**, khoảng cách giữa thẻ/khối **12px** (`gap-3`). Landing tối đa rộng 1440px.
- Thẻ: `d-card` padding 22×24px; landing `.card` padding lớn (px-6 → px-16 theo màn hình).
- Bo góc: ô nhập / select **12px** · KPI **20px** · thẻ app **24px** · thẻ landing, khung chat **28px** · nút, chip **999px**.
- Bubble chat: người dùng `18px 18px 4px 18px` (góc nhọn dưới phải), trợ lý `18px 18px 18px 4px` (dưới trái).
- Không `box-shadow` cho thẻ. Bóng chỉ cho thứ nổi trên nội dung (modal, tooltip, nút đang chọn trong `d-seg`).

## 5. Component có sẵn — dùng trước khi tự viết

**Trang ứng dụng (chat, admin)** — `components.css` + `components/kit/`:

| Cần | Dùng |
|---|---|
| Khung admin (sidebar + tiêu đề dính) | `<Shell title actions>` — thêm mục menu trong `Shell.tsx` |
| Thẻ | `div.d-card` · lưới `d-grid4` / `d-grid2` (1.7:1) / `d-grid2e` |
| Số liệu | `<Kpi label value note change>` |
| Nút | `d-btn` + `d-b1` (chính) / `d-b2` (phụ, viền) / `d-b-ink` / `d-bgo` (duyệt) / `d-b3` (chú ý) / `d-bd` (xoá); nhỏ: `d-sm`; icon tròn: `d-ib` |
| Form | `<Field label error>` + `d-inp` / `d-sel` / `d-ta`; lỗi: `d-inp bad` |
| Chọn một trong vài | `<Seg options value onChange>` |
| Trạng thái | `<StatusChip status>` (thêm trạng thái trong bảng `STATUS` ở `ui.tsx`) hoặc `d-chip` + `d-ok`/`d-info`/`d-lock`/`d-mute`/`d-violet` |
| Bảng | `d-tbl-wrap > table.d-tbl`; dòng bấm được `tr.click`; dòng vừa thêm `tr.d-row-new` |
| Thanh tỉ lệ | `<Bars rows unit>` |
| Thông báo | `d-alert ok / err / info`; trống: `<Empty>`; đang tải: `<Loading>`; lỗi: `<ErrorBox>` |
| Hộp thoại | `<Modal title onClose>`; xác nhận: `const [node, ask] = useConfirm()` (không dùng `window.confirm`) |
| Icon | `<Icon name>` — path SVG nét 1.6 trong khung 20×20; thêm icon = thêm một dòng trong `ICONS` |
| Đề xuất AI + duyệt | `<ProposalCard run onDone>` |

**Landing** — `globals.css`: `.card`, `.btn` (+ `bg-brand text-white` / `bg-soft` / `bg-ink`), `.btn-fx` + `<span class="arrow">→</span>`,
`.lbl`, `.h2`, `.num`, `.idx`, `.nav-link`, `.site-header`, hero `word-mask > word-up`, `rise-in` (với `--d` để trễ),
`<Reveal delay>` khi cuộn, `.flow-dot` trên đường nối các bước.

**Chat** — `components/chat/`: `Sparkle`, `AgentSteps` (khối các bước đang chạy — đổi `AGENT_STEPS` cho khớp graph),
`RevealText` (hiện dần từng cụm chữ), `.gm-input.gm-busy` (viền gradient khi bận), `.send-ring` (nút gửi thành nút dừng).

## 6. Bố cục mẫu

- **Landing**: header dính 64px (trong suốt → mờ khi cuộn) · hero thẻ trắng lớn (nhãn, tiêu đề có 1 cụm serif nghiêng
  màu brand, mô tả `muted`, 1 nút brand + 1 nút soft, 3 ô số liệu `bg-soft`) · các section thẻ trắng đánh số
  `01 · Tên` · CTA nền `ink` chữ trắng · footer chữ `subtle`.
- **Chat**: thẻ trắng bo 28px cao hết màn hình · đầu: Sparkle + tên + chấm trạng thái (`go` = Gemini, `warn` = mock) ·
  màn chào: câu hỏi lớn ở giữa, "Gợi ý để bắt đầu" (nút viền, mũi tên brand), ô nhập lớn · hội thoại cuộn từ dưới lên,
  ô nhập dính đáy.
- **Admin**: sidebar trắng 248px bo 24px (nhóm menu có nhãn `d-ov`, mục đang chọn nền `pale`) · tiêu đề trang dính
  + nút hành động bên phải · hàng KPI `d-grid4` · nội dung `d-grid2`.

## 7. Chuyển động

- Easing chuẩn `cubic-bezier(0.22, 1, 0.36, 1)`; vào màn hình 0.8–0.9s; hover 0.2s; đổi trang admin `d-enter` 0.38s.
- Chỉ animate `transform` và `opacity`.
- Mọi animation mới phải có nhánh `@media (prefers-reduced-motion: reduce)` (globals.css đã tắt toàn cục; class mới
  dùng `.reveal`-kiểu thì nhớ đặt trạng thái cuối).

## 8. Chữ trên giao diện

- Tiếng Việt, câu ngắn, giọng bình thường; không emoji; không viết hoa cả câu (trừ nhãn `.lbl`/`.d-ov`).
- Nút là động từ: "Duyệt", "Thêm", "Dùng thử ngay". Trạng thái trống nói người dùng nên làm gì tiếp.
- Lỗi: nói chuyện gì xảy ra + cách sửa ("Không kết nối được máy chủ. Thử lại sau ít phút").
- Số: định dạng `vi-VN` (`fmtInt`, `fmtVnd`), tiền có đơn vị.

## 9. Checklist trước khi xong một màn hình

- [ ] Không có mã hex mới trong file `.tsx` (trừ icon SVG đã có sẵn).
- [ ] Dùng component/class có sẵn; không thêm thư viện UI/icon.
- [ ] Nền `page`, thẻ trắng không viền không bóng, gap 12px, bo góc đúng bảng mục 4.
- [ ] Chỉ một nút brand mỗi khu vực; nút pill.
- [ ] Tiêu đề weight 400; body không nhỏ hơn 15px (trừ chú thích 13–14px).
- [ ] Không có `font-serif` / `italic` (khung mặc định không dùng serif ở đâu cả).
- [ ] Không viết hoa toàn bộ tên, tiêu đề hay nút (chỉ nhãn `.lbl` / `.d-ov` được viết hoa).
- [ ] Tin xấu màu cam, có hướng xử lý.
- [ ] Ở 375px rộng: không cuộn ngang, nút bấm được (≥ 34px cao).
- [ ] Tab bàn phím thấy viền focus; ảnh/icon trang trí có `aria-hidden`.
- [ ] Bật giảm chuyển động: không còn animation.
